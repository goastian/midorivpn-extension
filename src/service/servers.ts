import { api } from '../lib/api';
import log from '../utils/logger';
import { resolveProxyServer, type ActiveServer } from '../utils/proxy-routing';

export interface ServerRecord extends ActiveServer {
    id: string;
    name?: string;
    country_code?: string;
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

    async loadServers(): Promise<ServerLoadResult> {
        const now = Date.now();

        if (this.serversCache.servers && now - this.lastFetch < SERVER_CACHE_TTL_MS) {
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
}

const serverManager = new ServerManager();
export default serverManager;
