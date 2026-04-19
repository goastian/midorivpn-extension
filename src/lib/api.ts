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

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: Error) => void }> = [];

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
    if (!refresh_token) throw new Error('No refresh token');

    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
    });

    if (!res.ok) throw new Error('Token refresh failed');

    const json: ApiResponse<{ access_token: string; refresh_token?: string; expires_in?: number }> = await res.json();
    if (!json.ok || !json.data?.access_token) throw new Error('Invalid refresh response');

    await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
    return json.data.access_token;
}

async function request<T>(path: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
    const { access_token } = await getTokens();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    if (access_token) {
        headers['Authorization'] = `Bearer ${access_token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401 && !_isRetry) {
        if (!isRefreshing) {
            isRefreshing = true;
            try {
                const newToken = await tryRefreshToken();
                isRefreshing = false;
                processRefreshQueue(null, newToken);
                return request<T>(path, options, true);
            } catch (err) {
                isRefreshing = false;
                processRefreshQueue(err as Error, null);
                await clearTokens();
                throw new Error('Unauthorized');
            }
        } else {
            return new Promise<T>((resolve, reject) => {
                refreshQueue.push({
                    resolve: () => resolve(request<T>(path, options, true)),
                    reject,
                });
            });
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

export { API_URL, getTokens, saveTokens, clearTokens, storageGet, storageSet, storageRemove };
