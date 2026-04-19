import { API_URL, REDIRECT_URI } from './authentification';
import { saveTokens, getTokens, clearTokens } from '../lib/api';

class Token {
  async getDecryptedToken(): Promise<string | null> {
    const { access_token, token_expires_at } = await getTokens();
    if (!access_token) return null;

    // If token is expired, attempt refresh
    if (token_expires_at && token_expires_at < Date.now()) {
      try {
        const refreshed = await this.refreshToken();
        return refreshed;
      } catch {
        await this.clearToken();
        return null;
      }
    }

    return access_token;
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
    const { refresh_token } = await getTokens();
    if (!refresh_token) throw new Error('No refresh token');

    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ refresh_token }),
    });

    if (!res.ok) throw new Error('Token refresh failed');

    const json = await res.json();
    if (!json.data?.access_token) throw new Error('Invalid refresh response');

    await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
    return json.data.access_token;
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

    // Clear PKCE state immediately
    await chrome.storage.session.remove(['pkce_state', 'pkce_verifier']);

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
        console.error('Token exchange failed:', res.status);
        return false;
      }

      const json = await res.json();
      if (json.data?.access_token) {
        await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token exchange error:', error);
      return false;
    }
  }
}

export default Token;