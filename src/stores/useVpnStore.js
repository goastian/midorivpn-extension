import { defineStore } from "pinia";
import serverManager from '../service/servers.js';

function sendBackgroundMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime?.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.success) {
                reject(new Error(response?.error || 'Background request failed'));
                return;
            }
            resolve(response.data);
        });
    });
}

function loadServersFromBackground() {
    return sendBackgroundMessage({ type: 'loadServers' });
}

const useServerStore = defineStore('server', {
    state: () => ({
        servers: [],
        active: null,
        connectionId: null,
    }),

    actions: {
        async loadServers() {
            try {
                // Keep network calls in background so popup lifecycle does not cancel requests.
                const result = await loadServersFromBackground();
                if (result?.servers) {
                    this.servers = result.servers;
                    if (!this.active && result.active) {
                        this.active = result.active;
                    }
                }
            } catch (error) {
                // Fallback to direct request in case background messaging is temporarily unavailable.
                try {
                    const result = await serverManager.loadServers();
                    if (result?.servers) {
                        this.servers = result.servers;
                        if (!this.active && result.active) {
                            this.active = result.active;
                        }
                    }
                } catch (fallbackError) {
                    console.error('Error loading servers:', fallbackError || error);
                }
            }
        },

        setActive(server) {
            this.active = server;
            serverManager.setActive(server);
        },

        async provisionConnection() {
            if (!this.active) return 'No server selected';

            try {
                const connection = await sendBackgroundMessage({
                    type: 'provisionConnection',
                    serverId: this.active.id,
                });

                this.connectionId = connection.id;

                // Store connection config for proxy use
                await chrome.storage.local.set({
                    connection: connection,
                    server: { active: this.active },
                });

                return null; // success
            } catch (error) {
                console.error('Error provisioning connection:', error);
                return error.message || 'Failed to create connection';
            }
        },
    },

    getters: {
        persistFields() {
            return ['connectionId', 'active', 'servers'];
        },
    },
});

export default useServerStore;