<template>
    <select v-model="selectedId">
        <optgroup v-if="vpn.servers.length" label="VPN Servers">
            <option v-for="server in vpn.servers" :key="server.id" :value="server.id">
                {{ server.name || server.country_code }}
            </option>
        </optgroup>
        <optgroup v-if="settings.meshEnabled && mesh.meshList.length" label="Mesh Networks">
            <option v-for="m in mesh.meshList" :key="'mesh-' + m.id" :value="'mesh-' + m.id">
                {{ m.name }}
            </option>
        </optgroup>
        <!-- Fallback: flat list if no optgroup labels wanted -->
        <template v-if="!vpn.servers.length && !mesh.meshList.length">
            <option value="" disabled>No servers available</option>
        </template>
    </select>
</template>

<script>
import useVpnStore from '../stores/useVpnStore.js';
import useMeshStore from '../stores/useMeshStore.js';
import useSettingsStore from '../stores/useSettingsStore.js';
import badge from '../utils/badge.js';
export default {
    data() {
        return {
            vpn: useVpnStore(),
            mesh: useMeshStore(),
            settings: useSettingsStore(),
        }
    },

    computed: {
        selectedId: {
            get() { return this.vpn.active?.id ?? ''; },
            set(id) {
                // Mesh network entry: key prefixed with "mesh-"
                if (typeof id === 'string' && id.startsWith('mesh-')) {
                    const meshId = id.slice(5);
                    const meshEntry = this.mesh.meshList.find(m => m.id === meshId);
                    if (meshEntry) {
                        // Represent a mesh network as a pseudo-server entry so
                        // the rest of the store interface doesn't change.
                        this.vpn.setActive({ id, name: meshEntry.name, _isMesh: true, _meshId: meshId });
                    }
                    return;
                }
                const server = this.vpn.servers.find(s => s.id === id);
                if (server) this.vpn.setActive(server);
            }
        }
    },

    async created() {
        if (this.settings.meshEnabled) {
            await this.mesh.listMeshes().catch(() => {});
        }
    },

    watch: {
        selectedId() {
            badge();
        }
    }
}
</script>

<style scoped>
select {
    padding: .4rem 1rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: .4rem;
    background-color: white;
    font-size: .875rem;
    color: #1e293b;
    width: 100%;
    cursor: pointer;
}

optgroup {
    font-size: .75rem;
    color: #94a3b8;
    font-weight: 600;
}
</style>