import { api } from '../lib/api';
import log from '../utils/logger.js';
import { resolveProxyServer } from '../utils/proxy-routing';

// Background-only thin cache for the server list. Storage persistence of the
// active server is owned by the Pinia chromeStoragePlugin on the popup side;
// this module never writes to chrome.storage.
class ServerManager {
    __serversCache;
    __lastFetch;
    __TTL;
    constructor() {
        this.__serversCache = {
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
        this.__lastFetch = 0;
        this.__TTL = 5 * 60 * 1000;
    };

    async loadServers() {
        const now = Date.now();

        if (this.__serversCache.servers && now - this.__lastFetch < this.__TTL) {
            const count = this.__serversCache.servers.length;
            if (count > 0) {
                this.__serversCache.meta = {
                    ...this.__serversCache.meta,
                    source: 'cache',
                    error: null,
                };
                return this.__serversCache;
            }

            // Never stick to an empty cache for the full TTL: a transport may
            // become healthy on the next backend probe.
            log.diag('servers', 'cache-empty -> refetch', {
                ageMs: now - this.__lastFetch,
                ttlMs: this.__TTL,
            });
        }

        try {
            log.diag('servers', 'cache-miss -> fetching /api/v1/control/servers');
            const servers = await api.get('/api/v1/control/servers');
            const total = Array.isArray(servers) ? servers.length : 0;

            if (Array.isArray(servers) && servers.length > 0) {
                const proxyServers = servers.filter((server) => resolveProxyServer(server) !== null);
                log.diag('servers', 'fetched', {
                    total,
                    eligibleProxy: proxyServers.length,
                    filteredOut: total - proxyServers.length,
                });
                this.__serversCache.servers = proxyServers;
                this.__lastFetch = now;
                this.__serversCache.meta = {
                    total,
                    eligibleProxy: proxyServers.length,
                    filteredOut: total - proxyServers.length,
                    source: 'network',
                    error: null,
                };
            } else {
                log.diag('servers', 'fetched-empty', { total });
                this.__serversCache.servers = [];
                this.__lastFetch = now;
                this.__serversCache.meta = {
                    total,
                    eligibleProxy: 0,
                    filteredOut: 0,
                    source: 'network',
                    error: null,
                };
            }

            return this.__serversCache;
        } catch (error) {
            log.error('servers', 'Error loading servers:', error);
            this.__serversCache.meta = {
                ...this.__serversCache.meta,
                source: 'error',
                error: error?.message || String(error),
            };
            return this.__serversCache;
        }
    };

    getServers() {
        return this.__serversCache;
    };
};

const serverManager = new ServerManager();
export default serverManager;
