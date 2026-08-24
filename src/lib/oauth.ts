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

async function getPkce(): Promise<{ pkce_state?: string; pkce_verifier?: string }> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
    try {
      const data = await chrome.storage.session.get(['pkce_state', 'pkce_verifier']);
      if (data?.pkce_state) return data;
    } catch (_) { /* fallback */ }
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    return await chrome.storage.local.get(['pkce_state', 'pkce_verifier']);
  }
  return {};
}

async function clearPkce(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session?.remove) {
    try {
      await chrome.storage.session.remove(['pkce_state', 'pkce_verifier']);
    } catch (_) { /* fallback */ }
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
    await chrome.storage.local.remove(['pkce_state', 'pkce_verifier']);
  }
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

  const { pkce_state, pkce_verifier } = await getPkce();
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

  const redirectUriForExchange = `${urlObj.origin}${urlObj.pathname}`;

  // Exchange through vpn-core so the identity-provider endpoint and client
  // policy have one configured source of truth.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ code, redirect_uri: redirectUriForExchange, code_verifier: pkce_verifier || '' }),
      });

      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch (_err) {
          // ignore parsing error
        }
        const transient = TRANSIENT_EXCHANGE_STATUSES.has(res.status);
        if (transient && attempt === 0) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After')) || DEFAULT_EXCHANGE_RETRY_MS;
          log.warn('oauth', 'Token exchange transient failure:', res.status, errText, `retrying in ${retryAfterMs}ms`);
          await sleep(retryAfterMs);
          continue;
        }
        log.error('oauth', 'Backend token exchange failed:', res.status, errText);
        if (!transient) {
          await clearPkce();
        }
        return false;
      }

      const json = await res.json();
      if (json.data?.access_token) {
        await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
        await clearPkce();
        log.info('oauth', 'Backend token exchange succeeded');
        return true;
      }

      log.error('oauth', 'Backend token exchange response missing access token');
      await clearPkce();
      return false;
    } catch (error) {
      if (attempt === 0) {
        log.warn('oauth', 'Backend token exchange network error, retrying once:', error);
        await sleep(DEFAULT_EXCHANGE_RETRY_MS);
        continue;
      }
      log.error('oauth', 'Backend token exchange error:', error);
      return false;
    }
  }

  await clearPkce();
  return false;
}
