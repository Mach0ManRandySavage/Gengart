/**
 * Encryption helpers using Electron's safeStorage (OS keychain backed)
 * with AES-256-GCM fallback using a machine-derived key.
 */
import crypto from 'crypto';
import os from 'os';

let _useSafeStorage = false;

// Lazy-import safeStorage only after app is ready
function getSafeStorage() {
  try {
    const { safeStorage } = require('electron');
    return safeStorage;
  } catch {
    return null;
  }
}

// Derive a deterministic machine key from hostname + username (not cryptographically ideal
// but sufficient for local personal use when OS keychain is unavailable).
function getMachineKey(): Buffer {
  const seed = `${os.hostname()}::${os.userInfo().username}::retail-checkout-bot`;
  return crypto.createHash('sha256').update(seed).digest();
}

export function initCrypto(): void {
  const safeStorage = getSafeStorage();
  if (safeStorage?.isEncryptionAvailable()) {
    _useSafeStorage = true;
  }
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  if (_useSafeStorage) {
    const safeStorage = getSafeStorage();
    try {
      const buf = safeStorage.encryptString(plaintext);
      return 'ss:' + (buf as Buffer).toString('base64');
    } catch {
      // fall through to AES
    }
  }

  // AES-256-GCM
  const key = getMachineKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const result = Buffer.concat([iv, tag, encrypted]);
  return 'aes:' + result.toString('base64');
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';

  if (ciphertext.startsWith('ss:')) {
    const safeStorage = getSafeStorage();
    try {
      const buf = Buffer.from(ciphertext.slice(3), 'base64');
      return safeStorage.decryptString(buf);
    } catch {
      return '';
    }
  }

  if (ciphertext.startsWith('aes:')) {
    try {
      const key  = getMachineKey();
      const data = Buffer.from(ciphertext.slice(4), 'base64');
      const iv   = data.subarray(0, 12);
      const tag  = data.subarray(12, 28);
      const enc  = data.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(enc) + decipher.final('utf8');
    } catch {
      return '';
    }
  }

  // Legacy unencrypted value — return as-is (migration path)
  return ciphertext;
}
