import { Page } from 'playwright';
import type { Task, Profile } from '../../types';
import { BaseCheckout, LogFn } from './base';
import { sleep, humanClick } from '../stealth/stealth';

export class TargetCheckout extends BaseCheckout {
  constructor(page: Page, task: Task, profile: Profile, log: LogFn) {
    super(page, task, profile, log);
  }

  async run(): Promise<void> {
    await this.goto(this.task.product_url!);
    await this.handleQueueIfPresent();
    await this.selectVariant();
    await this.addToCart();
    await this.proceedToCheckout();
    await this.fillShipping();
    await this.fillPayment();
    await this.submitOrder();
  }

  // ── Handle Target queue/waiting room ────────────────────────────────────

  private async handleQueueIfPresent(): Promise<void> {
    const isQueue = await this.page.locator('[id*="queue"], [class*="queue"], [data-test*="queue"]')
      .first().isVisible().catch(() => false);

    if (!isQueue) return;

    this.log('info', 'Target queue detected — waiting for admission');

    // Poll until we get past the queue (up to 10 min)
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const stillQueued = await this.page.locator('[id*="queue"]').first().isVisible().catch(() => false);
      if (!stillQueued) {
        this.log('info', 'Exited Target queue');
        return;
      }
      await sleep(5000);
    }
    this.log('warn', 'Timed out waiting for Target queue');
  }

  private async selectVariant(): Promise<void> {
    if (!this.task.size) return;
    this.log('info', `Selecting variant/size: ${this.task.size}`);
    try {
      const btn = this.page.locator(`button[aria-label*="${this.task.size}"], [data-value="${this.task.size}"]`).first();
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await humanClick(this.page, `button[aria-label*="${this.task.size}"]`);
      await sleep(600);
    } catch {
      this.log('warn', `Could not select variant ${this.task.size}`);
    }
  }

  private async addToCart(): Promise<void> {
    this.log('info', 'Adding to cart');
    const atcSel = '[data-test="shippingOrderButton"], button:has-text("Add to cart")';
    await this.waitFor(atcSel, 15_000);
    await this.click(atcSel);
    await sleep(1500);

    // Dismiss cart modal if present
    const cartModal = this.page.locator('[data-test="cartModal"], [aria-label*="cart"]').first();
    if (await cartModal.isVisible().catch(() => false)) {
      const viewCart = this.page.locator('button:has-text("View cart & check out"), a:has-text("View cart")').first();
      await humanClick(this.page, 'button:has-text("View cart & check out")').catch(() => {});
    }
  }

  private async proceedToCheckout(): Promise<void> {
    await this.goto('https://www.target.com/cart');
    await sleep(1500);

    const checkoutBtn = 'button:has-text("Check out"), a[data-test="checkout-button"]';
    await this.waitFor(checkoutBtn, 15_000);
    await this.click(checkoutBtn);
    await this.page.waitForURL('**/checkout**', { timeout: 20_000 });
    await sleep(1000);
  }

  protected async fillShippingForm(
    firstName: string, lastName: string, address: string,
    city: string, state: string, zip: string,
  ): Promise<void> {
    this.log('info', 'Filling Target shipping form');

    await this.fillField('[data-test="fname"]', firstName);
    await this.fillField('[data-test="lname"]', lastName);
    await this.fillField('[data-test="address1"]', address);
    await this.fillField('[data-test="city"]', city);
    await this.fillField('[data-test="zip"]', zip);

    try {
      await this.page.locator('[data-test="state"]').first().selectOption(state);
    } catch {
      this.log('warn', 'Could not select state');
    }

    if (this.profile.phone) {
      await this.fillField('[data-test="phone"]', this.profile.phone);
    }

    await sleep(400);
    const saveBtn = 'button:has-text("Save & continue"), button:has-text("Continue")';
    await this.waitFor(saveBtn, 10_000);
    await this.click(saveBtn);
    await sleep(1500);
  }

  protected async fillPaymentForm(
    name: string, number: string, expiry: string, cvv: string,
  ): Promise<void> {
    this.log('info', 'Filling Target payment');

    // Target uses iframes for card fields
    const numFrame = this.page.frameLocator('iframe[id*="credit-card-number"], iframe[title*="card number"]');
    const expFrame = this.page.frameLocator('iframe[id*="exp-date"],          iframe[title*="expir"]');
    const cvvFrame = this.page.frameLocator('iframe[id*="cvv"],               iframe[title*="security code"]');

    try {
      await numFrame.locator('input').fill(number);
      await expFrame.locator('input').fill(expiry);
      await cvvFrame.locator('input').fill(cvv);
    } catch {
      // Fallback to direct inputs
      await this.fillField('[data-test="cardNumber"]',  number);
      await this.fillField('[data-test="expiryDate"]',  expiry);
      await this.fillField('[data-test="cvv"]',         cvv);
    }

    await this.fillField('[data-test="cardName"], input[name="nameOnCard"]', name);

    await sleep(400);
    const saveBtn = 'button:has-text("Save & continue"), button:has-text("Continue")';
    await this.waitFor(saveBtn, 10_000);
    await this.click(saveBtn);
    await sleep(1200);
  }

  private async submitOrder(): Promise<void> {
    this.log('info', 'Placing Target order');
    await this.screenshot('target-review');

    const placeBtn = 'button:has-text("Place your order"), button[data-test="placeOrderButton"]';
    await this.waitFor(placeBtn, 15_000);
    await this.click(placeBtn);

    await this.page.waitForURL('**/order-confirmation**', { timeout: 30_000 });
    this.log('success', 'Target order placed!');
  }

  private async fillField(selector: string, value: string): Promise<void> {
    const parts = selector.split(',').map(s => s.trim());
    for (const sel of parts) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.fill(value);
          await sleep(150);
          return;
        }
      } catch { /* try next */ }
    }
  }
}
