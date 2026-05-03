import { defineStore } from 'pinia';
import { meshApi } from '../lib/api';

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

const useMeshStore = defineStore('mesh', {
    state: () => ({
        /** Whether this user is currently an active mesh node */
        nodeActive: false,
        /** Assigned overlay IP (e.g. "10.200.1.2") when active */
        myMeshIp: null,
        /** ID of the underlying mesh network */
        meshId: null,
        /** Other peers visible in the mesh */
        peers: [],
        loading: false,
        error: null,
    }),

    actions: {
        _applyStatus(status) {
            this.nodeActive = !!status?.active;
            this.myMeshIp = status?.mesh_ip ?? null;
            this.meshId = status?.mesh_id ?? null;
            this.peers = status?.peers ?? [];
        },

        async loadNodeStatus() {
            this.loading = true;
            this.error = null;
            try {
                const status = await sendBackgroundMessage({ type: 'nodeStatus' })
                    .catch(() => meshApi.nodeStatus());
                this._applyStatus(status);
            } catch (err) {
                this.error = err.message || 'Failed to load node status';
            } finally {
                this.loading = false;
            }
        },

        async activateNode() {
            this.loading = true;
            this.error = null;
            try {
                const status = await sendBackgroundMessage({ type: 'activateNode' })
                    .catch(() => meshApi.activateNode());
                this._applyStatus(status);
            } catch (err) {
                this.error = err.message || 'Failed to activate mesh node';
                throw err;
            } finally {
                this.loading = false;
            }
        },

        async deactivateNode() {
            this.loading = true;
            this.error = null;
            try {
                const status = await sendBackgroundMessage({ type: 'deactivateNode' })
                    .catch(() => meshApi.deactivateNode());
                this._applyStatus(status);
            } catch (err) {
                this.error = err.message || 'Failed to deactivate mesh node';
                throw err;
            } finally {
                this.loading = false;
            }
        },

        clearError() {
            this.error = null;
        },
    },
});

export default useMeshStore;
