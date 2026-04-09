import { Page } from 'playwright';
import type { Task, Profile } from '../../types';
import { BaseCheckout, LogFn } from './base';
import { sleep, humanClick } from '../stealth/stealth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the numeric SKU from a Walmart URL or return the input if it's
 * already a bare SKU.
 *
 * Handles:
 *   https://www.walmart.com/ip/Product-Name/165545420   → 165545420
 *   https://www.walmart.com/ip/d/165545420              → 165545420
 *   https://www.walmart.com/ip/165545420                → 165545420
 *   165545420 (bare SKU)                                → 165545420
 */
export function extractWalmartSku(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  try {
    const url  = new URL(trimmed);
    // /ip/Product-Name/SKU  or  /ip/d/SKU  or  /ip/SKU
    const match = url.pathname.match(/\/ip\/(?:[^/]+\/)?(\d+)/);
    if (match) return match[1];
  } catch { /* not a valid URL — fall through */ }

  return trimmed; // Unknown format — pass through
}

// ─── Error classification ─────────────────────────────────────────────────────

type WalmartError =
  | 'px_captcha'          // PerimeterX bot challenge
  | 'block_456'           // 456 session block
  | 'invalid_address'     // shipping address rejected
  | 'invalid_card'        // card authorization failed
  | 'oos'                 // out of stock at checkout time
  | 'unknown';

function classifyError(text: string): WalmartError {
  const t = text.toLowerCase();
  if (t.includes('access denied') || t.includes('px') || t.includes('captcha') ||
      t.includes('are you a human'))                             return 'px_captcha';
  if (t.includes('456'))                                        return 'block_456';
  if (t.includes('invalid address') || t.includes('address'))  return 'invalid_address';
  if (t.includes('invalid') && (t.includes('card') || t.includes('payment') ||
      t.includes('credit')))                                    return 'invalid_card';
  if (t.includes('out of stock') || t.includes('unavailable')) return 'oos';
  return 'unknown';
}

// ─── Checkout module ──────────────────────────────────────────────────────────

export class WalmartCheckout extends BaseCheckout {
  constructor(page: Page, task: Task, profile: Profile, log: LogFn) {
    super(page, task, profile, log);
  }

  async run(): Promise<void> {
    const sku = extractWalmartSku(this.task.product_url ?? '');
    this.log('info', `Walmart checkout | SKU: ${sku} | OID: ${this.task.offer_id ?? 'none'} | skipMon: ${this.task.skip_monitoring}`);

    await this.goto(`https://www.walmart.com/ip/${sku}`);
    await this.checkForPxBlock();
    await this.selectVariant();
    await this.addToCart();
    await this.proceedToCheckout();
    await this.fillShipping();
    await this.continueToPayment();
    await this.fillPayment();
    await this.submitOrder();
  }

  // ── PX / bot-challenge detection ─────────────────────────────────────────

  private async checkForPxBlock(): Promise<void> {
    const title = await this.page.title();
    const body  = await this.page.evaluate(() => document.body.innerText).catch(() => '');

    const err = classifyError(title + ' ' + body);
    if (err === 'px_captcha') {
      throw new Error('PX captcha / bot challenge detected — rotate proxy and retry');
    }
    if (err === 'block_456') {
      throw new Error('456 block — session flagged, rotate proxy or re-login');
    }
  }

  // ── Variant selection ─────────────────────────────────────────────────────

  private async selectVariant(): Promise<void> {
    if (!this.task.size) return;
    this.log('info', `Selecting variant: ${this.task.size}`);
    try {
      const btn = this.page.locator(`[data-value="${this.task.size}"], button[aria-label*="${this.task.size}"]`).first();
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await humanClick(this.page, `[data-value="${this.task.size}"]`);
      await sleep(500);
    } catch {
      this.log('warn', `Could not select size ${this.task.size}`);
    }
  }

  // ── Add to Cart ───────────────────────────────────────────────────────────

