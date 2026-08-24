// @ts-expect-error untyped JS module
import { disableBadge } from './badge';
import { clearTokens } from '../lib/api';
// @ts-expect-error untyped JS module
import { disableProxy } from './proxy';
// @ts-expect-error untyped JS module
import log from './logger.js';

// webpack.config.js rejects the build unless all of these values are present.
const API_URL = process.env.API_URL as string;
const AUTHENTIK_ISSUER = process.env.AUTHENTIK_ISSUER as string;
const AUTHENTIK_AUTHORIZATION_URL = process.env.AUTHENTIK_AUTHORIZATION_URL as string;
const CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID as string;

if (!AUTHENTIK_ISSUER || !CLIENT_ID) {
  log.warn('auth', 'Missing AUTHENTIK_ISSUER or AUTHENTIK_CLIENT_ID in .env configuration');
}

const REDIRECT_URI = process.env.AUTHENTIK_REDIRECT_URI as string;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
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

async function storePkce(state: string, verifier: string): Promise<void> {
  const data = { pkce_state: state, pkce_verifier: verifier };
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set(data);
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
    try {
      await chrome.storage.session.set(data);
    } catch (_) { /* ignore */ }
  }
}

class Auth {
  async signIn() {
    const state = generateCode(40);
    const { verifier, challenge } = await codeChallenge();

    // Store PKCE + state safely
    await storePkce(state, verifier);

    const authorizationEndpoint = resolveAuthorizationEndpoint();
    if (!authorizationEndpoint) {
      log.error('auth', 'Missing or invalid AUTHENTIK_ISSUER/AUTHENTIK_AUTHORIZATION_URL. Current config:', { AUTHENTIK_ISSUER, AUTHENTIK_AUTHORIZATION_URL });
      throw new Error('Configuración de autenticación no encontrada (AUTHENTIK_ISSUER)');
    }

    if (!REDIRECT_URI) {
      log.error('auth', 'Missing redirect URI: set AUTHENTIK_REDIRECT_URI');
      throw new Error('Configuración de URL de redirección no encontrada (REDIRECT_URI)');
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
    log.info('auth', 'Opening sign in URL:', url);

    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url }, () => {
        if (typeof window !== 'undefined' && window.close) {
          window.close();
        }
      });
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }

  async logout() {
    try {
      await disableProxy();
    } catch { /* ignore */ }

    await clearTokens();
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.clear) {
      await chrome.storage.local.clear();
    }
    disableBadge();
    if (typeof window !== 'undefined' && window.close) {
      window.close();
    }
  }
}

export default Auth;
export { API_URL, CLIENT_ID, REDIRECT_URI };
