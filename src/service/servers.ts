import { api } from '../lib/api';
import log from '../utils/logger';
import { resolveProxyServer, type ActiveServer } from '../utils/proxy-routing';
import type { ProxyCandidate } from '../runtime/proxy-failover';

export interface ServerRecord extends ActiveServer {
    id: string;
    name?: string;
    location?: string;
    country_code?: string;
    probe_url?: string;
}

export interface ServerLoadMetadata {
    total: number;
    eligibleProxy: number;
    filteredOut: number;
    source: 'init' | 'cache' | 'network' | 'error';
    error: string | null;
}

export interface ServerLoadResult {
    servers: ServerRecord[] | null;
    active: ServerRecord | null;
    meta: ServerLoadMetadata;
}

const SERVER_CACHE_TTL_MS = 5 * 60 * 1000;

export class ServerManager {
    private serversCache: ServerLoadResult = {
        servers: null,
        active: null,
        meta: {
            total: 0,
            eligibleProxy: 0,
            filteredOut: 0,
            source: 'init',
            error: null,
        },
    };

    private lastFetch = 0;

    async loadServers(forceRefresh = false): Promise<ServerLoadResult> {
        const now = Date.now();

        if (!forceRefresh && this.serversCache.servers && now - this.lastFetch < SERVER_CACHE_TTL_MS) {
            const count = this.serversCache.servers.length;
            if (count > 0) {
                this.serversCache.meta = {
                    ...this.serversCache.meta,
                    source: 'cache',
                    error: null,
                };
                return this.serversCache;
            }

            // Never retain an empty cache for the full TTL: transport health
            // may recover before the next popup is opened.
            log.diag('servers', 'cache-empty -> refetch', {
                ageMs: now - this.lastFetch,
                ttlMs: SERVER_CACHE_TTL_MS,
            });
        }

        try {
            log.diag('servers', 'cache-miss -> fetching /api/v1/control/servers');
            const servers = await api.get<ServerRecord[]>('/api/v1/control/servers');
            const total = Array.isArray(servers) ? servers.length : 0;
            const proxyServers = Array.isArray(servers)
                ? servers.filter((server) => resolveProxyServer(server) !== null)
                : [];

            log.diag('servers', proxyServers.length > 0 ? 'fetched' : 'fetched-empty', {
                total,
                eligibleProxy: proxyServers.length,
                filteredOut: total - proxyServers.length,
            });
            this.serversCache.servers = proxyServers;
            this.lastFetch = now;
            this.serversCache.meta = {
                total,
                eligibleProxy: proxyServers.length,
                filteredOut: total - proxyServers.length,
                source: 'network',
                error: null,
            };
            return this.serversCache;
        } catch (error) {
            log.error('servers', 'Error loading servers:', error);
            this.serversCache.meta = {
                ...this.serversCache.meta,
                source: 'error',
                error: error instanceof Error ? error.message : String(error),
            };
            return this.serversCache;
        }
    }

    getServers(): ServerLoadResult {
        return this.serversCache;
    }

    async loadProxyCandidates(): Promise<ProxyCandidate[]> {
        const payload = await api.get<unknown>('/api/v1/control/servers/candidates?protocol=proxy');
        if (!Array.isArray(payload)) throw new Error('Invalid proxy candidate response');
        return payload.map(normalizeProxyCandidate);
    }

    async getManualCandidate(serverId: string): Promise<ProxyCandidate | null> {
        const result = await this.loadServers(true);
        const server = result.servers?.find((entry) => entry.id === serverId);
        if (!server) return null;
        const proxy = resolveProxyServer(server);
        const probeURL = normalizeProbeURL(server.probe_url);
        if (!proxy || !validEndpointHost(proxy.host) || !probeURL) return null;
        return {
            ...server,
            id: server.id,
            name: server.name || server.country_code || 'Global Server',
            location: server.location || '',
            country_code: server.country_code || '',
            protocol: 'proxy',
            probe_url: probeURL,
            endpoint: proxy.host,
            port: proxy.port,
            priority: 0,
        };
    }
}

function normalizeProbeURL(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
        if (parsed.pathname !== '/.well-known/midorivpn/edge-health') return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function normalizeProxyCandidate(value: unknown): ProxyCandidate {
    if (!value || typeof value !== 'object') throw new Error('Invalid proxy candidate');
    const candidate = value as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id : '';
    const name = typeof candidate.name === 'string' ? candidate.name : '';
    const endpoint = typeof candidate.endpoint === 'string' ? candidate.endpoint.trim() : '';
    const port = Number(candidate.port);
    const priority = Number(candidate.priority);
    const probeURL = normalizeProbeURL(candidate.probe_url);
    if (!id || !name || candidate.protocol !== 'proxy' || !validEndpointHost(endpoint) || !probeURL ||
        !Number.isInteger(port) || port < 1 || port > 65535 ||
        !Number.isInteger(priority) || priority < 0 || priority > 1000) {
        throw new Error('Invalid proxy candidate');
    }
    return {
        id,
        name,
        location: typeof candidate.location === 'string' ? candidate.location : '',
        country_code: typeof candidate.country_code === 'string' ? candidate.country_code : '',
        protocol: 'proxy',
        probe_url: probeURL,
        endpoint,
        port,
        priority,
        transports: [{
            protocol: 'proxy',
            host: endpoint,
            port,
            enabled: true,
            health_status: 'healthy',
        }],
    };
}

function validEndpointHost(value: string): boolean {
    return value.length > 0 && value.length <= 253 &&
        !value.includes('://') && !/[\s/@?#]/.test(value);
}

const serverManager = new ServerManager();
export default serverManager;
