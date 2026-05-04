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
        /** Session mesh created for this user; hidden from this user's public directory */
        ownSessionMeshId: null,
        /** Other peers visible in the mesh */
        peers: [],
        /** All mesh networks the user owns or has joined */
        meshList: [],
        /** Currently viewed mesh detail (with members) */
        currentMesh: null,
        loading: false,
        error: null,
    }),

    getters: {
        publicMeshList(state) {
            const ownId = state.ownSessionMeshId || state.meshId;
            if (!ownId) return state.meshList;
            return state.meshList.filter((mesh) => mesh.id !== ownId);
        },
    },

    actions: {
        _applyStatus(status) {
            this.nodeActive = !!status?.active;
            this.myMeshIp = status?.mesh_ip ?? null;
            this.meshId = status?.mesh_id ?? null;
            if (status?.mesh_id) {
                this.ownSessionMeshId = status.mesh_id;
                this.meshList = this.meshList.filter((mesh) => mesh.id !== status.mesh_id);
            }
            this.peers = status?.peers ?? [];
        },

        _setMeshList(meshes) {
            const list = Array.isArray(meshes) ? meshes : [];
            const ownId = this.ownSessionMeshId || this.meshId;
            this.meshList = ownId ? list.filter((mesh) => mesh.id !== ownId) : list;
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

        async listMeshes() {
            this.loading = true;
            this.error = null;
            try {
                const meshes = await sendBackgroundMessage({ type: 'listMeshes' })
                    .catch(() => meshApi.list());
                this._setMeshList(meshes);
            } catch (err) {
                this.error = err.message || 'Failed to load mesh list';
            } finally {
                this.loading = false;
            }
        },

        async getMesh(meshId) {
            this.loading = true;
            this.error = null;
            try {
                this.currentMesh = await sendBackgroundMessage({ type: 'getMesh', meshId })
                    .catch(() => meshApi.get(meshId));
            } catch (err) {
                this.error = err.message || 'Failed to load mesh';
                throw err;
            } finally {
                this.loading = false;
            }
        },

        async createMesh({ name, description = '', maxMembers = 10 }) {
            this.loading = true;
            this.error = null;
            try {
                const mesh = await sendBackgroundMessage({ type: 'createMesh', name, description, maxMembers })
                    .catch(() => meshApi.create(name, description, maxMembers));
                this.meshList = [mesh, ...this.meshList];
                return mesh;
            } catch (err) {
                this.error = err.message || 'Failed to create mesh';
                throw err;
            } finally {
                this.loading = false;
            }
        },

        async joinMesh(inviteCode) {
            this.loading = true;
            this.error = null;
            try {
                const member = await sendBackgroundMessage({ type: 'joinMesh', inviteCode })
                    .catch(() => meshApi.join(inviteCode));
                // Refresh list so the new mesh appears
                await this.listMeshes();
                return member;
            } catch (err) {
                this.error = err.message || 'Failed to join mesh';
                throw err;
            } finally {
                this.loading = false;
            }
        },

        async leaveMesh(meshId) {
            this.loading = true;
            this.error = null;
            try {
                await sendBackgroundMessage({ type: 'leaveMesh', meshId })
                    .catch(() => meshApi.leave(meshId));
                this.meshList = this.meshList.filter(m => m.id !== meshId);
                if (this.currentMesh?.id === meshId) this.currentMesh = null;
            } catch (err) {
                this.error = err.message || 'Failed to leave mesh';
                throw err;
            } finally {
                this.loading = false;
            }
        },

        async createInvite(meshId, expiresInHours = 0) {
            this.loading = true;
            this.error = null;
            try {
                const result = await sendBackgroundMessage({ type: 'createInvite', meshId, expiresInHours })
                    .catch(() => meshApi.createInvite(meshId, expiresInHours));
                // Update invite_code in meshList cache
                const idx = this.meshList.findIndex(m => m.id === meshId);
                if (idx !== -1) this.meshList[idx] = { ...this.meshList[idx], invite_code: result.invite_code };
                if (this.currentMesh?.id === meshId) this.currentMesh = { ...this.currentMesh, invite_code: result.invite_code };
                return result;
            } catch (err) {
                this.error = err.message || 'Failed to create invite';
                throw err;
            } finally {
                this.loading = false;
            }
        },

        clearError() {
            this.error = null;
        },

        /** Remove all mesh entries immediately (called when mesh is disabled or VPN disconnects) */
        clearList() {
            this.meshList = [];
            this.currentMesh = null;
        },

        /** Create (or return existing) session mesh for this user.
         *  The backend names it "Servidor Random 🇩🇴 [CC]" based on public IP. */
        async autoCreateMesh() {
            try {
                const mesh = await sendBackgroundMessage({ type: 'autoCreateMesh' });
                this.ownSessionMeshId = mesh?.id ?? this.ownSessionMeshId;
                this.meshId = mesh?.id ?? this.meshId;
                this.meshList = this.meshList.filter(m => m.id !== mesh?.id);
                return mesh;
            } catch (err) {
                // Non-fatal: log and continue — VPN still works without mesh.
                console.warn('[useMeshStore] autoCreateMesh failed:', err?.message || err);
            }
        },

        /** Delete all session meshes for this user (logout / browser close). */
        async autoDeleteMesh() {
            try {
                const result = await sendBackgroundMessage({ type: 'autoDeleteMesh' });
                this.clearList();
                return result;
            } catch (err) {
                console.warn('[useMeshStore] autoDeleteMesh failed:', err?.message || err);
            }
        },
    },
});

export default useMeshStore;
