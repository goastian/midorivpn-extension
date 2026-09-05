import { defineStore } from "pinia";
import serverManager from '../service/servers';
import log from '../utils/logger';
import { resolveProxyServer } from '../utils/proxy-routing';

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
        selectionMode: 'automatic',
        manualServerId: '',
        failoverPhase: 'off',
        failoverError: '',
    }),

    actions: {
        async loadServers() {
            this.serversLoading = true;
            try {
                await this.loadFailoverStatus();
            } catch {
                // Continue with the persisted selection while the background
                // worker is being started by the browser.
            }
            const applyResult = (result) => {
                if (!result?.servers) return;
                this.servers = result.servers;
                this.serversMeta = result.meta || null;
                // Pick a sensible default active server when none is set or
                // the previously-active one is no longer in the proxy list.
                const effective = this.active && result.servers.find((s) => s.id === this.active.id);
                const pinned = this.selectionMode === 'manual'
                    ? result.servers.find((s) => s.id === this.manualServerId)
                    : null;
                if (pinned) {
                    this.active = pinned;
                } else if (effective) {
                    this.active = effective;
                } else if (this.selectionMode === 'manual') {
                    this.active = null;
                }
                log.diag('vpn-store', 'loadServers:applied', {
                    receivedServers: result.servers.length,
                    activeId: this.active?.id || null,
                    stillValid: Boolean(effective || pinned),
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

        async setActive(server) {
            // Deep-clone to strip Vue reactive Proxy wrappers; otherwise the
            // object cannot be passed to chrome.storage / chrome.runtime
            // (DataCloneError: Proxy object could not be cloned).
            this.active = server ? JSON.parse(JSON.stringify(server)) : null;
            this.selectionMode = 'manual';
            this.manualServerId = this.active?.id || '';
            log.diag('vpn-store', 'setActive', {
                activeId: this.active?.id || null,
                name: this.active?.name || null,
                proxyEndpoint: resolveProxyServer(this.active),
            });
            const status = await sendBackgroundMessage({
                type: 'setProxySelection',
                selectionMode: 'manual',
                serverId: this.manualServerId,
            });
            this.applyFailoverStatus(status);
        },

        async setAutomatic() {
            this.selectionMode = 'automatic';
            this.manualServerId = '';
            const status = await sendBackgroundMessage({
                type: 'setProxySelection',
                selectionMode: 'automatic',
            });
            this.applyFailoverStatus(status);
        },

        async loadFailoverStatus() {
            const status = await sendBackgroundMessage({ type: 'getProxyFailoverStatus' });
            this.applyFailoverStatus(status);
            return status;
        },

        applyFailoverStatus(status) {
            if (!status) return;
            this.selectionMode = status.selectionMode === 'manual' ? 'manual' : 'automatic';
            this.manualServerId = status.manualServerId || '';
            this.failoverPhase = status.phase || 'off';
            this.failoverError = status.lastError || '';
            if (Object.hasOwn(status, 'activeServer')) this.active = status.activeServer;
        },

    },

    getters: {
        persistFields() {
            // 'servers' is intentionally excluded: the list must always be
            // re-fetched from the API on popup open so deleted servers never
            // reappear from stale storage. Only the active and pinned
            // selection are safe to persist across sessions.
            return ['active', 'selectionMode', 'manualServerId'];
        },
    },
});

export default useServerStore;
