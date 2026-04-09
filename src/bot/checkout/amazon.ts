import { Page } from 'playwright';
import type { Task, Profile } from '../../types';
import { BaseCheckout, LogFn } from './base';
import { sleep } from '../stealth/stealth';

export class AmazonCheckout extends BaseCheckout {
  constructor(page: Page, task: Task, profile: Profile, log: LogFn) {
    super(page, task, profile, log);
  }

  async run(): Promise<void> {
    await this.goto(this.task.product_url!);
    await this.selectVariant();
    await this.attemptBuyNow();
  }

  private async selectVariant(): Promise<void> {
    if (!this.task.size) return;
    this.log('info', `Selecting Amazon variant: ${this.task.size}`);
    try {
      const sel = `[data-value="${this.task.size}"], li[title="${this.task.size}"]`;
      await this.page.locator(sel).first().waitFor({ state: 'visible', timeout: 5000 });
      await this.click(sel);
      await sleep(600);
    } catch {
      this.log('warn', `Could not select variant ${this.task.size}`);
    }
  }

  private async attemptBuyNow(): Promise<void> {
    // Prefer "Buy Now" over ATC for faster checkout
    const buyNowBtn = this.page.locator('#buy-now-button').first();
    const isBuyNow  = await buyNowBtn.isVisible().catch(() => false);

    if (isBuyNow) {
      this.log('info', 'Using Buy Now flow');
      await this.click('#buy-now-button');
      await sleep(1500);

      // Amazon may show a modal for Buy Now
      const modal = this.page.locator('#turbo-checkout-iframe, iframe[id*="turbo"]').first();
      if (await modal.isVisible().catch(() => false)) {
        await this.handleTurboCheckout();
      } else {
        await this.handleStandardCheckout();
      }
    } else {
      this.log('info', 'Using Add to Cart flow');
      await this.click('#add-to-cart-button');
      await sleep(1200);

      // Dismiss upsell modal
      const skipBtn = this.page.locator('#attachSiNoCoverage, button:has-text("No thanks"), [data-action="sinocover-skip"]').first();
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
        await sleep(500);
      }

      await this.goto('https://www.amazon.com/gp/cart/view.html');
      await sleep(1000);

      const checkoutBtn = this.page.locator('input[name="proceedToRetailCheckout"], #sc-buy-box-ptc-button').first();
      await checkoutBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await checkoutBtn.click();
      await sleep(1500);
      await this.handleStandardCheckout();
    }
  }

  private async handleTurboCheckout(): Promise<void> {
    this.log('info', 'Handling Amazon turbo checkout');
    const frame = this.page.frameLocator('#turbo-checkout-iframe');

    try {
      // Select default shipping address
      const useDefaultAddr = frame.locator('input[value*="default"], [data-testid="default-address"]').first();
      if (await useDefaultAddr.isVisible().catch(() => false)) {
        await useDefaultAddr.click();
        await sleep(500);
      }

      const buyBtn = frame.locator('input[name="placeYourOrder1"], #turbo-checkout-pyo-button').first();
      await buyBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await buyBtn.click();

      await this.page.waitForURL('**/thank-you**/orderConfirmation**', { timeout: 30_000 });
      this.log('success', 'Amazon order placed via turbo checkout!');
    } catch (err) {
      this.log('warn', `Turbo checkout failed: ${(err as Error).message} — trying standard`);
      await this.handleStandardCheckout();
    }
  }

  private async handleStandardCheckout(): Promise<void> {
    this.log('info', 'Handling Amazon standard checkout');

    // Wait for checkout page
    await this.page.waitForURL('**/checkout/**', { timeout: 20_000 });
    await sleep(1000);

    // Shipping address step
    const continueWithAddr = this.page.locator('[data-testid="ship-to-this-address-btn"], input[name="continueWithAddress"]').first();
    if (await continueWithAddr.isVisible().catch(() => false)) {
      await continueWithAddr.click();
      await sleep(1000);
    } else {
      await this.fillShipping();
    }

    // Delivery options
    await sleep(1000);
    const deliveryContinue = this.page.locator('input[name="continue-shipment-1-button"], button:has-text("Continue")').first();
    if (await deliveryContinue.isVisible().catch(() => false)) {
      await deliveryContinue.click();
      await sleep(1000);
    }

    // Payment step
    await this.fillPayment();

    // Review and place order
    const placeOrder = this.page.locator('input[name="placeYourOrder1"], #submitOrderButtonId').first();
    await placeOrder.waitFor({ state: 'visible', timeout: 15_000 });
    await this.screenshot('amazon-review');
    await placeOrder.click();

    await this.page.waitForURL('**/thank-you**/orderConfirmation**', { timeout: 30_000 });
    this.log('success', 'Amazon order placed!');
  }

  protected async fillShippingForm(
    firstName: string, lastName: string, address: string,
    city: string, state: string, zip: string,
  ): Promise<void> {
    this.log('info', 'Filling Amazon shipping form');

    await this.fillField('input[name="enterAddressFullName"]', `${firstName} ${lastName}`);
    await this.fillField('input[name="enterAddressAddressLine1"]', address);
    await this.fillField('input[name="enterAddressCity"]', city);
    await this.fillField('input[name="enterAddressZip"]', zip);

    try {
      await this.page.locator('select[name="enterAddressStateOrRegion"]').first().selectOption(state);
    } catch {
      this.log('warn', 'Could not select state');
    }

    if (this.profile.phone) {
      await this.fillField('input[name="enterAddressPhoneNumber"]', this.profile.phone);
    }

    await sleep(400);
    await this.fillField('input[id="address-ui-widgets-enterAddressAddressLine2"]', '').catch(() => {});

    const saveBtn = this.page.locator('input[name="useShipToThisAddress"]').first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    } else {
      await this.click('input[value*="Continue"], button:has-text("Continue")');
    }
    await sleep(1500);
  }

  protected async fillPaymentForm(
    name: string, number: string, expiry: string, cvv: string,
  ): Promise<void> {
    this.log('info', 'Filling Amazon payment');

    // Amazon often pre-selects a saved card — try to proceed
    const useExistingCard = this.page.locator('[data-testid="payment-use-this-card"], input[name="ppw-instrumentRowSelection"]').first();
    if (await useExistingCard.isVisible().catch(() => false)) {
      this.log('info', 'Using saved Amazon card');
      const continueBtn = this.page.locator('input[name="ppw-widgetEvent:SetPaymentPlanEvent"], button:has-text("Use this card")').first();
      await continueBtn.click().catch(() => {});
      await sleep(1000);
      return;
    }

    // Add new card
    await this.fillField('input[name="addCreditCardNumber"]', number);

    // Parse expiry MM/YY
    const [month, year] = expiry.split('/');
    try {
      await this.page.locator('select[name="ppw-expirationDate_month"]').first().selectOption(month.trim());
      await this.page.locator('select[name="ppw-expirationDate_year"]').first()
        .selectOption(`20${year.trim()}`);
    } catch {
      this.log('warn', 'Could not fill expiry dropdowns');
    }

    await this.fillField('input[name="ppw-nameOnCard"]', name);

    await sleep(400);
    const addBtn = this.page.locator('input[name="ppw-widgetEvent:AddCreditCardEvent"]').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await sleep(1200);
    }

    // CVV if prompted
    const cvvField = this.page.locator('input[name="addCreditCardVerificationNumber"]').first();
    if (await cvvField.isVisible().catch(() => false)) {
      await cvvField.fill(cvv);
      await sleep(300);
    }

    const continueBtn = this.page.locator('input[name="ppw-widgetEvent:SetPaymentPlanEvent"], button:has-text("Continue")').first();
    await continueBtn.click().catch(() => {});
    await sleep(1000);
  }

  private async fillField(selector: string, value: string): Promise<void> {
    try {
      const el = this.page.locator(selector).first();
      if (await el.isVisible().catch(() => false)) {
        await el.fill(value);
        await sleep(150);
      }
    } catch { /* ignore */ }
  }
}