  private async addToCart(): Promise<void> {
    this.log('info', 'Waiting for ATC button');

    // If an Offer ID is set, target that specific seller's offer first
    if (this.task.offer_id) {
      await this.selectOffer(this.task.offer_id);
    }

    // Set quantity
    if (this.task.quantity > 1) {
      await this.setQuantity(this.task.quantity);
    }

    // Click ATC — try data-automation-id="atc" first (current Walmart), then fallbacks
    const atcSelectors = [
      '[data-automation-id="atc"]',
      '[data-automation-id="add-to-cart-btn"]',
      'button:has-text("Add to cart")',
    ];

    let clicked = false;
    for (const sel of atcSelectors) {
      try {
        const btn = this.page.locator(sel).first();
        await btn.waitFor({ state: 'visible', timeout: 5000 });
        const disabled = await btn.getAttribute('disabled');
        if (disabled !== null) continue;
        await humanClick(this.page, sel);
        clicked = true;
        this.log('info', `Clicked ATC (${sel})`);
        break;
      } catch { /* try next selector */ }
    }

    if (!clicked) throw new Error('Add to Cart button not found or disabled');

    // Wait for cart confirmation
    await this.page.waitForSelector(
      '[data-automation-id="cart-count"], .cart-drawer, [data-testid="item-added"]',
      { state: 'visible', timeout: 15_000 }
    ).catch(() => this.log('warn', 'Cart confirmation not detected — continuing anyway'));

    await sleep(800);
  }

  /**
   * When an Offer ID is provided, find and click the matching seller offer
   * on the product page before adding to cart.
   */
  private async selectOffer(oid: string): Promise<void> {
    this.log('info', `Selecting offer ID: ${oid}`);
    try {
      // Walmart surfaces seller offers in a "More sellers" / "Other sellers" section
      const offerBtn = this.page.locator(`[data-offer-id="${oid}"], [data-id="${oid}"]`).first();
      if (await offerBtn.isVisible().catch(() => false)) {
        await offerBtn.click();
        await sleep(500);
        return;
      }
      this.log('warn', `Offer ID ${oid} not found on page — proceeding with default offer`);
    } catch {
      this.log('warn', 'Could not select specific offer — using default');
    }
  }

  private async setQuantity(qty: number): Promise<void> {
    try {
      const sel = 'input[name="quantity"], [data-automation-id="quantity-input"]';
      await this.page.locator(sel).first().fill(String(qty));
      await sleep(300);
    } catch {
      this.log('warn', 'Could not set quantity');
    }
  }

  // ── Proceed to Checkout ───────────────────────────────────────────────────

  private async proceedToCheckout(): Promise<void> {
    this.log('info', 'Navigating to cart');
    await this.goto('https://www.walmart.com/cart');
    await sleep(1500);

    await this.checkForPxBlock();

    // Find checkout button via evaluate — Walmart changes automation IDs frequently
    const clicked = await this.page.evaluate(() => {
      const autoIds = ['checkout-btn', 'proceed-to-checkout', 'cart-checkout-button'];
      for (const id of autoIds) {
        const el = document.querySelector(`[data-automation-id="${id}"]`) as HTMLButtonElement | null;
        if (el && !el.disabled) { el.click(); return id; }
      }
      // Fall back to any button/link whose text contains "checkout"
      const all = Array.from(document.querySelectorAll('button, a'));
      const btn = all.find(el => {
        const text = (el.textContent ?? '').toLowerCase().trim();
        return text.includes('check out') || text === 'checkout';
      }) as HTMLButtonElement | HTMLAnchorElement | undefined;
      if (btn) { (btn as HTMLElement).click(); return 'text-match'; }
      return null;
    });

    if (!clicked) {
      // Last resort: log page HTML snippet and throw
      const html = await this.page.evaluate(() =>
        document.body.innerHTML.slice(0, 3000)
      ).catch(() => '');
      this.log('warn', `Cart page snippet: ${html}`);
      throw new Error('Checkout button not found on cart page');
    }

    this.log('info', `Clicked checkout (${clicked})`);

    await this.page.waitForURL('**/checkout**', { timeout: 20_000 });
    await sleep(1000);
    await this.checkForPxBlock();
  }

  // ── Shipping ──────────────────────────────────────────────────────────────

  protected async fillShippingForm(
    firstName: string, lastName: string, address: string,
    city: string, state: string, zip: string,
  ): Promise<void> {
    this.log('info', 'Filling shipping form');

    const newAddrBtn = this.page.locator('button:has-text("Add a new address"), button:has-text("Use a different address")').first();
    if (await newAddrBtn.isVisible().catch(() => false)) {
      await humanClick(this.page, 'button:has-text("Add a new address")');
      await sleep(800);
    }

    await this.fillIfVisible('input[name="firstName"], input[id*="firstName"]', firstName);
    await this.fillIfVisible('input[name="lastName"],  input[id*="lastName"]',  lastName);
    await this.fillIfVisible('input[name="addressLineOne"], input[id*="address1"]', address);
    await this.fillIfVisible('input[name="city"],      input[id*="city"]',      city);
    await this.fillIfVisible('input[name="postalCode"], input[id*="zipCode"], input[id*="zip"]', zip);

    try {
      await this.page.locator('select[name="state"], select[id*="state"]').first().selectOption(state);
    } catch { this.log('warn', 'Could not select state'); }

    if (this.profile.phone) {
      await this.fillIfVisible('input[name="phone"], input[id*="phone"]', this.profile.phone);
    }

    await sleep(400);
    const continueBtn = 'button:has-text("Continue"), button:has-text("Save & continue")';
    await this.waitFor(continueBtn, 10_000);
    await this.click(continueBtn);
    await sleep(1500);

    // Detect address rejection
    const pageText = await this.page.evaluate(() => document.body.innerText).catch(() => '');
    if (classifyError(pageText) === 'invalid_address') {
      throw new Error('Invalid address — check profile shipping details');
    }
  }

