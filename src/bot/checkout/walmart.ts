import { Page } from 'playwright';
import type { Task, Profile } from '../../types';
import { BaseCheckout, LogFn } from './base';
import { sleep, humanClick } from '../stealth/stealth';

export class WalmartCheckout extends BaseCheckout {
  constructor(page: Page, task: Task, profile: Profile, log: LogFn) {
    super(page, task, profile, log);
  }

  async run(): Promise<void> {
    await this.goto(this.task.product_url!);
    await this.addToCart();
    await this.proceedToCheckout();
    await this.fillShipping();
    await this.continueToPayment();
    await this.fillPayment();
    await this.submitOrder();
  }

  // ── Step 1: Add to Cart ──────────────────────────────────────────────────

  private async addToCart(): Promise<void> {
    this.log('info', 'Waiting for ATC button');

    const atcSelector = '[data-automation-id="add-to-cart-btn"], button:has-text("Add to cart")';
    await this.waitFor(atcSelector, 20_000);

    // Select size if configured
    if (this.task.size) {
      await this.selectSize();
    }

    // Select quantity
    if (this.task.quantity > 1) {
      await this.setQuantity(this.task.quantity);
    }

    await this.click(atcSelector);
    this.log('info', 'Clicked Add to Cart');

    // Wait for cart drawer / confirmation
    await this.page.waitForSelector(
      '[data-automation-id="cart-count"], .cart-drawer, [data-testid="item-added"]',
      { state: 'visible', timeout: 15_000 }
    ).catch(() => this.log('warn', 'Cart confirmation not detected — continuing anyway'));
  }

  private async selectSize(): Promise<void> {
    this.log('info', `Selecting size: ${this.task.size}`);
    try {
      const sizeBtn = this.page.locator(`[data-value="${this.task.size}"], button:has-text("${this.task.size}")`).first();
      await sizeBtn.waitFor({ state: 'visible', timeout: 5000 });
      await humanClick(this.page, `[data-value="${this.task.size}"]`);
      await sleep(500);
    } catch {
      this.log('warn', `Could not select size ${this.task.size}`);
    }
  }

  private async setQuantity(qty: number): Promise<void> {
    this.log('info', `Setting quantity to ${qty}`);
    try {
      const qtySelector = '[data-automation-id="quantity-input"], input[name="quantity"]';
      await this.page.locator(qtySelector).first().fill(String(qty));
      await sleep(300);
    } catch {
      this.log('warn', 'Could not set quantity');
    }
  }

  // ── Step 2: Proceed to Checkout ──────────────────────────────────────────

  private async proceedToCheckout(): Promise<void> {
    this.log('info', 'Navigating to cart');
    await this.goto('https://www.walmart.com/cart');
    await sleep(1500);

    // Click checkout button
    const checkoutBtn = '[data-automation-id="checkout-btn"], button:has-text("Check out"), a:has-text("Check out")';
    await this.waitFor(checkoutBtn, 15_000);
    await this.click(checkoutBtn);
    this.log('info', 'Clicked checkout');

    // Wait for checkout page
    await this.page.waitForURL('**/checkout**', { timeout: 20_000 });
    await sleep(1000);
  }

  // ── Step 3: Shipping ─────────────────────────────────────────────────────

  protected async fillShippingForm(
    firstName: string, lastName: string, address: string,
    city: string, state: string, zip: string,
  ): Promise<void> {
    this.log('info', 'Filling shipping form');

    // Walmart checkout may already have saved addresses — look for "Add new address" or form
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

    // State dropdown
    try {
      await this.page.locator('select[name="state"], select[id*="state"]').first().selectOption(state);
    } catch { this.log('warn', 'Could not select state'); }

    await sleep(500);

    // Phone (optional)
    if (this.profile.phone) {
      await this.fillIfVisible('input[name="phone"], input[id*="phone"]', this.profile.phone);
    }

    // Continue button
    const continueBtn = 'button:has-text("Continue"), button:has-text("Save & continue")';
    await this.waitFor(continueBtn, 10_000);
    await this.click(continueBtn);
    await sleep(1500);
  }

  private async continueToPayment(): Promise<void> {
    this.log('info', 'Proceeding to payment');
    // Walmart checkout flow continues after shipping
    // Wait for delivery options if present
    const deliveryOpt = this.page.locator('button:has-text("Continue"), [data-automation-id="continue-btn"]').first();
    if (await deliveryOpt.isVisible().catch(() => false)) {
      await humanClick(this.page, 'button:has-text("Continue")');
      await sleep(1200);
    }
  }

  // ── Step 4: Payment ──────────────────────────────────────────────────────

  protected async fillPaymentForm(
    name: string, number: string, expiry: string, cvv: string,
  ): Promise<void> {
    this.log('info', 'Filling payment form');

    // Walmart may use an iframe for card entry
    const cardFrame = this.page.frameLocator('iframe[title*="credit"], iframe[title*="card"], iframe[id*="payment"]').first();

    try {
      // Try iframe first
      await cardFrame.locator('input[name="number"], input[id*="cardNumber"]').waitFor({ timeout: 5000 });
      await cardFrame.locator('input[name="number"], input[id*="cardNumber"]').fill(number);
      await cardFrame.locator('input[name="expiry"], input[id*="expDate"]').fill(expiry);
      await cardFrame.locator('input[name="cvc"],    input[id*="cvv"]').fill(cvv);
    } catch {
      // Direct inputs
      await this.fillIfVisible('input[name="creditCardNumber"], input[id*="creditCardNumber"]', number);
      await this.fillIfVisible('input[name="expirationDate"],   input[id*="expiryDate"]',       expiry);
      await this.fillIfVisible('input[name="cvv"],              input[id*="cvv"]',               cvv);
    }

    await this.fillIfVisible('input[name="cardholderName"], input[id*="cardName"]', name);

    await sleep(500);

    // Billing address checkbox
    const billingSame = this.page.locator('input[type="checkbox"][name*="billing"]').first();
    if (await billingSame.isVisible().catch(() => false)) {
      const checked = await billingSame.isChecked();
      if (!checked && this.profile.billing_same_as_shipping) {
        await billingSame.check();
      }
    }

    await sleep(300);
    const reviewBtn = 'button:has-text("Review order"), button:has-text("Continue")';
    await this.waitFor(reviewBtn, 10_000);
    await this.click(reviewBtn);
    await sleep(1500);
  }

  // ── Step 5: Place Order ──────────────────────────────────────────────────

  private async submitOrder(): Promise<void> {
    this.log('info', 'Reviewing and placing order');
    await this.screenshot('review-page');

    const placeOrderBtn = 'button:has-text("Place order"), button:has-text("Submit order")';
    await this.waitFor(placeOrderBtn, 15_000);
    await this.click(placeOrderBtn);

    // Confirm success
    await this.page.waitForURL('**/thank-you**', { timeout: 30_000 });
    this.log('success', 'Order placed! Thank-you page reached.');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async fillIfVisible(selector: string, value: string): Promise<void> {
    const parts = selector.split(',').map(s => s.trim());
    for (const sel of parts) {
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
