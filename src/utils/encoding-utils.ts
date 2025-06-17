/**
 * Converts an ArrayBuffer or Uint8Array to a Base64-encoded string.
 *
 * This is useful for transmitting binary data (such as images or cryptographic keys)
 * over text-based protocols like JSON or HTTP.
 *
 * @param buffer - The binary data to encode (ArrayBuffer or Uint8Array).
 * @returns A Base64-encoded string representation of the input buffer.
 */
export function bufferToBase64(buffer: ArrayBuffer|Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Converts a Base64-encoded string back to a Uint8Array containing the original binary data.
 *
 * This is useful for decoding Base64-encoded data received from a text-based source
 * back into a usable binary format.
 *
 * @param base64 - The Base64-encoded string to decode.
 * @returns A Uint8Array containing the decoded binary data.
 */
export function base64ToBuffer(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}