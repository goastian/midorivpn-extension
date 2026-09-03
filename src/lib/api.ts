/**
 * API client for vpn-core backend.
 * Adapted for browser extension context (chrome.storage.local).
 */

import { encryptToken, decryptToken } from '../utils/crypto-utils';
import { parseRetryAfterMs } from '../utils/http';
// @ts-expect-error untyped JS module
import log from '../utils/logger.js';

const API_URL = process.env.API_URL || '';

interface ApiSuccess<T> {
    ok: true;
    data: T;
}

interface ApiFailure {
    ok: false;
    error: string;
    code: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class APIError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'APIError';
        this.status = status;
        this.code = code;
    }
}

async function responseError(res: Response, fallback: string): Promise<APIError> {
    let payload: Partial<ApiFailure> = {};
    try {
        payload = await res.json() as Partial<ApiFailure>;
    } catch {
        // Keep the fallback for non-JSON gateway failures.
    }
    return new APIError(
        res.status,
        typeof payload.code === 'string' && payload.code ? payload.code : 'request_failed',
        typeof payload.error === 'string' && payload.error ? payload.error : fallback,
    );
}

interface StoredTokens {
    access_token?: string;
    refresh_token?: string;
    token_expires_at?: number;
}

class RefreshTokenError extends Error {
    shouldClear: boolean;
    transient: boolean;
    retryAfterMs: number;
    cooldownActive: boolean;
    code: string;

    constructor(message: string, shouldClear = false, transient = false, retryAfterMs = 0, cooldownActive = false, code = 'request_failed') {
        super(message);
        this.name = 'RefreshTokenError';
        this.shouldClear = shouldClear;
        this.transient = transient;
        this.retryAfterMs = retryAfterMs;
        this.cooldownActive = cooldownActive;
        this.code = code;
    }
}

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: Error) => void }> = [];
let refreshBlockedUntil = 0;
let refreshFailureCount = 0;
let backoffHydrated = false;

const REFRESH_BACKOFF_STORAGE_KEY = 'midori_refresh_backoff';

// Refresh 3 minutes before exp so that bursts of concurrent proxy requests do
// not race a token that is seconds away from expiration. Proxy CONNECTs happen
// many times per page load and each one re-checks the token validity.
const TOKEN_REFRESH_LEEWAY_MS = 3 * 60 * 1000;
const DEFAULT_REFRESH_COOLDOWN_MS = 30 * 1000;
const MAX_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const TRANSIENT_REFRESH_STATUSES = new Set([429, 502, 503, 504]);

function sessionStorageGet(keys: string[]): Promise<Record<string, any>> {
    return new Promise((resolve) => {
        const session = (chrome.storage as any)?.session;
        if (!session?.get) { resolve({}); return; }
        try { session.get(keys, (r: any) => resolve(r || {})); }
        catch { resolve({}); }
    });
}

function sessionStorageSet(data: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
        const session = (chrome.storage as any)?.session;
        if (!session?.set) { resolve(); return; }
        try { session.set(data, () => resolve()); }
        catch { resolve(); }
    });
}

async function hydrateRefreshBackoff(): Promise<void> {
    if (backoffHydrated) return;
    backoffHydrated = true;
    const stored = await sessionStorageGet([REFRESH_BACKOFF_STORAGE_KEY]);
    const entry = stored[REFRESH_BACKOFF_STORAGE_KEY];
    if (entry && typeof entry === 'object') {
        if (Number.isFinite(entry.refreshBlockedUntil)) {
            refreshBlockedUntil = entry.refreshBlockedUntil;
        }
        if (Number.isFinite(entry.refreshFailureCount)) {
            refreshFailureCount = entry.refreshFailureCount;
        }
    }
}

function persistRefreshBackoff(): void {
    sessionStorageSet({
        [REFRESH_BACKOFF_STORAGE_KEY]: { refreshBlockedUntil, refreshFailureCount },
    }).catch(() => { /* ignore */ });
}

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
    const raw = await storageGet(['access_token_enc', 'refresh_token_enc', 'token_expires_at']);
    const result: StoredTokens = { token_expires_at: raw.token_expires_at };
    if (raw.access_token_enc) {
        try { result.access_token = await decryptToken(raw.access_token_enc); } catch { /* skip */ }
    }
    if (raw.refresh_token_enc) {
        try { result.refresh_token = await decryptToken(raw.refresh_token_enc); } catch { /* skip */ }
    }
    return result;
}

async function saveTokens(accessToken: string, refreshToken?: string, expiresIn?: number): Promise<void> {
    const data: Record<string, any> = {
        access_token_enc: await encryptToken(accessToken),
    };
    if (refreshToken) {
        data.refresh_token_enc = await encryptToken(refreshToken);
    }
    if (expiresIn) data.token_expires_at = Date.now() + expiresIn * 1000;
    await storageSet(data);
    await storageRemove(['access_token', 'refresh_token']);
}

