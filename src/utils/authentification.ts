// @ts-ignore
import { disableBadge } from './badge';
import { clearTokens } from '../lib/api';
import { disableProxy } from './proxy';

const API_URL = process.env.API_URL || '';
const AUTHENTIK_ISSUER = process.env.AUTHENTIK_ISSUER || '';
const CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID || '';
const REDIRECT_URI = process.env.AUTHENTIK_REDIRECT_URI || '';

function generateCode(length = 128): string {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => characters[v % characters.length]).join('');
}

function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function codeChallenge(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateCode(128);
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64urlencode(hashed) };
}

class Auth {
  async signIn() {
    const state = generateCode(40);
    const { verifier, challenge } = await codeChallenge();

    // Store PKCE + state in session storage (cleared on browser close)
    await chrome.storage.session.set({ pkce_state: state, pkce_verifier: verifier });

    const queryParams = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile offline_access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const url = `${AUTHENTIK_ISSUER}/authorize/?${queryParams.toString()}`;
    chrome.tabs.create({ url }, () => window.close());
  }

  async logout() {
    try {
      await disableProxy();
    } catch { /* ignore */ }

    await clearTokens();
    await chrome.storage.local.clear();
    disableBadge();
    window.close();
  }
}

export default Auth;
export { API_URL, CLIENT_ID, REDIRECT_URI };