import {
  saveTokens,
  getTokens,
  clearTokens,
  ensureValidAccessToken,
  refreshAccessToken,
} from '../lib/api';
import { exchangeCode } from '../lib/oauth';

/**
 * Thin facade over the token helpers in `lib/api` for callers that prefer an
 * object-oriented API (popup Vue components). New code should import from
 * `lib/api` / `lib/oauth` directly.
 */
class Token {
  getDecryptedToken(): Promise<string | null> {
    return ensureValidAccessToken();
  }

  saveToken(accessToken: string, refreshToken?: string, expiresIn?: number): Promise<void> {
    return saveTokens(accessToken, refreshToken, expiresIn);
  }

  clearToken(): Promise<void> {
    return clearTokens();
  }

  async isValid(): Promise<boolean> {
    return !!(await ensureValidAccessToken());
  }

  async refreshToken(): Promise<string> {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new Error('Token refresh failed');
    return refreshed;
  }

  exchangeCode(url: string): Promise<boolean> {
    return exchangeCode(url);
  }
}

export default Token;
export { getTokens };
