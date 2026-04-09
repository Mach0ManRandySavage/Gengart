# Retail Checkout Bot

A personal, fully local Mac desktop app for automated retail stock monitoring and checkout. Built with Electron, React, TypeScript, Playwright, and SQLite. No backend, no subscription, no cloud — everything runs on your machine.

---

## Table of Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [First Launch Setup](#first-launch-setup)
5. [Creating a Profile](#creating-a-profile)
6. [Creating Tasks](#creating-tasks)
7. [Task Groups](#task-groups)
8. [Stock Monitor & Checkout Flow](#stock-monitor--checkout-flow)
9. [Proxy Configuration](#proxy-configuration)
10. [IMAP Email / OTP Auto-Submit](#imap-email--otp-auto-submit)
11. [Settings Reference](#settings-reference)
12. [Security & Encryption](#security--encryption)
13. [Building the .dmg](#building-the-dmg)
14. [Project Structure](#project-structure)
15. [Development Guide](#development-guide)
16. [Retailer Notes](#retailer-notes)
17. [Troubleshooting](#troubleshooting)

---

## Features

| Feature | Details |
|---|---|
| **Task Manager** | Create, edit, delete tasks with retailer, URL, size, quantity, profile, and proxy |
| **Task Groups** | Group tasks and start/stop them all at once |
| **Stock Monitor** | Polls product pages every 3–5 s; detects ATC button becoming active |
| **Auto-Checkout** | Full checkout flows for Walmart, Target, Amazon, Best Buy |
| **Profiles** | Multiple shipping + billing + payment profiles |
| **Encrypted Storage** | Card numbers and CVVs encrypted via macOS Keychain or AES-256-GCM |
| **IMAP OTP** | Monitors inbox for verification emails and auto-submits codes |
| **Anti-Bot Stealth** | Randomised UA/viewport, human mouse movement, webdriver property spoofing |
| **Proxy Support** | Per-task HTTP or SOCKS5 proxy |
| **Activity Log** | Real-time log panel with level/task filtering, persisted to SQLite |
| **macOS Notifications** | Native alerts on successful or failed checkout |
| **Offline capable** | No backend server; all data stored locally in `~/Library/Application Support/` |

---

## Requirements

| Dependency | Version |
|---|---|
| macOS | 12 Monterey or later (arm64 or x64) |
| Node.js | 20 LTS or later |
| npm | 10 or later |
| Git | any recent version |

> **Apple Silicon note:** the app builds native binaries for both `arm64` and `x64`. Make sure you run `npm install` on the same architecture you intend to run in dev mode.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Mach0ManRandySavage/Gengart.git
cd Gengart
```

### 2. Install Node dependencies

```bash
npm install
```

This also runs `electron-builder install-app-deps` automatically via `postinstall`, which rebuilds native modules (better-sqlite3) against the bundled Electron runtime.

### 3. Download Playwright browser binaries

The bot drives a Chromium browser. Download it once:

```bash
npx playwright install chromium
```

The binaries land in `~/Library/Caches/ms-playwright/` and are reused across projects. This is a ~130 MB download.

### 4. Start in development mode

```bash
npm run dev
```

This concurrently:
- Starts the Vite dev server for the React renderer on `http://localhost:5173`
- Watches and compiles the main-process TypeScript to `dist/main/`
- Launches Electron once the dev server is ready

The DevTools panel opens automatically in a detached window so you can inspect the renderer.

---

## First Launch Setup

On the very first launch the SQLite database is created automatically at:

```
~/Library/Application Support/retail-checkout-bot/checkout-bot.db
```

No migrations are needed — the schema is applied idempotently using `CREATE TABLE IF NOT EXISTS`.

**Recommended first-launch checklist:**

1. Open **Settings** and set your preferred poll interval (default 3 000 ms).
2. Optionally configure a default proxy and IMAP credentials.
3. Open **Profiles** and create at least one checkout profile with your shipping address and payment card.
4. Open **Tasks**, create a task, assign your profile, and click **Start**.

---

## Creating a Profile

Profiles store the information used during checkout: shipping address, billing address (or "same as shipping"), and payment card.

1. Navigate to **Profiles → New Profile**.
2. Fill in **Basic Info** (name, email, phone).
3. Fill in the **Shipping Address**.
4. Check *Same as shipping address* for billing, or uncheck it and fill in a separate billing address.
5. Fill in **Payment**: cardholder name, card number, expiry (`MM/YY`), and CVV.
6. Click **Create Profile**.

> Card numbers and CVVs are **never stored in plain text**. They are encrypted immediately before writing to SQLite using the macOS Keychain (`safeStorage`) or AES-256-GCM with a machine-derived key if the Keychain is unavailable. See [Security & Encryption](#security--encryption).

You can create as many profiles as you like — useful if you want to check out on different accounts or with different cards.

---

## Creating Tasks

1. Navigate to **Tasks → New Task**.
2. Select a **Retailer** (Walmart, Target, Amazon, Best Buy).
3. Enter a **Product URL** — the direct link to the product page (recommended).
   - Alternatively, enter **Keywords** as a fallback search term.
4. Optionally set a **Size / Variant** string (e.g. `XL`, `256GB`, `Black`).
5. Set **Quantity** (default 1).
6. Assign a **Checkout Profile**.
7. Optionally assign the task to a **Task Group**.
8. Optionally set a **Proxy** for this specific task (overrides the global default).
9. Set the **Poll Interval** in milliseconds (default 3 000 ms; minimum 1 000 ms).
10. Click **Create Task**.

### Task statuses

| Status | Meaning |
|---|---|
| `Idle` | Task created but not running |
| `Monitoring` | Actively polling the product page |
| `In Queue` | Target waiting-room queue detected; waiting for admission |
| `Checking Out` | Stock found; checkout flow is executing |
| `Success` | Order placed successfully |
| `Failed` | An error stopped the task |

Click **Start** to begin monitoring. Click **Stop** to cancel at any time.

---

## Task Groups

Groups let you start and stop a batch of tasks with one click.

1. On the Tasks page, click **New Group** and give it a name.
2. When creating or editing a task, assign it to a group via the **Task Group** dropdown.
3. Use **Start All** / **Stop All** on the group row to control all tasks in that group simultaneously.
4. Deleting a group also deletes all tasks in it — confirm before proceeding.

---

## Stock Monitor & Checkout Flow

When you start a task:

1. A headless Chromium browser is launched (stealth mode enabled).
2. The bot navigates to the product URL at the configured poll interval.
3. It checks whether the **Add to Cart** button is enabled (retailer-specific detection).
4. **If out of stock:** logs the result and waits for the next poll interval (with ±1 s jitter).
5. **If in stock:** status changes to `Checking Out` and the retailer checkout module runs:
   - Adds item to cart (with size/variant selection if configured)
   - Navigates to checkout
   - Fills shipping address from the assigned profile
   - Fills payment details from the assigned profile
   - Submits the order
6. On success: status → `Success`, macOS notification fires, order confirmation is logged.
7. On failure: status → `Failed`, error is logged, macOS notification fires.

The browser is closed after checkout (success or failure). You can restart the task manually.

---

## Proxy Configuration

### Global default proxy (Settings page)

Set a proxy that applies to all tasks that don't have a task-level proxy override:

```
http://username:password@host:port
socks5://username:password@host:port
```

### Per-task proxy

On the task create/edit modal, paste a proxy string in the **Proxy** field. This overrides the global default for that task only.

Supported formats:

```
http://host:port
http://user:pass@host:port
socks5://host:port
socks5://user:pass@host:port
```

Leave both fields blank to use a direct connection (no proxy).

---

## IMAP Email / OTP Auto-Submit

Some retailers send a verification code to your email during checkout. The IMAP integration monitors your inbox and automatically extracts and submits the code.

### Setup

1. Open **Settings → IMAP Email**.
2. Fill in:
   - **IMAP Host** — e.g. `imap.gmail.com`
   - **Port** — `993` for TLS (recommended), `143` for STARTTLS
   - **Email Address** — the address that receives retailer emails
   - **Password** — your account password or an App Password (see below)
   - **Use TLS** — leave enabled unless your server requires STARTTLS
3. Click **Save**.

### Gmail App Password (recommended)

If you use Gmail with 2-Step Verification enabled (you should), create a dedicated App Password instead of your main password:

1. Go to **Google Account → Security → 2-Step Verification → App passwords**.
2. Select *Other (custom name)*, name it `Checkout Bot`, click **Generate**.
3. Copy the 16-character password and paste it into the IMAP Password field.

### How OTP detection works

The `ImapClient` searches for **unseen** messages received in the last 2 minutes from a pattern matching the retailer's domain. It then scans the message body with a set of regex patterns:

| Pattern | Example match |
|---|---|
| 6-digit code (most common) | `Your code is 483920` |
| 4-digit PIN | `PIN: 8472` |
| 8-digit code | `Code: 84729301` |
| `code: NNNN` | `Verification code: 123456` |
| `OTP: NNNN` | `OTP: 483920` |
| `one-time NNNN` | `one-time code 847291` |

The matched code is then filled into the OTP input on the checkout page automatically.

---

## Settings Reference

| Setting | Default | Description |
|---|---|---|
| **Poll Interval** | `3000` ms | How often to reload the product page. Applies to new tasks; existing running tasks use the interval set on them. |
| **Default Proxy** | *(blank)* | Global proxy for tasks without a task-level proxy. |
| **Run browser headless** | `true` | When disabled, the Chromium window is visible — useful for debugging a checkout flow. |
| **macOS notifications** | `true` | Show a native macOS notification on success or failure. |
| **IMAP Host** | *(blank)* | IMAP server hostname. |
| **IMAP Port** | `993` | IMAP server port. |
| **Email Address** | *(blank)* | The address monitored for OTP emails. |
| **Password** | *(blank)* | IMAP password or App Password — stored encrypted. |
| **Use TLS** | `true` | Enables SSL/TLS on the IMAP connection. |

---

## Security & Encryption

### What is encrypted

| Data | Encryption method |
|---|---|
| Credit card number | macOS Keychain (`safeStorage`) or AES-256-GCM |
| CVV | macOS Keychain (`safeStorage`) or AES-256-GCM |
| IMAP password | macOS Keychain (`safeStorage`) or AES-256-GCM |

All other profile data (name, address, card expiry) is stored as plain text in SQLite since it is not considered secret.

### Encryption hierarchy

1. **Primary — macOS Keychain via `safeStorage`:** Electron's built-in `safeStorage` API delegates to the macOS Keychain on macOS. The ciphertext is bound to your user account and the app identity — no other app or user can decrypt it, and it cannot be decrypted on a different machine.

2. **Fallback — AES-256-GCM:** If `safeStorage` is unavailable (e.g. during headless CI or on an unsigned development build), a 256-bit key is derived from `SHA-256(hostname + username + app-salt)` and used for AES-256-GCM encryption. This is weaker than the Keychain but still prevents casual inspection of the SQLite file.

### SQLite database location

```
~/Library/Application Support/retail-checkout-bot/checkout-bot.db
```

To back up your data, copy this file. To wipe all data, delete it.

---

## Building the .dmg

### Prerequisites

- Xcode Command Line Tools: `xcode-select --install`
- (Optional) An Apple Developer certificate for notarisation — not required for personal use

### Build

```bash
npm run dist
```

This runs:
1. `vite build` → compiles the React renderer to `dist/renderer/`
2. `tsc -p tsconfig.main.json` → compiles the main process to `dist/main/`
3. `electron-builder` → packages everything into `release/`

Output files:

```
release/
  Retail Checkout Bot-1.0.0-arm64.dmg   ← Apple Silicon
  Retail Checkout Bot-1.0.0.dmg          ← Intel
```

Open the `.dmg`, drag the app to `/Applications`, and launch it. macOS Gatekeeper will warn you on the first launch because the app is unsigned — right-click → Open to bypass.

---

## Project Structure

```
Gengart/
├── index.html                  ← Vite HTML entry point
├── package.json
├── tsconfig.json               ← Renderer TypeScript config (ESM, bundler)
├── tsconfig.main.json          ← Main-process TypeScript config (CommonJS)
├── vite.config.ts              ← Vite config for renderer
├── tailwind.config.js
├── postcss.config.js
├── electron-builder.yml        ← macOS DMG packaging config
│
└── src/
    ├── types/
    │   └── index.ts            ← Shared TypeScript interfaces & enums
    │
    ├── db/
    │   ├── schema.ts           ← SQLite CREATE TABLE statements
    │   ├── database.ts         ← Singleton DB connection (better-sqlite3)
    │   └── queries.ts          ← All CRUD functions; encryption applied here
    │
    ├── main/                   ← Electron main process (Node.js / CommonJS)
    │   ├── index.ts            ← App bootstrap, BrowserWindow creation
    │   ├── preload.ts          ← contextBridge: exposes window.api to renderer
    │   ├── keychain.ts         ← AES-256-GCM + safeStorage encrypt/decrypt
    │   ├── BotManager.ts       ← Manages running StockMonitor instances
    │   └── ipc/
    │       └── handlers.ts     ← ipcMain.handle() registrations (DB + bot)
    │
    ├── bot/
    │   ├── stealth/
    │   │   └── stealth.ts      ← UA pool, viewport randomisation, human mouse/type
    │   ├── monitors/
    │   │   └── StockMonitor.ts ← Playwright polling loop + checkout dispatch
    │   ├── checkout/
    │   │   ├── base.ts         ← Abstract BaseCheckout (shared helpers)
    │   │   ├── walmart.ts      ← Walmart checkout module
    │   │   ├── target.ts       ← Target checkout module (queue handling)
    │   │   ├── amazon.ts       ← Amazon checkout module (Buy Now + ATC)
    │   │   └── bestbuy.ts      ← Best Buy checkout module
    │   └── email/
    │       └── ImapClient.ts   ← IMAP connection, inbox polling, OTP extraction
    │
    └── renderer/               ← React app (Vite / ESM)
        ├── main.tsx            ← ReactDOM.createRoot entry
        ├── App.tsx             ← Router, global state (tasks, logs), IPC subscriptions
        ├── index.css           ← Tailwind directives + component layer
        ├── components/
        │   ├── Sidebar.tsx     ← Nav + live running-task status
        │   ├── TaskModal.tsx   ← Create/edit task modal
        │   └── ProfileModal.tsx← Create/edit profile modal
        └── pages/
            ├── Dashboard.tsx   ← Stats + active tasks + recent log
            ├── Tasks.tsx       ← Task list with groups, start/stop/edit/delete
            ├── Profiles.tsx    ← Profile cards with masked card numbers
            ├── Settings.tsx    ← All global settings
            └── Logs.tsx        ← Real-time filterable log table
```

---

## Development Guide

### Dev scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start renderer (Vite), main-process watcher (tsc), and Electron together |
| `npm run dev:renderer` | Vite dev server only (port 5173) |
| `npm run dev:main` | tsc watch for main process only |
| `npm run build` | Full production build (renderer + main process) |
| `npm run dist` | Build + package to DMG via electron-builder |

### Adding a new retailer

1. Create `src/bot/checkout/mynewstore.ts` extending `BaseCheckout`:

```typescript
import { BaseCheckout, LogFn } from './base';
import { Page } from 'playwright';
import { Task, Profile } from '../../types';

export class MyNewStoreCheckout extends BaseCheckout {
  constructor(page: Page, task: Task, profile: Profile, log: LogFn) {
    super(page, task, profile, log);
  }

  async run(): Promise<void> {
    await this.goto(this.task.product_url!);
    // ... your flow
  }

  protected async fillShippingForm(...) { /* ... */ }
  protected async fillPaymentForm(...)  { /* ... */ }
}
```

2. Add the retailer to `src/types/index.ts`:

```typescript
export enum Retailer {
  // ...existing...
  MyNewStore = 'mynewstore',
}
```

3. Add a stock-check method to `StockMonitor.ts`:

```typescript
private async checkMyNewStoreStock(page: Page): Promise<boolean> {
  // ...
}
```

4. Wire it up in the switch statement in `StockMonitor.runCheckout()`.

5. Add the label to the retailer dropdown in `TaskModal.tsx`.

### IPC pattern

All communication between main and renderer goes through the `contextBridge`:

```
Renderer                   Preload                    Main
  │                           │                          │
  │  window.api.startTask(id) │                          │
  │──────────────────────────►│  ipcRenderer.invoke(     │
  │                           │    'bot:startTask', id)  │
  │                           │─────────────────────────►│
  │                           │                          │ BotManager.startTask(id)
  │                           │◄─────────────────────────│
  │◄──────────────────────────│                          │
  │        (resolved)         │                          │
  │                           │                          │
  │                           │  ipcRenderer.on(         │
  │◄──────────────────────────│    'task:update', task)  │
  │   window.api.onTaskUpdate │◄─────────────────────────│ webContents.send(...)
```

To add a new IPC call:
1. Add the method signature to `ElectronAPI` in `src/types/index.ts`
2. Implement it in `src/main/ipc/handlers.ts` with `ipcMain.handle('channel', ...)`
3. Expose it in `src/main/preload.ts` via `ipcRenderer.invoke('channel', ...)`
4. Call it from the renderer via `window.api.yourMethod(...)`

### Hot reload behaviour

- **Renderer changes** — Vite HMR updates the UI instantly without restarting Electron.
- **Main process changes** — tsc recompiles to `dist/main/`. You must manually quit and re-run `npm run dev` to reload the main process (standard Electron limitation without `electron-reload`).

---

## Retailer Notes

### Walmart
- Uses `data-automation-id` attributes on buttons — relatively stable selectors.
- Payment form may be inside an iframe. The module tries the iframe first, then falls back to direct inputs.
- Shipping page uses a multi-step accordion. The module clicks "Continue" after each step.

### Target
- Has a **virtual queue** (waiting room) for high-demand drops. The `TargetCheckout` module detects queue elements and polls every 5 s for up to 10 minutes.
- Card input fields are in separate iframes per field (number, expiry, CVV). Each iframe is targeted individually.

### Amazon
- Prefers the **Buy Now** flow for speed (skips the cart). Falls back to ATC if Buy Now is absent.
- Buy Now may open in a turbo-checkout iframe overlay — handled separately.
- If a saved card is already selected, the module skips re-entering card details.
- Multi-region: just set the product URL to the correct regional domain (`.co.uk`, `.ca`, etc.).

### Best Buy
- Dismisses the **protection plan upsell** modal automatically after ATC.
- Payment iframe may or may not be present depending on account state — the module tries both.

---

## Troubleshooting

### `better-sqlite3` fails to load / "Invalid ELF header"

Native modules must be compiled against the correct Electron runtime. Run:

```bash
npm run postinstall
# or explicitly:
./node_modules/.bin/electron-rebuild -f -w better-sqlite3
```

### Playwright browser not found

```bash
npx playwright install chromium
```

If you get a permissions error, run with `sudo` once, or set `PLAYWRIGHT_BROWSERS_PATH` to a writable directory.

### Task stays "Monitoring" but never triggers checkout

1. Disable headless mode in Settings so you can watch the browser.
2. Check the Logs page for error messages from the poll loop.
3. The retailer may have changed their HTML structure. Open the product page manually, inspect the ATC button, and update the selectors in the relevant checkout module.
4. If the site blocks the request, try configuring a residential proxy.

### Checkout fills in wrong fields / skips steps

Retailer checkout flows change frequently. Use the Logs page to see exactly which step failed, then:
1. Set `browser_headless: false` in Settings.
2. Start the task and watch the browser.
3. Find the element with DevTools on the retailer site and update the selector in the module file.

### macOS Keychain prompt on first launch

The first time the app calls `safeStorage.encryptString()`, macOS may show an authorization prompt ("Retail Checkout Bot wants to use the login Keychain"). Click **Always Allow**.

### App says "damaged and can't be opened" after installing the DMG

This is macOS Gatekeeper blocking an unsigned app. Fix it:

```bash
xattr -cr "/Applications/Retail Checkout Bot.app"
```

Or right-click the app → **Open** → **Open** in the dialog.

### IMAP connection times out

- Confirm host/port — Gmail is `imap.gmail.com:993`, Outlook is `outlook.office365.com:993`.
- Make sure IMAP access is enabled in your email provider settings.
- Gmail: enable *Less secure app access* OR (preferred) use an App Password with 2FA enabled.
- Check that your firewall allows outbound TCP on port 993.

---

## License

Personal use only. Not for distribution or commercial use.
