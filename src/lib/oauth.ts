import { API_URL, REDIRECT_URI } from '../utils/authentification';
import { saveTokens } from './api';
import { parseRetryAfterMs } from '../utils/http';
import { consumePkceTransaction, loadPkceTransaction } from './pkce';
// @ts-expect-error untyped JS module
import log from '../utils/logger.js';

declare const chrome: any;

const TRANSIENT_EXCHANGE_STATUSES = new Set([502, 503, 504]);
const DEFAULT_EXCHANGE_RETRY_MS = 1000;
const AUTH_ERROR_KEY = 'auth_error';

type AuthErrorCode = 'origin_revoked' | 'invalid_callback' | 'service_unavailable';

async function saveAuthError(code: AuthErrorCode): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({
      [AUTH_ERROR_KEY]: { code, occurred_at: Date.now() },
    });
  }
}

async function clearAuthError(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
    await chrome.storage.local.remove([AUTH_ERROR_KEY]);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exchanges an OAuth authorization code (received on the configured
 * REDIRECT_URI) for tokens via the vpn-core backend. Validates that the URL
 * matches the configured redirect, that PKCE state matches, and that a code
 * is present before contacting the backend. Returns true when tokens were
 * persisted, false otherwise.
 */
export async function exchangeCode(url: string): Promise<boolean> {
  let urlObj: URL;
  let expectedURL: URL | null = null;
  try {
    urlObj = new URL(url);
    if (REDIRECT_URI) {
      expectedURL = new URL(REDIRECT_URI);
    }
  } catch {
    log.error('oauth', 'Invalid callback URL');
    return false;
  }

  const isMatchingCallback = expectedURL && urlObj.origin === expectedURL.origin && urlObj.pathname === expectedURL.pathname;

  if (!isMatchingCallback) {
    log.error('oauth', 'Callback URL does not match configured REDIRECT_URI');
    return false;
  }

  const params = new URLSearchParams(urlObj.search);
  const state = params.get('state');
  const code = params.get('code');

  if (!state) {
    log.error('oauth', 'State mismatch');
    await saveAuthError('invalid_callback');
    return false;
  }
  const pkceVerifier = await loadPkceTransaction(state);
  if (!pkceVerifier) {
    log.error('oauth', 'State mismatch');
    await saveAuthError('invalid_callback');
    return false;
  }
  if (!code) {
    log.error('oauth', 'No authorization code');
    await saveAuthError('invalid_callback');
    await consumePkceTransaction(state);
    return false;
  }

  const redirectUriForExchange = `${urlObj.origin}${urlObj.pathname}`;

  // Exchange through vpn-core so the identity-provider endpoint and client
  // policy have one configured source of truth.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ code, redirect_uri: redirectUriForExchange, code_verifier: pkceVerifier }),
      });

      if (!res.ok) {
        const transient = TRANSIENT_EXCHANGE_STATUSES.has(res.status);
        if (transient && attempt === 0) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After')) || DEFAULT_EXCHANGE_RETRY_MS;
          log.warn('oauth', 'Token exchange transient failure:', res.status, `retrying in ${retryAfterMs}ms`);
          await sleep(retryAfterMs);
          continue;
        }
        log.error('oauth', 'Backend token exchange failed:', res.status);
        await saveAuthError(res.status === 403 ? 'origin_revoked' : 'service_unavailable');
        if (!transient) {
          await consumePkceTransaction(state);
        }
        return false;
      }

      const json = await res.json();
      if (json.data?.access_token) {
        await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
        await clearAuthError();
        await consumePkceTransaction(state);
        log.info('oauth', 'Backend token exchange succeeded');
        return true;
      }

      log.error('oauth', 'Backend token exchange response missing access token');
      await saveAuthError('service_unavailable');
      await consumePkceTransaction(state);
      return false;
    } catch (error) {
      if (attempt === 0) {
        log.warn('oauth', 'Backend token exchange network error, retrying once:', error);
        await sleep(DEFAULT_EXCHANGE_RETRY_MS);
        continue;
      }
      log.error('oauth', 'Backend token exchange error:', error);
      await saveAuthError('service_unavailable');
      return false;
    }
  }

  await consumePkceTransaction(state);
  return false;
}
