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
            const applyResult = (result) => {
                if (!result?.servers) return;
                this.servers = result.servers;
                // Pick a sensible default active server when none is set or
                // the previously-active one is no longer in the proxy list.
                const stillValid = this.active && result.servers.some((s) => s.id === this.active.id);
                if (!stillValid) {
                    this.active = result.servers[0] || null;
                }
            };

            try {
                // Keep network calls in background so popup lifecycle does not cancel requests.
                applyResult(await loadServersFromBackground());
            } catch (error) {
                // Fallback to direct request in case background messaging is temporarily unavailable.
                try {
                    applyResult(await serverManager.loadServers());
                } catch (fallbackError) {
                    console.error('Error loading servers:', fallbackError || error);
                }
            }
        },

        setActive(server) {
            // Deep-clone to strip Vue reactive Proxy wrappers; otherwise the
            // object cannot be passed to chrome.storage / chrome.runtime
            // (DataCloneError: Proxy object could not be cloned).
            this.active = server ? JSON.parse(JSON.stringify(server)) : null;
            // Persistence is handled by chromeStoragePlugin via $subscribe.
        },

        async provisionConnection() {
            if (!this.active) return 'No server selected';
            if (this.active.supports_proxy === false || !this.active.proxy_port) {
                return 'Selected server does not support browser proxy mode';
            }

            try {
                await sendBackgroundMessage({
                    type: 'provisionConnection',
                    serverId: this.active.id,
                    activeServer: JSON.parse(JSON.stringify(this.active)),
                });

                this.connectionId = null;
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
