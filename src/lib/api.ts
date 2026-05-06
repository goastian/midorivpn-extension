/**
 * API client for vpn-core backend.
 * Adapted for browser extension context (chrome.storage.local).
 */

import { encryptToken, decryptToken } from '../utils/crypto-utils';

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
    const raw = await storageGet(['access_token_enc', 'refresh_token_enc', 'token_expires_at', 'access_token', 'refresh_token']);
    const result: StoredTokens = { token_expires_at: raw.token_expires_at };
    // Decrypt if encrypted versions exist; fall back to legacy plaintext for migration.
    if (raw.access_token_enc) {
        try { result.access_token = await decryptToken(raw.access_token_enc); } catch { /* skip */ }
    } else if (raw.access_token) {
        result.access_token = raw.access_token;
    }
    if (raw.refresh_token_enc) {
        try { result.refresh_token = await decryptToken(raw.refresh_token_enc); } catch { /* skip */ }
    } else if (raw.refresh_token) {
        result.refresh_token = raw.refresh_token;
    }
    return result;
}

async function saveTokens(accessToken: string, refreshToken?: string, expiresIn?: number): Promise<void> {
    const data: Record<string, any> = {};
    try {
        data.access_token_enc = await encryptToken(accessToken);
        // Remove any legacy plaintext key
        await storageRemove(['access_token']);
    } catch {
        data.access_token = accessToken; // fallback if SubtleCrypto unavailable
    }
    if (refreshToken) {
        try {
            data.refresh_token_enc = await encryptToken(refreshToken);
            await storageRemove(['refresh_token']);
        } catch {
            data.refresh_token = refreshToken;
        }
    }
    if (expiresIn) data.token_expires_at = Date.now() + expiresIn * 1000;
    await storageSet(data);
}

async function clearTokens(): Promise<void> {
    await storageRemove(['access_token', 'access_token_enc', 'refresh_token', 'refresh_token_enc', 'token_expires_at', 'encryptedToken', 'tokenExpiry']);
}

async function tryRefreshToken(): Promise<string> {
    const { refresh_token } = await getTokens();
    if (!refresh_token) throw new RefreshTokenError('No refresh token', true);

    console.log('[MidoriVPN] api', 'refreshing access token…');

    let res: Response;
    try {
        res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token }),
        });
    } catch (e) {
        console.warn('[MidoriVPN] api', 'refresh network error:', (e as Error)?.message || e);
        throw new RefreshTokenError('Token refresh failed');
    }

    if (!res.ok) {
        const shouldClear = [400, 401, 403].includes(res.status);
        console.warn('[MidoriVPN] api', 'refresh HTTP', res.status, 'shouldClear=', shouldClear);
        throw new RefreshTokenError(`Token refresh failed: ${res.status}`, shouldClear);
    }

    const json: ApiResponse<{ access_token: string; refresh_token?: string; expires_in?: number }> = await res.json();
    if (!json.ok || !json.data?.access_token) {
        console.warn('[MidoriVPN] api', 'refresh response invalid:', json);
        throw new RefreshTokenError('Invalid refresh response');
    }

    await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
    const expires = json.data.expires_in ? `${json.data.expires_in}s` : 'unknown';
    console.log('[MidoriVPN] api', 'refresh OK, expires_in=', expires);
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

// ─── Mesh networking types ────────────────────────────────────────────────────

export interface MeshNetwork {
    id: string;
    name: string;
    description: string;
    owner_id?: string;
    subnet: string;
    /** Only present for the owner of the network */
    invite_code?: string;
    max_members: number;
    is_active: boolean;
    member_count: number;
    country_code?: string;
    public_ip?: string;
    is_session?: boolean;
    created_at: string;
    updated_at: string;
}

export interface MeshMember {
    id: string;
    mesh_id: string;
    user_id: string;
    peer_id?: string;
    mesh_ip: string;
    display_name?: string;
    joined_at: string;
}

export interface MeshDetail extends MeshNetwork {
    members: MeshMember[];
}

export interface MeshNodeStatus {
    active: boolean;
    mesh_ip?: string;
    mesh_id?: string;
    public_ip?: string;
    peers: Array<{ mesh_ip: string; display_name?: string }>;
}

export const meshApi = {
    /** List all mesh networks the current user owns or belongs to */
    list: (): Promise<MeshNetwork[]> =>
        request<MeshNetwork[]>('/api/v1/control/mesh'),

    /** Get a mesh network (with members) by id — caller must be a member */
    get: (id: string): Promise<MeshDetail> =>
        request<MeshDetail>(`/api/v1/control/mesh/${encodeURIComponent(id)}`),

    /** Create a new mesh network */
    create: (name: string, description = '', maxMembers = 10): Promise<MeshNetwork> =>
        request<MeshNetwork>('/api/v1/control/mesh', {
            method: 'POST',
            body: JSON.stringify({ name, description, max_members: maxMembers }),
        }),

    /** Join a mesh network using an invite code */
    join: (inviteCode: string): Promise<MeshMember> =>
        request<MeshMember>('/api/v1/control/mesh/join', {
            method: 'POST',
            body: JSON.stringify({ invite_code: inviteCode }),
        }),

    /** Leave a mesh network (or delete it if you are the owner) */
    leave: (id: string): Promise<{ left?: string; deleted?: string }> =>
        request(`/api/v1/control/mesh/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // ── Simple node activation ─────────────────────────────────────────────
    /** Get this user's mesh node status */
    nodeStatus: (): Promise<MeshNodeStatus> =>
        request<MeshNodeStatus>('/api/v1/control/mesh/node'),

    /** Activate as a mesh node (auto-provisions personal mesh) */
    activateNode: (): Promise<MeshNodeStatus> =>
        request<MeshNodeStatus>('/api/v1/control/mesh/node', { method: 'POST' }),

    /** Deactivate mesh node (leaves / deletes all meshes) */
    deactivateNode: (): Promise<MeshNodeStatus> =>
        request<MeshNodeStatus>('/api/v1/control/mesh/node', { method: 'DELETE' }),

    /** Regenerate the invite code for a mesh the user owns.
     *  Pass expiresInHours = 0 (or omit) for a non-expiring code. */
    createInvite: (meshId: string, expiresInHours = 0): Promise<{ invite_code: string; invite_expires_at?: string }> =>
        request<{ invite_code: string; invite_expires_at?: string }>(
            `/api/v1/control/mesh/${encodeURIComponent(meshId)}/invite`,
            {
                method: 'POST',
                body: JSON.stringify(
                    expiresInHours > 0
                        ? { expires_in_hours: expiresInHours }
                        : {}
                ),
            }
        ),

    /** Create (or return existing) the user's public session mesh named
     *  "Servidor Comunitario 🇩🇴 [CC]". Backend rejects unknown/private origins. */
    autoCreate: (): Promise<MeshNetwork> =>
        request<MeshNetwork>('/api/v1/control/mesh/auto', { method: 'POST' }),

    /** Delete all session meshes for this user.
     *  Call this on logout, browser close, or when the user disables mesh. */
    autoDelete: (): Promise<{ deleted: number }> =>
        request<{ deleted: number }>('/api/v1/control/mesh/auto', { method: 'DELETE' }),
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
