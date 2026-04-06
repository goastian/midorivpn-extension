import { bufferToBase64, base64ToBuffer } from './encoding-utils';

interface EncryptedData {
  iv: string;  // Base64
  ciphertext: string;  // Base64
}

const SALT_STORAGE_KEY = 'encryptionSalt';
const INSTALL_KEY_STORAGE_KEY = 'installEncryptionKey';
const LEGACY_SALT = new TextEncoder().encode("fixed_salt_123");
const LEGACY_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

/**
 * Returns a per-installation random salt (16 bytes).
 * Generated once on first use and persisted in chrome.storage.local.
 */
async function getOrCreateSalt(): Promise<Uint8Array> {
  const stored = await chrome.storage.local.get(SALT_STORAGE_KEY);
  if (stored[SALT_STORAGE_KEY]) {
    return base64ToBuffer(stored[SALT_STORAGE_KEY]);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ [SALT_STORAGE_KEY]: bufferToBase64(salt) });
  return salt;
}

/**
 * Returns a per-installation encryption key (32 random bytes).
 * Generated once on first use and persisted in chrome.storage.local.
 * Unlike the shared ENCRYPTION_KEY env var, this is unique per installation.
 */
async function getOrCreateInstallKey(): Promise<string> {
  const stored = await chrome.storage.local.get(INSTALL_KEY_STORAGE_KEY);
  if (stored[INSTALL_KEY_STORAGE_KEY]) {
    return stored[INSTALL_KEY_STORAGE_KEY];
  }
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const keyB64 = bufferToBase64(keyBytes);
  await chrome.storage.local.set({ [INSTALL_KEY_STORAGE_KEY]: keyB64 });
  return keyB64;
}

async function deriveKey(passphrase: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

export async function encryptToken(token: string): Promise<EncryptedData> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = await getOrCreateSalt();
    const installKey = await getOrCreateInstallKey();
    const key = await deriveKey(installKey, salt, ["encrypt", "decrypt"]);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(token)
    );

    return {
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(new Uint8Array(encrypted))
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt token");
  }
}

export async function decryptToken(encryptedData: EncryptedData): Promise<string> {
  try {
    const iv = base64ToBuffer(encryptedData.iv);
    const ciphertext = base64ToBuffer(encryptedData.ciphertext);
    const salt = await getOrCreateSalt();
    const installKey = await getOrCreateInstallKey();
    const key = await deriveKey(installKey, salt, ["decrypt"]);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt token");
  }
}

/** @deprecated Legacy helper — decrypts tokens encrypted with the old shared key + hardcoded salt. Remove after migration period. */
export async function decryptTokenWithLegacySalt(encryptedData: EncryptedData): Promise<string> {
  const iv = base64ToBuffer(encryptedData.iv);
  const ciphertext = base64ToBuffer(encryptedData.ciphertext);
  const key = await deriveKey(LEGACY_ENCRYPTION_KEY || '', LEGACY_SALT, ["decrypt"]);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/** @deprecated Legacy helper — decrypts tokens encrypted with the old shared key + per-install salt. Remove after migration period. */
export async function decryptTokenWithLegacyKey(encryptedData: EncryptedData): Promise<string> {
  const iv = base64ToBuffer(encryptedData.iv);
  const ciphertext = base64ToBuffer(encryptedData.ciphertext);
  const salt = await getOrCreateSalt();
  const key = await deriveKey(LEGACY_ENCRYPTION_KEY || '', salt, ["decrypt"]);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}