async function clearTokens(): Promise<void> {
    invalidateProxyScopedToken();
    await storageRemove(['access_token', 'access_token_enc', 'refresh_token', 'refresh_token_enc', 'token_expires_at', 'encryptedToken', 'tokenExpiry', 'encryptionSalt', 'installEncryptionKey']);
}

function nextRefreshBackoffMs(retryAfterMs = 0): number {
    if (retryAfterMs > 0) {
        return Math.min(retryAfterMs, MAX_REFRESH_COOLDOWN_MS);
    }

    const attempt = Math.min(refreshFailureCount, 4);
    return Math.min(DEFAULT_REFRESH_COOLDOWN_MS * 2 ** attempt, MAX_REFRESH_COOLDOWN_MS);
}

function getRefreshCooldownRemainingMs(): number {
    return Math.max(refreshBlockedUntil - Date.now(), 0);
}

function rememberTransientRefreshFailure(error: RefreshTokenError): RefreshTokenError {
    const cooldownMs = nextRefreshBackoffMs(error.retryAfterMs);
    refreshFailureCount += 1;
    refreshBlockedUntil = Date.now() + cooldownMs;
    persistRefreshBackoff();
    error.retryAfterMs = cooldownMs;
    log.warn('api', 'refresh paused for', `${Math.ceil(cooldownMs / 1000)}s`, '-', error.message);
    return error;
}

function resetRefreshBackoff() {
    refreshFailureCount = 0;
    refreshBlockedUntil = 0;
    persistRefreshBackoff();
}

async function tryRefreshToken(): Promise<string> {
    await hydrateRefreshBackoff();
    const cooldownMs = getRefreshCooldownRemainingMs();
    if (cooldownMs > 0) {
        throw new RefreshTokenError(
            `Token refresh paused for ${Math.ceil(cooldownMs / 1000)}s`,
            false,
            true,
            cooldownMs,
            true
        );
    }

    const { refresh_token } = await getTokens();
    if (!refresh_token) throw new RefreshTokenError('No refresh token', true);

    log.info('api', 'refreshing access token…');

    let res: Response;
    try {
        res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token }),
        });
    } catch (e) {
        log.warn('api', 'refresh network error:', (e as Error)?.message || e);
        throw new RefreshTokenError('Token refresh failed: network error', false, true);
    }

    if (!res.ok) {
        const shouldClear = [400, 401, 403].includes(res.status);
        const transient = TRANSIENT_REFRESH_STATUSES.has(res.status);
        const retryAfterMs = transient ? parseRetryAfterMs(res.headers.get('Retry-After'), MAX_REFRESH_COOLDOWN_MS) : 0;
        const apiError = await responseError(res, `Token refresh failed: ${res.status}`);
        log.warn('api', 'refresh HTTP', res.status, 'code=', apiError.code, 'shouldClear=', shouldClear);
        throw new RefreshTokenError(apiError.message, shouldClear, transient, retryAfterMs, false, apiError.code);
    }

    const json: ApiResponse<{ access_token: string; refresh_token?: string; expires_in?: number }> = await res.json();
    if (!json.ok || !json.data?.access_token) {
        log.warn('api', 'refresh response invalid:', json);
        throw new RefreshTokenError('Invalid refresh response');
    }

    await saveTokens(json.data.access_token, json.data.refresh_token, json.data.expires_in);
    resetRefreshBackoff();
    const expires = json.data.expires_in ? `${json.data.expires_in}s` : 'unknown';
    log.info('api', 'refresh OK, expires_in=', expires);
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
            const refreshErr = err instanceof RefreshTokenError
                ? err
                : new RefreshTokenError((err as Error)?.message || 'Token refresh failed');

            if (refreshErr.transient && !refreshErr.cooldownActive) {
                rememberTransientRefreshFailure(refreshErr);
            }

            processRefreshQueue(refreshErr, null);
            throw refreshErr;
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
    await hydrateRefreshBackoff();
    const { refresh_token, token_expires_at } = await getTokens();

    if (!refresh_token || !token_expires_at) {
        return null;
    }

    return token_expires_at - TOKEN_REFRESH_LEEWAY_MS;
}

function getNextRefreshAttemptTimestamp(): number | null {
    return getRefreshCooldownRemainingMs() > 0 ? refreshBlockedUntil : null;
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

            throw new APIError(401, 'unauthorized', 'Unauthorized', { cause: err });
        }
    }

    if (res.status === 401 && _isRetry) {
        await clearTokens();
        throw new APIError(401, 'unauthorized', 'Unauthorized');
    }

    if (!res.ok) {
        throw await responseError(res, `Request failed: ${res.status}`);
    }

    const json: ApiResponse<T> = await res.json();
    if (!json.ok) throw new APIError(res.status, json.code, json.error);
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

