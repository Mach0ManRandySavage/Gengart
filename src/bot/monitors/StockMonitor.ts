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

const BROWSER_CRASH_MSGS = [
  'Target closed',
  'Target page, context or browser has been closed',
  'browser has been closed',
  'context or browser',
  'Connection closed',
  'Protocol error',
];

function isBrowserCrash(err: Error): boolean {
  return BROWSER_CRASH_MSGS.some(m => err.message.includes(m));
}

/**
 * Normalise any proxy string to the URL format Playwright expects.
 * Accepts:
 *   IP:PORT:USER:PASS       → http://USER:PASS@IP:PORT
 *   IP:PORT                 → http://IP:PORT
 *   http(s)://...           → returned as-is
 *   socks5://...            → returned as-is
 */
function normaliseProxy(raw: string): string {
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw) || /^socks5?:\/\//i.test(raw)) return raw;

  const parts = raw.split(':');
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  }
  if (parts.length === 2) {
    return `http://${raw}`;
  }
  // Unknown format — pass through and let Playwright error
  return raw;
}

export interface MonitorOptions {
  headless: boolean;
}

export class StockMonitor {
  private task:      Task;
  private profile:   Profile;
  private callbacks: MonitorCallbacks;
  private options:   MonitorOptions;
  private browser:   Browser | null = null;
  private context:   BrowserContext | null = null;
  private running    = false;

  constructor(task: Task, profile: Profile, callbacks: MonitorCallbacks, options: MonitorOptions = { headless: true }) {
    this.task      = task;
    this.profile   = profile;
    this.callbacks = callbacks;
    this.options   = options;
  }

  async start(): Promise<void> {
    this.running = true;
    await this.launchBrowser();
    await this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.closeBrowser();
  }

  // ── Browser lifecycle ────────────────────────────────────────────────────

