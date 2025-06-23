import { encryptToken, decryptToken } from './crypto-utils';
import Authentification from './authentification';

interface TokenStorage {
  encryptedToken?: string;
  tokenExpiry?: number;
}

class Token {
  private static readonly DEFAULT_EXPIRATION = 3_600_000;

  async saveEncryptedToken(token: string, expiresIn: number = 2_592_000_000): Promise<void> {
    try {
      const encrypted = await encryptToken(token);
      const storageData: TokenStorage = {
        encryptedToken: JSON.stringify(encrypted),
        tokenExpiry: Date.now() + expiresIn
      };

      await chrome.storage.local.set(storageData);
    } catch (error) {
      console.error('Error saving encrypted token:', error);
      throw new Error('Failed to save encrypted token');
    }
  }

  /**
   * 
   * @returns 
   */
  async getDecryptedToken(): Promise<string | null> {
    try {
      const data = await chrome.storage.local.get(['encryptedToken', 'tokenExpiry']) as TokenStorage;

      if (!Token.isTokenValid(data)) {
        return null;
      }

      // Parseamos y validamos la estructura
      const encrypted = JSON.parse(data.encryptedToken!);
      return await decryptToken(encrypted);
    } catch (error) {
      console.error("Error getting token:", error);
      await this.clearToken(); // Limpiamos token inválido
      return null;
    }
  }

  async clearToken(): Promise<void> {
    await chrome.storage.local.remove(['encryptedToken', 'tokenExpiry']);
  }

  // Método estático privado para validación
  private static isTokenValid(data: TokenStorage): boolean {
    return !!data.encryptedToken &&
      !!data.tokenExpiry &&
      data.tokenExpiry > Date.now();
  }

  async verificate() {
    const token = await this.getDecryptedToken();
    try {
      const res = await fetch(`${process.env.PASSPORT_SERVER}/api/gateway/check-authentication`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
      });

      if (res.status == 200) {
        //const data = await res.json();
        return true;
      }
      if(res.status == 401){
        const authentification = new Authentification();
        this.clearToken();
        await authentification.logout();
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async ngOnInit(url: string) {

    chrome.storage.local.get(['state', 'code_verifier'], async (storage) => {
      //Get state
      const state: string | null = storage.state;

      //get code verifier
      const code_verifier: string | null = storage.code_verifier;

      //Get current URL
      const urlObj = new URL(url);
      const query: URLSearchParams = new URLSearchParams(urlObj.search);

      //Checking state
      if (state && state === query.get('state')) {
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.PASSPORT_SERVER_ID || '',
          redirect_uri: `${process.env.PASSPORT_PROXY_SERVER}/callback`,
          code_verifier: code_verifier || '',
          code: query.get('code') || '',
        });

        //Make request to the Aouth2 server to get access token and refresh token
        try {
          const res = await fetch(`${process.env.PASSPORT_SERVER}/api/oauth/token`, {
            method: 'POST',
            body: body.toString(),
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
          });


          if (res.ok) {
            const data = await res.json();
            this.saveEncryptedToken(data.access_token);
          } else {
            console.log('Error response:', res);
          }

        } catch (error) {
          console.error('Fetch error:', error);
        }
      }
    })
  }
}

export default Token;