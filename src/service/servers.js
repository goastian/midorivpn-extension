import { api } from '../lib/api';
import log from '../utils/logger.js';

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

            // Never stick to an empty cache for the full TTL: if an admin
            // fixes proxy_port/support on the backend, the popup should pick
            // it up on the next open without waiting 5 minutes.
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
                const proxyServers = servers.filter((server) =>
                    server?.supports_proxy !== false && Number(server?.proxy_port || 0) > 0
                );
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

