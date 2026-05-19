import { API_URL, REDIRECT_URI } from './authentification';
import { saveTokens, getTokens, clearTokens, ensureValidAccessToken, refreshAccessToken } from '../lib/api';

declare const chrome: any;

const TRANSIENT_EXCHANGE_STATUSES = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number {
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(dateMs - Date.now(), 0) : 0;
}

class Token {
  async getDecryptedToken(): Promise<string | null> {
    return ensureValidAccessToken();
  }

  async saveToken(accessToken: string, refreshToken?: string, expiresIn?: number): Promise<void> {
    await saveTokens(accessToken, refreshToken, expiresIn);
  }

  async clearToken(): Promise<void> {
    await clearTokens();
  }

  async isValid(): Promise<boolean> {
    const token = await this.getDecryptedToken();
    return !!token;
  }

  async refreshToken(): Promise<string> {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new Error('Token refresh failed');
    return refreshed;
  }

  /**
   * Exchange authorization code for tokens via vpn-core backend.
   */
  async exchangeCode(url: string): Promise<boolean> {
    const { pkce_state, pkce_verifier } = await chrome.storage.session.get(['pkce_state', 'pkce_verifier']);

    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);

    const state = params.get('state');
    const code = params.get('code');

    if (!state || !pkce_state || state !== pkce_state) {
      console.error('State mismatch');
      return false;
    }

    if (!code) {
      console.error('No authorization code');
      return false;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: pkce_verifier || '',
          }),
        });

        if (!res.ok) {
          const transient = TRANSIENT_EXCHANGE_STATUSES.has(res.status);
          if (transient && attempt === 0) {
            const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After')) || 1000;
            console.warn('Token exchange transient failure:', res.status, `retrying in ${retryAfterMs}ms`);
            await sleep(retryAfterMs);
            continue;
          }

          console.error('Token exchange failed:', res.status);
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

        console.error('Token exchange response missing access token');
        await chrome.storage.session.remove(['pkce_state', 'pkce_verifier']);
        return false;
      } catch (error) {
        if (attempt === 0) {
          console.warn('Token exchange network error, retrying once:', error);
          await sleep(1000);
          continue;
        }
        console.error('Token exchange error:', error);
        return false;
      }
    }

    return false;
  }
}

export default Token;
