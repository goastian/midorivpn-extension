/**
 * API client for vpn-core backend.
 * Adapted for browser extension context (chrome.storage.local).
 */

const API_URL = process.env.API_URL || '';

interface ApiResponse<T = any> {
    ok: boolean;
    data: T;
    error?: string;
}

interface StoredTokens {
    access_token?: string;
    refresh_token?: string;
    token_expires_at?: number;
}

class RefreshTokenError extends Error {
    shouldClear: boolean;

    constructor(message: string, shouldClear = false) {
        super(message);
        this.name = 'RefreshTokenError';
        this.shouldClear = shouldClear;
    }
}

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: Error) => void }> = [];

// Refresh 3 minutes before exp so that bursts of concurrent proxy requests do
// not race a token that is seconds away from expiration. Proxy CONNECTs happen
// many times per page load and each one re-checks the token validity.
const TOKEN_REFRESH_LEEWAY_MS = 3 * 60 * 1000;

function processRefreshQueue(error: Error | null, token: string | null) {
    refreshQueue.forEach(({ resolve, reject }) => {
        if (error) reject(error);
        else resolve(token!);
    });
    refreshQueue = [];
}

function storageGet(keys: string[]): Promise<Record<string, any>> {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
}

function storageSet(data: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set(data, () => resolve());
    });
}

function storageRemove(keys: string[]): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.remove(keys, () => resolve());
    });
}

async function getTokens(): Promise<StoredTokens> {
    return storageGet(['access_token', 'refresh_token', 'token_expires_at']);
}

async function saveTokens(accessToken: string, refreshToken?: string, expiresIn?: number): Promise<void> {
    const data: Record<string, any> = { access_token: accessToken };
    if (refreshToken) data.refresh_token = refreshToken;
    if (expiresIn) data.token_expires_at = Date.now() + expiresIn * 1000;
    await storageSet(data);
}

async function clearTokens(): Promise<void> {
    await storageRemove(['access_token', 'refresh_token', 'token_expires_at', 'encryptedToken', 'tokenExpiry']);
}

async function tryRefreshToken(): Promise<string> {
    const { refresh_token } = await getTokens();
    if (!refresh_token) throw new RefreshTokenError('No refresh token', true);

    let res: Response;
    try {
        res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token }),
        });
    } catch {
        throw new RefreshTokenError('Token refresh failed');
    }

    if (!res.ok) {
        throw new RefreshTokenError(`Token refresh failed: ${res.status}`, [400, 401, 403].includes(res.status));
    }

    const json: ApiResponse<{ access_token: string; refresh_token?: string; expires_in?: number }> = await res.json();
    if (!json.ok || !json.data?.access_token) {
        throw new RefreshTokenError('Invalid refresh response');
    }

    await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
    return json.data.access_token;
}

function isTokenExpiringSoon(tokenExpiresAt?: number): boolean {
    if (!tokenExpiresAt) {
        return false;
    }

    return tokenExpiresAt - Date.now() <= TOKEN_REFRESH_LEEWAY_MS;
}

async function refreshAccessToken(): Promise<string> {
    if (!isRefreshing) {
        isRefreshing = true;
        try {
            const newToken = await tryRefreshToken();
            processRefreshQueue(null, newToken);
            return newToken;
        } catch (err) {
            processRefreshQueue(err as Error, null);
            throw err;
        } finally {
            isRefreshing = false;
        }
    }

    return new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
    });
}

async function ensureValidAccessToken(forceRefresh = false): Promise<string | null> {
    const { access_token, refresh_token, token_expires_at } = await getTokens();

    if (!forceRefresh) {
        if (access_token && !isTokenExpiringSoon(token_expires_at)) {
            return access_token;
        }

        if (!access_token && !refresh_token) {
            return null;
        }
    }

    if (!refresh_token) {
        if (access_token && (!token_expires_at || token_expires_at > Date.now())) {
            return access_token;
        }

        return null;
    }

    try {
        return await refreshAccessToken();
    } catch (err) {
        if ((err as RefreshTokenError).shouldClear) {
            await clearTokens();
        }

        if (access_token && token_expires_at && token_expires_at > Date.now()) {
            return access_token;
        }

        return null;
    }
}

async function getRefreshAlarmTimestamp(): Promise<number | null> {
    const { refresh_token, token_expires_at } = await getTokens();

    if (!refresh_token || !token_expires_at) {
        return null;
    }

    return token_expires_at - TOKEN_REFRESH_LEEWAY_MS;
}

async function request<T>(path: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
    const access_token = await ensureValidAccessToken();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    if (access_token) {
        headers['Authorization'] = `Bearer ${access_token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401 && !_isRetry) {
        try {
            const newToken = await refreshAccessToken();

            return request<T>(path, {
                ...options,
                headers: {
                    ...headers,
                    Authorization: `Bearer ${newToken}`,
                },
            }, true);
        } catch (err) {
            if ((err as RefreshTokenError).shouldClear) {
                await clearTokens();
            }

            throw new Error('Unauthorized');
        }
    }

    if (res.status === 401 && _isRetry) {
        await clearTokens();
        throw new Error('Unauthorized');
    }

    const json: ApiResponse<T> = await res.json();

    if (!res.ok || json.error) {
        throw new Error(json.error || `Request failed: ${res.status}`);
    }

    return json.data;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: any) =>
        request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    put: <T>(path: string, body?: any) =>
        request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export {
    API_URL,
    TOKEN_REFRESH_LEEWAY_MS,
    clearTokens,
    ensureValidAccessToken,
    getRefreshAlarmTimestamp,
    getTokens,
    refreshAccessToken,
    saveTokens,
    storageGet,
    storageRemove,
    storageSet,
};