  private async continueToPayment(): Promise<void> {
    const deliveryContinue = this.page.locator('button:has-text("Continue"), [data-automation-id="continue-btn"]').first();
    if (await deliveryContinue.isVisible().catch(() => false)) {
      await humanClick(this.page, 'button:has-text("Continue")');
      await sleep(1200);
    }
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  protected async fillPaymentForm(
    name: string, number: string, expiry: string, cvv: string,
  ): Promise<void> {
    this.log('info', 'Filling payment form');

    const cardFrame = this.page.frameLocator('iframe[title*="credit"], iframe[title*="card"], iframe[id*="payment"]').first();

    try {
      await cardFrame.locator('input[name="number"], input[id*="cardNumber"]').waitFor({ timeout: 5000 });
      await cardFrame.locator('input[name="number"], input[id*="cardNumber"]').fill(number);
      await cardFrame.locator('input[name="expiry"], input[id*="expDate"]').fill(expiry);
      await cardFrame.locator('input[name="cvc"],    input[id*="cvv"]').fill(cvv);
    } catch {
      await this.fillIfVisible('input[name="creditCardNumber"], input[id*="creditCardNumber"]', number);
      await this.fillIfVisible('input[name="expirationDate"],   input[id*="expiryDate"]',       expiry);
      await this.fillIfVisible('input[name="cvv"],              input[id*="cvv"]',               cvv);
    }

    await this.fillIfVisible('input[name="cardholderName"], input[id*="cardName"]', name);

    await sleep(400);

    const billingSame = this.page.locator('input[type="checkbox"][name*="billing"]').first();
    if (await billingSame.isVisible().catch(() => false)) {
      if (this.profile.billing_same_as_shipping && !(await billingSame.isChecked())) {
        await billingSame.check();
      }
    }

    await sleep(300);
    const reviewBtn = 'button:has-text("Review order"), button:has-text("Continue")';
    await this.waitFor(reviewBtn, 10_000);
    await this.click(reviewBtn);
    await sleep(1500);

    // Detect card rejection
    const pageText = await this.page.evaluate(() => document.body.innerText).catch(() => '');
    if (classifyError(pageText) === 'invalid_card') {
      throw new Error(
        'Card rejected by Walmart — too many auth attempts on this card, or card details incorrect. ' +
        'Let the card cool off (bank-level block) and retry.'
      );
    }
  }

  // ── Place Order ───────────────────────────────────────────────────────────

  private async submitOrder(): Promise<void> {
    this.log('info', 'Reviewing and placing order');
    await this.screenshot('walmart-review');

    const placeOrderBtn = 'button:has-text("Place order"), button:has-text("Submit order")';
    await this.waitFor(placeOrderBtn, 15_000);
    await this.click(placeOrderBtn);

    // Final error check before success
    try {
      await this.page.waitForURL('**/thank-you**', { timeout: 30_000 });
      this.log('success', 'Order placed! Thank-you page reached.');
    } catch {
      const pageText = await this.page.evaluate(() => document.body.innerText).catch(() => '');
      const errType  = classifyError(pageText);
      if (errType === 'invalid_card')    throw new Error('Card rejected at order submission');
      if (errType === 'invalid_address') throw new Error('Address rejected at order submission');
      if (errType === 'px_captcha')      throw new Error('PX block at order submission — rotate proxy');
      throw new Error('Order submission failed — did not reach thank-you page');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async fillIfVisible(selector: string, value: string): Promise<void> {
    for (const sel of selector.split(',').map(s => s.trim())) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.fill(value);
          await sleep(200);
          return;
        }
      } catch { /* try next */ }
    }
    this.log('warn', `Could not fill: ${selector}`);
  }
}
