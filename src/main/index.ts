import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { getDb, closeDb } from '../db/database';
import { initCrypto } from './keychain';
import { BotManager } from './BotManager';
import { registerIpcHandlers } from './ipc/handlers';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 820,
    minWidth:  960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0f11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation:  true,
      nodeIntegration:   false,
      sandbox:           false, // needed so preload can access require()
    },
  });

  // Open external links in OS browser, not Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  initCrypto();

  const db  = getDb();
  const bot = new BotManager(db);

  registerIpcHandlers(db, bot);

  createWindow();

  if (mainWindow) bot.setWindow(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (mainWindow) bot.setWindow(mainWindow);
    }
  });
});

app.on('window-all-closed', async () => {
  // Stop all running bots gracefully before quitting
  try {
    const { bot } = global as unknown as { bot?: BotManager };
    await bot?.stopAll();
  } catch { /* ignore */ }

  closeDb();

  if (process.platform !== 'darwin') app.quit();
});

// Prevent the app from being opened twice
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
