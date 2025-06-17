import { bufferToBase64, base64ToBuffer } from './encoding-utils';

interface EncryptedData {
  iv: string;  // Base64
  ciphertext: string;  // Base64
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

export async function encryptToken(token: string): Promise<EncryptedData> {
  try {
    // 1. Generar IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 2. Preparar clave derivada (PBKDF2 para mayor seguridad)
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(ENCRYPTION_KEY),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("fixed_salt_123"), // Usa un salt único
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    // 3. Encriptar
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
    // 1. Convertir IV y ciphertext de Base64 a Uint8Array
    const iv = base64ToBuffer(encryptedData.iv);
    const ciphertext = base64ToBuffer(encryptedData.ciphertext);

    // 2. Derivar la clave (igual que en encryptToken)
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(ENCRYPTION_KEY),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("fixed_salt_123"), // ¡Mismo salt que en encryptToken!
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"] // Solo necesitamos descifrar aquí
    );

    // 3. Desencriptar
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