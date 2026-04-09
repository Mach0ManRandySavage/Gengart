import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { Task, Profile } from '../../types';
import { TaskStatus, Retailer } from '../../types';
import { applyStealth, randomUserAgent, randomViewport, sleep } from '../stealth/stealth';
import { WalmartCheckout }  from '../checkout/walmart';
import { TargetCheckout }   from '../checkout/target';
import { AmazonCheckout }   from '../checkout/amazon';
import { BestBuyCheckout }  from '../checkout/bestbuy';

export interface MonitorCallbacks {
  onStatusChange: (status: TaskStatus) => void;
  onLog:          (level: string, message: string) => void;
  onSuccess:      () => void;
  onFail:         (error: string) => void;
}

export class StockMonitor {
  private task:      Task;
  private profile:   Profile;
  private callbacks: MonitorCallbacks;
  private browser:   Browser | null = null;
  private context:   BrowserContext | null = null;
  private running    = false;

  constructor(task: Task, profile: Profile, callbacks: MonitorCallbacks) {
    this.task      = task;
    this.profile   = profile;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    this.running = true;

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials',
      ],
    };

    if (this.task.proxy) {
      launchOptions.proxy = { server: this.task.proxy };
    }

    this.browser = await chromium.launch(launchOptions);

    const ua       = randomUserAgent();
    const viewport = randomViewport();

    this.context = await this.browser.newContext({
      userAgent:       ua,
      viewport,
      locale:          'en-US',
      timezoneId:      'America/New_York',
      deviceScaleFactor: 1,
      hasTouch:        false,
      javaScriptEnabled: true,
      acceptDownloads: false,
    });

    await applyStealth(this.context);

    this.callbacks.onLog('info', `Browser launched | UA: ${ua.slice(0, 60)}…`);

    await this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.browser?.close();
    } catch { /* ignore */ }
    this.browser  = null;
    this.context  = null;
  }

  private async pollLoop(): Promise<void> {
    const url = this.task.product_url;
    if (!url) {
      this.callbacks.onFail('No product URL configured');
      return;
    }

    while (this.running) {
      try {
        const inStock = await this.checkStock(url);

        if (inStock) {
          this.callbacks.onStatusChange(TaskStatus.CheckingOut);
          this.callbacks.onLog('info', 'Stock detected — initiating checkout');
          await this.runCheckout();
          return; // done
        } else {
          this.callbacks.onLog('info', `Out of stock — retrying in ${this.task.poll_interval}ms`);
        }
      } catch (err) {
        this.callbacks.onLog('warn', `Poll error: ${(err as Error).message}`);
      }

      await sleep(this.task.poll_interval + Math.random() * 1000);
    }
  }

  private async checkStock(url: string): Promise<boolean> {
    const page = await this.context!.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const retailer = this.task.retailer;
      let inStock = false;

      if (retailer === Retailer.Walmart) {
        inStock = await this.checkWalmartStock(page);
      } else if (retailer === Retailer.Target) {
        inStock = await this.checkTargetStock(page);
      } else if (retailer === Retailer.Amazon) {
        inStock = await this.checkAmazonStock(page);
      } else if (retailer === Retailer.BestBuy) {
        inStock = await this.checkBestBuyStock(page);
      }

      return inStock;
    } finally {
      await page.close().catch(() => {});
    }
  }

  // ── Retailer stock-check helpers ────────────────────────────────────────

  private async checkWalmartStock(page: Page): Promise<boolean> {
    try {
      // Walmart: ATC button is disabled or absent when out-of-stock
      const atcBtn = page.locator('[data-automation-id="add-to-cart-btn"], button:has-text("Add to cart")').first();
      await atcBtn.waitFor({ state: 'visible', timeout: 8000 });
      const disabled = await atcBtn.getAttribute('disabled');
      const text = (await atcBtn.textContent() ?? '').toLowerCase();
      return disabled === null && (text.includes('add to cart') || text.includes('add to Cart'));
    } catch {
      return false;
    }
  }

  private async checkTargetStock(page: Page): Promise<boolean> {
    try {
      const atcBtn = page.locator('[data-test="shippingOrderButton"], button:has-text("Add to cart")').first();
      await atcBtn.waitFor({ state: 'visible', timeout: 8000 });
      const disabled = await atcBtn.getAttribute('disabled');
      return disabled === null;
    } catch {
      return false;
    }
  }

  private async checkAmazonStock(page: Page): Promise<boolean> {
    try {
      const buyBox = page.locator('#availability span').first();
      await buyBox.waitFor({ state: 'visible', timeout: 8000 });
      const text = (await buyBox.textContent() ?? '').toLowerCase();
      if (text.includes('in stock')) return true;

      // Check ATC button as fallback
      const atcBtn = page.locator('#add-to-cart-button').first();
      const disabled = await atcBtn.getAttribute('disabled').catch(() => 'disabled');
      return disabled === null;
    } catch {
      return false;
    }
  }

  private async checkBestBuyStock(page: Page): Promise<boolean> {
    try {
      const atcBtn = page.locator('.fulfillment-add-to-cart-button button, button.btn-primary:has-text("Add to Cart")').first();
      await atcBtn.waitFor({ state: 'visible', timeout: 8000 });
      const disabled = await atcBtn.getAttribute('disabled');
      const cls      = await atcBtn.getAttribute('class') ?? '';
      return disabled === null && !cls.includes('btn-disabled');
    } catch {
      return false;
    }
  }

  // ── Run checkout ─────────────────────────────────────────────────────────

  private async runCheckout(): Promise<void> {
    const page = await this.context!.newPage();

    try {
      let module;
      switch (this.task.retailer) {
        case Retailer.Walmart: module = new WalmartCheckout(page, this.task, this.profile, this.callbacks.onLog); break;
        case Retailer.Target:  module = new TargetCheckout(page, this.task, this.profile, this.callbacks.onLog);  break;
        case Retailer.Amazon:  module = new AmazonCheckout(page, this.task, this.profile, this.callbacks.onLog);  break;
        case Retailer.BestBuy: module = new BestBuyCheckout(page, this.task, this.profile, this.callbacks.onLog); break;
        default: throw new Error(`Unknown retailer: ${this.task.retailer}`);
      }

      await module.run();
      this.running = false;
      this.callbacks.onStatusChange(TaskStatus.Success);
      this.callbacks.onSuccess();
    } catch (err) {
      this.callbacks.onStatusChange(TaskStatus.Failed);
      this.callbacks.onFail((err as Error).message);
    } finally {
      await page.close().catch(() => {});
      await this.stop();
    }
  }
}