export interface ProxyCredentialsResponse {
    proxy_token: string;
    expires_in: number;
    device_id: string;
    proxy_endpoint: {
        server_id: string;
        host: string;
        port: number;
        country_code: string;
        location: string;
    };
}

let cachedProxyToken: string | null = null;
let proxyTokenExpiresAt = 0;
const proxyTokenRequests = new Map<string, Promise<string | null>>();
let cachedProxyServerID: string | null = null;
let proxyCredentialGeneration = 0;

const PROXY_DEVICE_IDENTITY_KEY = 'midori_proxy_device_identity_v1';
let proxyDeviceIdentityRequest: Promise<ProxyDeviceIdentity> | null = null;

interface ProxyDeviceIdentity {
    client_instance_id: string;
    reported_name: string;
    device_type: 'extension';
}

function randomUUID(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function proxyDeviceIdentity(): Promise<ProxyDeviceIdentity> {
    if (!proxyDeviceIdentityRequest) {
        proxyDeviceIdentityRequest = (async (): Promise<ProxyDeviceIdentity> => {
            const stored = await storageGet([PROXY_DEVICE_IDENTITY_KEY]);
            const existing = stored[PROXY_DEVICE_IDENTITY_KEY] as Partial<ProxyDeviceIdentity> | undefined;
            if (existing?.device_type === 'extension' && typeof existing.client_instance_id === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing.client_instance_id)) {
                return {
                    client_instance_id: existing.client_instance_id,
                    reported_name: 'MidoriVPN Browser Extension',
                    device_type: 'extension',
                };
            }
            const identity: ProxyDeviceIdentity = {
                client_instance_id: randomUUID(),
                reported_name: 'MidoriVPN Browser Extension',
                device_type: 'extension',
            };
            await storageSet({ [PROXY_DEVICE_IDENTITY_KEY]: identity });
            return identity;
        })().catch((error) => {
            proxyDeviceIdentityRequest = null;
            throw error;
        });
    }
    return proxyDeviceIdentityRequest!;
}

async function selectedProxyServerID(explicit?: string): Promise<string | null> {
    if (explicit) return explicit;
    const stored = await storageGet(['server']);
    const candidate = stored.server?.active?.id;
    return typeof candidate === 'string' && candidate ? candidate : null;
}

export function invalidateProxyScopedToken(): void {
    cachedProxyToken = null;
    proxyTokenExpiresAt = 0;
    cachedProxyServerID = null;
    proxyCredentialGeneration += 1;
    proxyTokenRequests.clear();
}

export async function getProxyScopedToken(serverID?: string): Promise<string | null> {
    const selectedServerID = await selectedProxyServerID(serverID);
    if (!selectedServerID) return null;
    const now = Date.now();
    // Cache and reuse if more than 2 minutes of validity remain
    if (cachedProxyToken && cachedProxyServerID === selectedServerID && proxyTokenExpiresAt > now + 2 * 60 * 1000) {
        return cachedProxyToken;
    }

    // A page load can produce several proxy challenges at once. Keep one
    // credential request in flight so every challenge receives the same
    // scoped token instead of starting competing OAuth refreshes.
    if (!proxyTokenRequests.has(selectedServerID)) {
        const requestGeneration = proxyCredentialGeneration;
        const requestForServer = (async () => {
            try {
                const device = await proxyDeviceIdentity();
                const res = await request<ProxyCredentialsResponse>('/api/v1/control/proxy-credentials', {
                    method: 'POST',
                    body: JSON.stringify({ server_id: selectedServerID, device }),
                });
                if (requestGeneration === proxyCredentialGeneration && res && res.proxy_token.startsWith('mvpn2.') &&
                    res.proxy_endpoint?.server_id === selectedServerID && Number.isInteger(res.expires_in) &&
                    res.expires_in > 0 && res.expires_in <= 900) {
                    cachedProxyToken = res.proxy_token;
                    cachedProxyServerID = selectedServerID;
                    proxyTokenExpiresAt = Date.now() + (res.expires_in || 900) * 1000;
                    return cachedProxyToken;
                }
            } catch (e) {
                log.warn('api', 'failed to fetch scoped proxy token', e);
            }

            return null;
        })();
        proxyTokenRequests.set(selectedServerID, requestForServer);
        requestForServer.finally(() => {
            if (proxyTokenRequests.get(selectedServerID) === requestForServer) {
                proxyTokenRequests.delete(selectedServerID);
            }
        });
    }

    return proxyTokenRequests.get(selectedServerID)!;
}

export {
    API_URL,
    TOKEN_REFRESH_LEEWAY_MS,
    clearTokens,
    ensureValidAccessToken,
    getRefreshAlarmTimestamp,
    getNextRefreshAttemptTimestamp,
    getTokens,
    refreshAccessToken,
    saveTokens,
    storageGet,
    storageRemove,
    storageSet,
};