  private async launchBrowser(): Promise<void> {
    await this.closeBrowser(); // close any existing instance first

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.options.headless,
      // Prefer the user's real Chrome installation — it passes bot detection
      // far better than bundled Chromium. Falls back to Chromium if not found.
      channel: 'chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
      ],
    };

    // channel: 'chrome' may fail if Chrome isn't installed — fall back silently
    try {
      if (this.task.proxy) {
        const proxyUrl = normaliseProxy(this.task.proxy);
        launchOptions.proxy = { server: proxyUrl };
        this.callbacks.onLog('info', `Using proxy: ${proxyUrl.replace(/:([^:@]+)@/, ':***@')}`);
      }
      this.browser = await chromium.launch(launchOptions);
      this.callbacks.onLog('info', 'Using installed Chrome');
    } catch {
      this.callbacks.onLog('warn', 'Chrome not found — falling back to bundled Chromium');
      delete launchOptions.channel;
      this.browser = await chromium.launch(launchOptions);
    }

    const ua       = randomUserAgent();
    const viewport = randomViewport();

    this.context = await this.browser.newContext({
      userAgent:         ua,
      viewport,
      locale:            'en-US',
      timezoneId:        'America/New_York',
      deviceScaleFactor: 1,
      hasTouch:          false,
      javaScriptEnabled: true,
      acceptDownloads:   false,
      ignoreHTTPSErrors: true,
    });

    await applyStealth(this.context);
    this.callbacks.onLog('info', `Browser launched | UA: ${ua.slice(0, 60)}…`);
  }

  private async closeBrowser(): Promise<void> {
    try { await this.context?.close(); } catch { /* ignore */ }
    try { await this.browser?.close();  } catch { /* ignore */ }
    this.context = null;
    this.browser = null;
  }

  private isBrowserAlive(): boolean {
    return !!(this.browser?.isConnected() && this.context);
  }

  // ── Poll loop ────────────────────────────────────────────────────────────

  private async pollLoop(): Promise<void> {
    const url = this.task.product_url;
    if (!url) {
      this.callbacks.onFail('No product URL configured');
      return;
    }

    while (this.running) {
      // Relaunch if browser died
      if (!this.isBrowserAlive()) {
        this.callbacks.onLog('warn', 'Browser not alive — relaunching…');
        try {
          await this.launchBrowser();
        } catch (err) {
          this.callbacks.onLog('error', `Relaunch failed: ${(err as Error).message}`);
          await sleep(5000);
          continue;
        }
      }

      try {
        const inStock = await this.checkStock(url);

        if (inStock) {
          this.callbacks.onStatusChange(TaskStatus.CheckingOut);
          this.callbacks.onLog('info', 'Stock detected — initiating checkout');
          await this.runCheckout();
          return;
        } else {
          this.callbacks.onLog('info', `Out of stock — retrying in ${this.task.poll_interval}ms`);
        }
      } catch (err) {
        const e = err as Error;
        if (isBrowserCrash(e)) {
          this.callbacks.onLog('warn', `Browser crashed: ${e.message} — will relaunch`);
          await this.closeBrowser();
          // relaunch happens at top of next loop iteration
        } else {
          this.callbacks.onLog('warn', `Poll error: ${e.message}`);
        }
      }

      await sleep(this.task.poll_interval + Math.random() * 1000);
    }
  }

  // ── Stock checks ─────────────────────────────────────────────────────────

  private async checkStock(url: string): Promise<boolean> {
    const page = await this.context!.newPage();
    try {
      // 'load' waits for all resources; then we additionally wait for
      // network to go quiet so JS-rendered content (React, etc.) is painted.
      await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
        // networkidle may not settle on heavy pages — that's fine, continue
      });

      switch (this.task.retailer) {
        case Retailer.Walmart: return await this.checkWalmartStock(page);
        case Retailer.Target:  return await this.checkTargetStock(page);
        case Retailer.Amazon:  return await this.checkAmazonStock(page);
        case Retailer.BestBuy: return await this.checkBestBuyStock(page);
        default: return false;
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async checkWalmartStock(page: Page): Promise<boolean> {
    try {
      // Evaluate in-page JS for maximum flexibility — avoids brittle CSS selectors
      const result = await page.evaluate(() => {
        // 1. Explicit out-of-stock copy anywhere on the page
        const bodyText = document.body.innerText.toLowerCase();
        if (
          bodyText.includes('out of stock') ||
          bodyText.includes('currently unavailable') ||
          bodyText.includes('not available')
        ) return { inStock: false, reason: 'oos-text' };

        // 2. Find any enabled "Add to cart" button
        const buttons = Array.from(document.querySelectorAll('button'));
        const atcBtn = buttons.find(btn => {
          const text = (btn.textContent ?? '').toLowerCase().trim();
          return (
            (text.includes('add to cart') || text === 'add to cart') &&
            !(btn as HTMLButtonElement).disabled &&
            !btn.getAttribute('aria-disabled')
          );
        });
        if (atcBtn) return { inStock: true, reason: 'atc-button' };

        // 3. data-automation-id variants Walmart has used over time
        const autoIds = [
          'atc',                           // current (2024-2025)
          'add-to-cart-btn', 'atc-button', 'add-to-cart-button',
          'product-atc-button', 'fulfillment-add-to-cart-button',
        ];
        for (const id of autoIds) {
          const el = document.querySelector(`[data-automation-id="${id}"]`) as HTMLButtonElement | null;
          if (el && !el.disabled) return { inStock: true, reason: id };
        }

        return { inStock: false, reason: 'no-atc-found' };
      });

      this.callbacks.onLog('info', `Walmart check: ${result.inStock ? 'IN STOCK' : 'out of stock'} (${result.reason})`);
      return result.inStock;
    } catch (err) {
      this.callbacks.onLog('warn', `Walmart check error: ${(err as Error).message}`);
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

  // ── Checkout ─────────────────────────────────────────────────────────────

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
