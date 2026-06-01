import { api } from '../lib/api';

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
                this.__lastFetch = now;
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
};

const serverManager = new ServerManager();
export default serverManager;

