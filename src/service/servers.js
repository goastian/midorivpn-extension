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
                this.__serversCache.servers = servers;
                if (!this.__serversCache.active) {
                    this.__serversCache.active = servers[0];
                }
                this.__lastFetch = now;

                // Persist active server for proxy usage
                await chrome.storage.local.set({
                    server: { active: this.__serversCache.active }
                });
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
        this.__serversCache.active = server;
        chrome.storage.local.set({
            server: { active: server }
        });
    };
};

const serverManager = new ServerManager();
export default serverManager;