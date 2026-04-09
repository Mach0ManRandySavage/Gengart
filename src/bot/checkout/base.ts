import { Page } from 'playwright';
import type { Task, Profile } from '../../types';
import { humanType, humanClick, sleep } from '../stealth/stealth';

export type LogFn = (level: string, message: string) => void;

export abstract class BaseCheckout {
  protected page:    Page;
  protected task:    Task;
  protected profile: Profile;
  protected log:     LogFn;

  constructor(page: Page, task: Task, profile: Profile, log: LogFn) {
    this.page    = page;
    this.task    = task;
    this.profile = profile;
    this.log     = log;
  }

  abstract run(): Promise<void>;

  // ── Convenience wrappers ─────────────────────────────────────────────────

  protected async goto(url: string): Promise<void> {
    this.log('info', `Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }

  protected async type(selector: string, value: string): Promise<void> {
    await humanType(this.page, selector, value);
  }

  protected async click(selector: string): Promise<void> {
    await humanClick(this.page, selector);
  }

  protected async waitFor(selector: string, timeout = 15_000): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
  }

  protected async selectOption(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).first().selectOption(value);
  }

  protected async fillShipping(): Promise<void> {
    const p = this.profile;
    const shippingFn   = p.ship_first_name;
    const shippingLn   = p.ship_last_name;
    const shippingAddr = p.ship_address1;
    const shippingCity = p.ship_city;
    const shippingState = p.ship_state;
    const shippingZip  = p.ship_zip;

    this.log('info', `Filling shipping: ${shippingFn} ${shippingLn}, ${shippingCity} ${shippingState}`);

    // Subclasses override with retailer-specific selectors
    await this.fillShippingForm(shippingFn, shippingLn, shippingAddr, shippingCity, shippingState, shippingZip);
  }

  protected abstract fillShippingForm(
    firstName: string, lastName: string, address: string,
    city: string, state: string, zip: string,
  ): Promise<void>;

  protected async fillPayment(): Promise<void> {
    const p = this.profile;
    this.log('info', 'Filling payment details');
    await this.fillPaymentForm(p.card_name, p.card_number, p.card_expiry, p.card_cvv);
  }

  protected abstract fillPaymentForm(
    name: string, number: string, expiry: string, cvv: string,
  ): Promise<void>;

  protected async screenshot(label: string): Promise<void> {
    try {
      const buf = await this.page.screenshot({ type: 'png' });
      this.log('info', `Screenshot: ${label} (${buf.length} bytes)`);
    } catch { /* ignore */ }
  }
}
