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
            // Deep-clone to strip Vue reactive Proxy wrappers; otherwise the
            // object cannot be passed to chrome.storage / chrome.runtime
            // (DataCloneError: Proxy object could not be cloned).
            const plain = server ? JSON.parse(JSON.stringify(server)) : null;
            this.active = plain;
            serverManager.setActive(plain);
        },

        async provisionConnection() {
            if (!this.active) return 'No server selected';
            if (this.active.supports_proxy === false || !this.active.proxy_port) {
                return 'Selected server does not support browser proxy mode';
            }

            try {
                const connection = await sendBackgroundMessage({
                    type: 'provisionConnection',
                    serverId: this.active.id,
                });

                this.connectionId = null;

                // Store active server for proxy use. Browser mode is proxy-only
                // and must not consume WireGuard peer capacity.
                const plainActive = JSON.parse(JSON.stringify(this.active));
                await chrome.storage.local.set({
                    connection: null,
                    server: { active: plainActive },
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
