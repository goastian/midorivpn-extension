import { api } from '../lib/api';

class ServerManager {
    __serversCache;
    __lastFetch;
    __TTL;
    constructor() {
        this.__serversCache = {
            servers: null,
            active: null,
        };
        this.__lastFetch = 0;
        this.__TTL = 60 * 60 * 1000;
    };

    async loadServers() {
        const now = Date.now();

        if (this.__serversCache.servers && now - this.__lastFetch < this.__TTL) {
            return this.__serversCache;
        }

        try {
            const servers = await api.get('/api/v1/control/servers');

            if (Array.isArray(servers) && servers.length > 0) {
                const proxyServers = servers.filter((server) =>
                    server?.supports_proxy !== false && Number(server?.proxy_port || 0) > 0
                );
                this.__serversCache.servers = proxyServers;
                if (
                    !this.__serversCache.active ||
                    !proxyServers.some((server) => server.id === this.__serversCache.active?.id)
                ) {
                    this.__serversCache.active = proxyServers[0] || null;
                }
                this.__lastFetch = now;

                if (this.__serversCache.active) {
                    // Persist active server for proxy usage
                    await chrome.storage.local.set({
                        server: { active: this.__serversCache.active }
                    });
                }
            }

            return this.__serversCache;
        } catch (error) {
            console.error('Error loading servers:', error);
            return this.__serversCache;
        }
    };

    getServers() {
        return this.__serversCache;
    };

    setActive(server) {
        // Deep-clone before persisting: `server` is often a Vue reactive Proxy
        // that cannot be structured-cloned into chrome.storage (DataCloneError).
        const plain = server ? JSON.parse(JSON.stringify(server)) : null;
        this.__serversCache.active = plain;
        chrome.storage.local.set({
            server: { active: plain }
        });
    };
};

const serverManager = new ServerManager();
export default serverManager;
