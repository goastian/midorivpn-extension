// @ts-ignore
import { disableBadge } from './badge';
import { clearTokens } from '../lib/api';
import { disableProxy } from './proxy';

const API_URL = process.env.API_URL || '';
const AUTHENTIK_ISSUER = process.env.AUTHENTIK_ISSUER || '';
const AUTHENTIK_AUTHORIZATION_URL = process.env.AUTHENTIK_AUTHORIZATION_URL || '';
const CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID || '';

// REDIRECT_URI resolution order:
//   1. AUTHENTIK_REDIRECT_URI (legacy full URL — kept for backward compat)
//   2. PUBLIC_BASE_URL + EXTENSION_CALLBACK_PATH (new configurable scheme)
// One of the two must be set; the build will silently use an empty string
// otherwise, which will be caught by the PKCE state-mismatch error at runtime.
function resolveRedirectURI(): string {
  if (process.env.AUTHENTIK_REDIRECT_URI) {
    return process.env.AUTHENTIK_REDIRECT_URI;
  }
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const path = process.env.EXTENSION_CALLBACK_PATH || '/extension/callback';
  return base ? base + path : '';
}

const REDIRECT_URI = resolveRedirectURI();
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const EXTENSION_CALLBACK_PATH = process.env.EXTENSION_CALLBACK_PATH || '/extension/callback';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizePath(path: string): string {
  if (!path) return '/extension/callback';
  return path.startsWith('/') ? path : `/${path}`;
}

function resolveAuthorizationEndpoint(): string {
  if (AUTHENTIK_AUTHORIZATION_URL) {
    return `${trimTrailingSlash(AUTHENTIK_AUTHORIZATION_URL)}/`;
  }

  if (!AUTHENTIK_ISSUER) {
    return '';
  }

  const normalizedIssuer = trimTrailingSlash(AUTHENTIK_ISSUER);
  if (normalizedIssuer.endsWith('/application/o/authorize')) {
    return `${normalizedIssuer}/`;
  }

  try {
    const parsed = new URL(normalizedIssuer);
    return `${parsed.protocol}//${parsed.host}/application/o/authorize/`;
  } catch {
    return '';
  }
}

function resolveRedirectURI(): string {
  if (AUTHENTIK_REDIRECT_URI) {
    return AUTHENTIK_REDIRECT_URI;
  }

  if (!PUBLIC_BASE_URL) {
    return '';
  }

  return `${trimTrailingSlash(PUBLIC_BASE_URL)}${normalizePath(EXTENSION_CALLBACK_PATH)}`;
}

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

const REDIRECT_URI = resolveRedirectURI();

class Auth {
  async signIn() {
    const state = generateCode(40);
    const { verifier, challenge } = await codeChallenge();

    // Store PKCE + state in session storage (cleared on browser close)
    await chrome.storage.session.set({ pkce_state: state, pkce_verifier: verifier });

    const authorizationEndpoint = resolveAuthorizationEndpoint();
    if (!authorizationEndpoint) {
      console.error('Missing or invalid AUTHENTIK_ISSUER/AUTHENTIK_AUTHORIZATION_URL');
      return;
    }

    if (!REDIRECT_URI) {
      console.error('Missing redirect URI: set AUTHENTIK_REDIRECT_URI or PUBLIC_BASE_URL + EXTENSION_CALLBACK_PATH');
      return;
    }

    const queryParams = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile offline_access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const url = `${authorizationEndpoint}?${queryParams.toString()}`;
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
