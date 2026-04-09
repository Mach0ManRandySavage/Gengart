import { BrowserContext, Page } from 'playwright';

// ─── User Agent Pool ──────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1440, height: 900  },
  { width: 1366, height: 768  },
  { width: 1536, height: 864  },
  { width: 2560, height: 1440 },
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function randomViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// ─── Stealth Init Script ──────────────────────────────────────────────────────

const STEALTH_INIT_SCRIPT = `
(function () {
  // Hide webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Spoof plugins
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin',   filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer',   filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client',       filename: 'internal-nacl-plugin', description: '' },
      ];
      arr.item   = (i) => arr[i] ?? null;
      arr.namedItem = (n) => arr.find(p => p.name === n) ?? null;
      arr.refresh = () => {};
      Object.setPrototypeOf(arr, PluginArray.prototype);
      return arr;
    }
  });

  // Spoof languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  // Spoof hardware concurrency
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

  // Spoof device memory
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

  // Remove automation-specific chrome properties
  if (window.chrome) {
    window.chrome.runtime = window.chrome.runtime || {};
  } else {
    Object.defineProperty(window, 'chrome', {
      value: { runtime: {} },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  // Permissions API spoof
  const origQuery = window.navigator.permissions?.query?.bind(navigator.permissions);
  if (origQuery) {
    navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus)
        : origQuery(params);
  }

  // Fix toString fingerprint for overridden functions
  const overrides = ['webdriver'];
  overrides.forEach(prop => {
    try {
      const desc = Object.getOwnPropertyDescriptor(navigator, prop);
      if (desc?.get) {
        const orig = desc.get.toString;
        desc.get.toString = function () {
          return 'function get ' + prop + '() { [native code] }';
        };
      }
    } catch { /* ignore */ }
  });
})();
`;

// ─── Apply Stealth to Context ─────────────────────────────────────────────────

export async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(STEALTH_INIT_SCRIPT);
}

// ─── Human-like Mouse Movement ────────────────────────────────────────────────

/**
 * Move the mouse from current position to (x, y) along a Bezier curve.
 */
export async function humanMove(page: Page, x: number, y: number): Promise<void> {
  const steps = Math.floor(rand(15, 30));
  const cp1x  = rand(0, page.viewportSize()?.width  ?? 1000);
  const cp1y  = rand(0, page.viewportSize()?.height ?? 800);

  for (let i = 0; i <= steps; i++) {
    const t  = i / steps;
    const t2 = t * t;
    const mt = 1 - t;
    const bx = mt * mt * 0 + 2 * mt * t * cp1x + t2 * x;
    const by = mt * mt * 0 + 2 * mt * t * cp1y  + t2 * y;
    await page.mouse.move(bx, by);
    await sleep(rand(5, 15));
  }
}

/**
 * Human-like click: move to element, small delay, click.
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`Element not found: ${selector}`);

  const tx = box.x + box.width  * rand(0.2, 0.8);
  const ty = box.y + box.height * rand(0.2, 0.8);

  await humanMove(page, tx, ty);
  await sleep(rand(60, 180));
  await page.mouse.click(tx, ty);
}

/**
 * Type text with random delays between keystrokes (like a human).
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await humanClick(page, selector);
  await sleep(rand(100, 300));

  // Clear existing value
  await page.locator(selector).first().fill('');
  await sleep(rand(50, 120));

  for (const char of text) {
    await page.keyboard.type(char, { delay: rand(40, 140) });
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
