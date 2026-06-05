import { API_URL, REDIRECT_URI } from '../utils/authentification';
import { saveTokens } from './api';
import { parseRetryAfterMs } from '../utils/http';
// @ts-expect-error untyped JS module
import log from '../utils/logger.js';

declare const chrome: any;

const TRANSIENT_EXCHANGE_STATUSES = new Set([502, 503, 504]);
const DEFAULT_EXCHANGE_RETRY_MS = 1000;

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
  if (!REDIRECT_URI) {
    log.error('oauth', 'REDIRECT_URI not configured');
    return false;
  }

  let urlObj: URL;
  let expectedURL: URL;
  try {
    urlObj = new URL(url);
    expectedURL = new URL(REDIRECT_URI);
  } catch {
    log.error('oauth', 'Invalid callback URL');
    return false;
  }

  if (urlObj.origin !== expectedURL.origin || urlObj.pathname !== expectedURL.pathname) {
    log.error('oauth', 'Callback URL does not match configured REDIRECT_URI');
    return false;
  }

  const { pkce_state, pkce_verifier } = await chrome.storage.session.get(['pkce_state', 'pkce_verifier']);
  const params = new URLSearchParams(urlObj.search);
  const state = params.get('state');
  const code = params.get('code');

  if (!state || !pkce_state || state !== pkce_state) {
    log.error('oauth', 'State mismatch');
    return false;
  }
  if (!code) {
    log.error('oauth', 'No authorization code');
    return false;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ code, redirect_uri: REDIRECT_URI, code_verifier: pkce_verifier || '' }),
      });

      if (!res.ok) {
        const transient = TRANSIENT_EXCHANGE_STATUSES.has(res.status);
        if (transient && attempt === 0) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After')) || DEFAULT_EXCHANGE_RETRY_MS;
          log.warn('oauth', 'Token exchange transient failure:', res.status, `retrying in ${retryAfterMs}ms`);
          await sleep(retryAfterMs);
          continue;
        }
        log.error('oauth', 'Token exchange failed:', res.status);
        if (!transient) {
          await chrome.storage.session.remove(['pkce_state', 'pkce_verifier']);
        }
        return false;
      }

      const json = await res.json();
      if (json.data?.access_token) {
        await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
        await chrome.storage.session.remove(['pkce_state', 'pkce_verifier']);
        return true;
      }

      log.error('oauth', 'Token exchange response missing access token');
      await chrome.storage.session.remove(['pkce_state', 'pkce_verifier']);
      return false;
    } catch (error) {
      if (attempt === 0) {
        log.warn('oauth', 'Token exchange network error, retrying once:', error);
        await sleep(DEFAULT_EXCHANGE_RETRY_MS);
        continue;
      }
      log.error('oauth', 'Token exchange error:', error);
      return false;
    }
  }

  return false;
}
