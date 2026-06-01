import { bufferToBase64, base64ToBuffer } from './encoding-utils';

interface EncryptedData {
  iv: string;        // Base64
  ciphertext: string; // Base64
}

// IndexedDB store for a per-install non-extractable AES-GCM CryptoKey. Unlike
// raw key material in chrome.storage.local, a non-extractable CryptoKey cannot
// be exfiltrated by code that gains read access to extension storage.
const DB_NAME = 'midori_vpn_keystore';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_ID = 'token_encryption_key';

// Legacy keys persisted by the previous PBKDF2-based implementation. We read
// them once to migrate ciphertext, then delete them from chrome.storage.local.
const LEGACY_SALT_KEY = 'encryptionSalt';
const LEGACY_INSTALL_KEY = 'installEncryptionKey';

let keyPromise: Promise<CryptoKey> | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function getStoredKey(): Promise<CryptoKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY_ID);
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function putStoredKey(key: CryptoKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(key, KEY_ID);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => { db.close(); resolve(); };
  });
}

async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

async function getOrCreateKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    try {
      const existing = await getStoredKey();
      if (existing) return existing;
    } catch {
      // fall through and try to create a new one
    }
    const key = await generateKey();
    try { await putStoredKey(key); }
    catch (err) {
      console.warn('[MidoriVPN] crypto: failed to persist key:', (err as Error)?.message || err);
    }
    return key;
  })();
  return keyPromise;
}

export async function encryptToken(token: string): Promise<EncryptedData> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token),
  );
  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(ciphertext)),
  };
}

// Legacy migration: decrypt ciphertext written by the previous PBKDF2-based
// implementation that stored its key material in chrome.storage.local. Used as
// a one-shot fallback; the caller is expected to re-encrypt with the new key.
async function deriveLegacyKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

async function tryLegacyDecrypt(encryptedData: EncryptedData): Promise<string | null> {
  try {
    const stored = await new Promise<Record<string, any>>((resolve) => {
      chrome.storage.local.get([LEGACY_SALT_KEY, LEGACY_INSTALL_KEY], (r) => resolve(r || {}));
    });
    const legacyKeyB64 = stored[LEGACY_INSTALL_KEY];
    const legacySaltB64 = stored[LEGACY_SALT_KEY];
    if (!legacyKeyB64 || !legacySaltB64) return null;

    const salt = base64ToBuffer(legacySaltB64);
    const key = await deriveLegacyKey(legacyKeyB64, salt);
    const iv = base64ToBuffer(encryptedData.iv);
    const ciphertext = base64ToBuffer(encryptedData.ciphertext);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function purgeLegacyKeyMaterial(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.remove([LEGACY_SALT_KEY, LEGACY_INSTALL_KEY], () => resolve());
  });
}

export async function decryptToken(encryptedData: EncryptedData): Promise<string> {
  try {
    const key = await getOrCreateKey();
    const iv = base64ToBuffer(encryptedData.iv);
    const ciphertext = base64ToBuffer(encryptedData.ciphertext);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    const legacy = await tryLegacyDecrypt(encryptedData);
    if (legacy !== null) return legacy;
    console.error('Decryption error:', err);
    throw new Error('Failed to decrypt token');
  }
}
