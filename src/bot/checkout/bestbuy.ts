import { Page } from 'playwright';
import type { Task, Profile } from '../../types';
import { BaseCheckout, LogFn } from './base';
import { sleep } from '../stealth/stealth';

export class BestBuyCheckout extends BaseCheckout {
  constructor(page: Page, task: Task, profile: Profile, log: LogFn) {
    super(page, task, profile, log);
  }

  async run(): Promise<void> {
    await this.goto(this.task.product_url!);
    await this.addToCart();
    await this.proceedToCheckout();
    await this.fillShipping();
    await this.fillPayment();
    await this.submitOrder();
  }

  private async addToCart(): Promise<void> {
    this.log('info', 'Adding to cart on Best Buy');

    const atcSel = '.fulfillment-add-to-cart-button button, button.btn-primary:has-text("Add to Cart")';
    await this.waitFor(atcSel, 15_000);

    if (this.task.size) {
      await this.selectSize();
    }

    await this.click(atcSel);
    await sleep(1500);

    // Dismiss accessories upsell modal
    const skipBtn = this.page.locator('button:has-text("No, thanks"), button:has-text("Continue without protection plan")').first();
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
      await sleep(500);
    }

    this.log('info', 'Added to cart');
  }

  private async selectSize(): Promise<void> {
    this.log('info', `Selecting size: ${this.task.size}`);
    try {
      const btn = this.page.locator(`button[data-sku-id], [aria-label*="${this.task.size}"]`).first();
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await btn.click();
      await sleep(600);
    } catch {
      this.log('warn', `Could not select size ${this.task.size}`);
    }
  }

  private async proceedToCheckout(): Promise<void> {
    await this.goto('https://www.bestbuy.com/cart');
    await sleep(1200);

    const checkoutBtn = 'button:has-text("Checkout"), a.checkout-buttons__checkout';
    await this.waitFor(checkoutBtn, 15_000);
    await this.click(checkoutBtn);
    await this.page.waitForURL('**/checkout/**', { timeout: 20_000 });
    await sleep(1000);
  }

  protected async fillShippingForm(
    firstName: string, lastName: string, address: string,
    city: string, state: string, zip: string,
  ): Promise<void> {
    this.log('info', 'Filling Best Buy shipping form');

    await this.fillField('input[id="consolidatedAddressFirstName"], input[name*="firstName"]', firstName);
    await this.fillField('input[id="consolidatedAddressLastName"],  input[name*="lastName"]',  lastName);
    await this.fillField('input[id="consolidatedAddressStreet"],    input[name*="address1"]',  address);
    await this.fillField('input[id="consolidatedAddressCity"],      input[name*="city"]',      city);
    await this.fillField('input[id="consolidatedAddressZipCode"],   input[name*="zip"]',       zip);

    try {
      await this.page.locator('select[id="consolidatedAddressState"], select[name*="state"]').first().selectOption(state);
    } catch {
      this.log('warn', 'Could not select state');
    }

    if (this.profile.phone) {
      await this.fillField('input[id="phone"], input[name*="phone"]', this.profile.phone);
    }

    await sleep(400);
    const saveBtn = 'button:has-text("Continue"), button[data-track="Checkout: Shipping - Continue"]';
    await this.waitFor(saveBtn, 10_000);
    await this.click(saveBtn);
    await sleep(1500);
  }

  protected async fillPaymentForm(
    name: string, number: string, expiry: string, cvv: string,
  ): Promise<void> {
    this.log('info', 'Filling Best Buy payment');

    // Best Buy may have iframes for card entry
    const cardFrame = this.page.frameLocator('iframe[id*="credit-card"], iframe[title*="credit card"]').first();

    try {
      await cardFrame.locator('input[id*="number"], input[name*="number"]').waitFor({ timeout: 5000 });
      await cardFrame.locator('input[id*="number"], input[name*="number"]').fill(number);
      await cardFrame.locator('input[id*="expir"], input[name*="expir"]').fill(expiry);
      await cardFrame.locator('input[id*="cvv"],   input[name*="cvv"]').fill(cvv);
      await cardFrame.locator('input[id*="name"],  input[name*="name"]').fill(name);
    } catch {
      await this.fillField('input[id*="creditCardNumber"]', number);
      await this.fillField('input[id*="expirationDate"]',   expiry);
      await this.fillField('input[id*="cvv"]',              cvv);
      await this.fillField('input[id*="nameOnCard"]',       name);
    }

    await sleep(400);
    const continueBtn = 'button:has-text("Continue"), button[data-track*="Payment"]';
    await this.waitFor(continueBtn, 10_000);
    await this.click(continueBtn);
    await sleep(1500);
  }

  private async submitOrder(): Promise<void> {
    this.log('info', 'Placing Best Buy order');
    await this.screenshot('bestbuy-review');

    const placeBtn = 'button:has-text("Place your order"), button[data-track*="Place Order"]';
    await this.waitFor(placeBtn, 15_000);
    await this.click(placeBtn);

    await this.page.waitForURL('**/thank-you**', { timeout: 30_000 });
    this.log('success', 'Best Buy order placed!');
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
