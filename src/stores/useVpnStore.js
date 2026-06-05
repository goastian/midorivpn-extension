import { defineStore } from "pinia";
import serverManager from '../service/servers.js';
import log from '../utils/logger.js';

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
        serversLoading: false,
        serversMeta: null,
        active: null,
        connectionId: null,
    }),

    actions: {
        async loadServers() {
            this.serversLoading = true;
            const applyResult = (result) => {
                if (!result?.servers) return;
                this.servers = result.servers;
                this.serversMeta = result.meta || null;
                // Pick a sensible default active server when none is set or
                // the previously-active one is no longer in the proxy list.
                const stillValid = this.active && result.servers.some((s) => s.id === this.active.id);
                if (!stillValid) {
                    this.active = result.servers[0] || null;
                }
                log.diag('vpn-store', 'loadServers:applied', {
                    receivedServers: result.servers.length,
                    activeId: this.active?.id || null,
                    stillValid,
                    meta: this.serversMeta,
                });
            };

            try {
                // Keep network calls in background so popup lifecycle does not cancel requests.
                applyResult(await loadServersFromBackground());
            } catch (error) {
                log.diag('vpn-store', 'loadServers:background-failed', error?.message || String(error));
                // Fallback to direct request in case background messaging is temporarily unavailable.
                try {
                    applyResult(await serverManager.loadServers());
                } catch (fallbackError) {
                    log.error('vpn-store', 'Error loading servers:', fallbackError || error);
                }
            } finally {
                this.serversLoading = false;
            }
        },

        setActive(server) {
            // Deep-clone to strip Vue reactive Proxy wrappers; otherwise the
            // object cannot be passed to chrome.storage / chrome.runtime
            // (DataCloneError: Proxy object could not be cloned).
            this.active = server ? JSON.parse(JSON.stringify(server)) : null;
            log.diag('vpn-store', 'setActive', {
                activeId: this.active?.id || null,
                name: this.active?.name || null,
                proxyPort: this.active?.proxy_port || null,
                supportsProxy: this.active?.supports_proxy,
            });
            // Persistence is handled by chromeStoragePlugin via $subscribe.
        },

        async provisionConnection() {
            log.diag('vpn-store', 'provisionConnection:start', {
                activeId: this.active?.id || null,
                proxyPort: this.active?.proxy_port || null,
                supportsProxy: this.active?.supports_proxy,
            });
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
                log.diag('vpn-store', 'provisionConnection:ok', { activeId: this.active.id });
                return null; // success
            } catch (error) {
                log.error('vpn-store', 'Error provisioning connection:', error);
                return error.message || 'Failed to create connection';
            }
        },
    },

    getters: {
        persistFields() {
            // 'servers' is intentionally excluded: the list must always be
            // re-fetched from the API on popup open so deleted servers never
            // reappear from stale storage. Only the active selection and
            // connection id are safe to persist across sessions.
            return ['connectionId', 'active'];
        },
    },
});

export default useServerStore;
