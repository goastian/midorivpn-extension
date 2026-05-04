<template>
    <div class="selector" ref="root">
        <!-- Trigger button -->
        <button
            type="button"
            class="selector-btn"
            @click="toggleDropdown"
            :aria-expanded="open"
        >
            <div class="selector-info">
                <span class="selector-label">{{ selected ? selected.label : 'Select a server…' }}</span>
                <span v-if="selected && selected.ip" class="selector-ip">{{ selected.ip }}</span>
            </div>
            <!-- Lucide chevron-down (MIT) -->
            <svg class="chevron" :class="{ open }" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>

        <!-- Dropdown panel -->
        <div v-if="open" class="selector-menu" role="listbox">
            <div v-if="loading" class="selector-loading">
                <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="#cbd5e1" stroke-width="3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#49B9FF" stroke-width="3" stroke-linecap="round"/>
                </svg>
                <span>Cargando servidores…</span>
            </div>
            <template v-else-if="allOptions.length">
                <button
                    v-for="opt in allOptions"
                    :key="opt.id"
                    type="button"
                    class="selector-item"
                    :class="{ active: selectedId === opt.id }"
                    role="option"
                    :aria-selected="selectedId === opt.id"
                    @click="pick(opt)"
                >
                    <span class="item-main">
                        <span class="item-label">{{ opt.label }}</span>
                        <span v-if="opt.ip" class="item-ip">{{ opt.ip }}</span>
                    </span>
                    <svg v-if="selectedId === opt.id" class="item-check" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </template>

            <div v-else class="selector-empty">
                No servers available
            </div>
        </div>
    </div>
</template>

<script>
import useVpnStore from '../stores/useVpnStore.js';
import useMeshStore from '../stores/useMeshStore.js';
import useSettingsStore from '../stores/useSettingsStore.js';
import useStore from '../stores/useStore.js';
import badge from '../utils/badge.js';

/** Strips port from an endpoint string ("1.2.3.4:51820" → "1.2.3.4") */
function stripPort(endpoint) {
    if (!endpoint) return '';
    return endpoint.split(':')[0];
}

function isValidCountryCode(code) {
    return /^[A-Z]{2}$/.test(code || '') && code !== 'XX';
}

function countryFlag(code) {
    const normalized = String(code || '').toUpperCase();
    if (!isValidCountryCode(normalized)) return '🏳️';
    return normalized
        .split('')
        .map((char) => String.fromCodePoint(0x1F1E6 + char.charCodeAt(0) - 65))
        .join('');
}

function meshCountryCode(mesh) {
    if (mesh?.country_code) return String(mesh.country_code).toUpperCase();
    const match = String(mesh?.name || '').match(/\[([A-Za-z]{2})\]/);
    return match ? match[1].toUpperCase() : '';
}

function meshDisplayName(mesh) {
    const code = meshCountryCode(mesh);
    if (!isValidCountryCode(code)) return mesh?.name || 'Servidor Random';
    return `Servidor Random ${countryFlag(code)} [${code}]`;
}

export default {
    data() {
        return {
            vpn: useVpnStore(),
            mesh: useMeshStore(),
            settings: useSettingsStore(),
            vpnState: useStore(),
            open: false,
            loading: false,
        };
    },

    computed: {
        selectedId() {
            return this.vpn.active?.id ?? '';
        },

        serverOptions() {
            return this.vpn.servers.map(s => ({
                id: s.id,
                label: s.name || s.country_code,
                ip: stripPort(s.endpoint),
                _isMesh: false,
                _ref: s,
            }));
        },

        meshOptions() {
            if (!this.settings.meshEnabled || !this.mesh.meshList.length) return [];
            return this.mesh.meshList.map((m) => {
                const code = meshCountryCode(m);
                const matchedServer = this.vpn.servers.find(
                    (s) => String(s.country_code || '').toUpperCase() === code
                );
                const ip = matchedServer
                    ? stripPort(matchedServer.endpoint)
                    : (code || '');
                return {
                    id: 'mesh-' + m.id,
                    label: meshDisplayName(m),
                    ip,
                    _isMesh: true,
                    _meshRef: m,
                };
            });
        },

        allOptions() {
            return [...this.serverOptions, ...this.meshOptions];
        },

        selected() {
            return this.allOptions.find(o => o.id === this.selectedId) ?? null;
        },
    },

    async created() {
        // No pre-loading here: data is fetched lazily when the dropdown opens.
    },

    mounted() {
        this._clickOutside = (e) => {
            if (!this.$refs.root?.contains(e.target)) this.open = false;
        };
        document.addEventListener('click', this._clickOutside, true);
    },

    beforeUnmount() {
        document.removeEventListener('click', this._clickOutside, true);
    },

    watch: {
        // Mesh disabled: delete session mesh, clear list and deselect immediately
        'settings.meshEnabled'(newVal) {
            if (!newVal) {
                this.mesh.autoDeleteMesh().catch(() => {});
                this.mesh.clearList();
                if (this.vpn.active?._isMesh) this.vpn.setActive(null);
            } else {
                this.mesh.autoCreateMesh()
                    .catch(() => {})
                    .finally(() => this.mesh.listMeshes().catch(() => {}));
            }
        },
        // VPN disconnects while a mesh entry was selected: clear and deselect
        'vpnState.state'(newVal) {
            if (!newVal && this.vpn.active?._isMesh) {
                this.mesh.clearList();
                this.vpn.setActive(null);
            }
        },
    },

    methods: {
        async toggleDropdown() {
            if (this.open) {
                this.open = false;
                return;
            }
            this.open = true;
            this.loading = true;
            try {
                await this.vpn.loadServers();
                if (this.settings.meshEnabled) {
                    await this.mesh.autoCreateMesh().catch(() => {});
                    await this.mesh.listMeshes().catch(() => {});
                }
            } finally {
                this.loading = false;
            }
        },

        pick(opt) {
            if (opt._isMesh) {
                this.vpn.setActive({
                    id: opt.id,
                    name: opt.label,
                    _isMesh: true,
                    _meshId: opt._meshRef.id,
                });
            } else {
                this.vpn.setActive(opt._ref);
            }
            this.open = false;
            badge();
        },
    },
};
</script>

<style scoped>
.selector {
    position: relative;
    width: 100%;
    z-index: 90;
}

.selector-btn {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 48px;
    padding: .42rem .65rem;
    border: 1px solid #dbe4ef;
    border-radius: .5rem;
    background-color: white;
    cursor: pointer;
    gap: .5rem;
    text-align: left;
    transition: border-color .15s, box-shadow .15s;
}

.selector-btn:hover {
    border-color: #49B9FF;
}

.selector-btn:focus-visible {
    outline: none;
    border-color: #49B9FF;
    box-shadow: 0 0 0 3px rgba(73, 185, 255, .16);
}

.selector-info {
    display: flex;
    flex-direction: column;
    gap: .1rem;
    flex: 1;
    min-width: 0;
}

.selector-label {
    font-size: .875rem;
    color: #1e293b;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.selector-ip {
    font-size: .68rem;
    color: #94a3b8;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.chevron {
    flex-shrink: 0;
    color: #94a3b8;
    transition: transform .2s;
}

.chevron.open {
    transform: rotate(180deg);
}

.selector-menu {
    position: absolute;
    top: calc(100% + .3rem);
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #dbe4ef;
    border-radius: .55rem;
    box-shadow: 0 16px 32px rgba(15, 23, 42, .16);
    padding: .35rem;
    margin: 0;
    max-height: 128px;
    overflow-y: auto;
    z-index: 150;
}

.selector-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    width: 100%;
    border: 0;
    border-radius: .4rem;
    background: transparent;
    padding: .45rem .5rem;
    cursor: pointer;
    transition: background-color .1s;
    text-align: left;
}

.selector-item:hover {
    background-color: #f1f5f9;
}

.selector-item.active {
    background-color: #eff6ff;
}

.selector-empty {
    color: #94a3b8;
    font-size: .8rem;
    cursor: default;
    text-align: center;
    padding: .7rem .5rem;
}

.selector-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .45rem;
    padding: .75rem .5rem;
    color: #94a3b8;
    font-size: .8rem;
}

.spinner {
    animation: spin .75s linear infinite;
    flex-shrink: 0;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.item-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: .08rem;
    flex: 1;
}

.item-label {
    font-size: .875rem;
    color: #1e293b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.selector-item.active .item-label {
    color: #2563eb;
    font-weight: 500;
}

.item-ip {
    font-size: .68rem;
    color: #94a3b8;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.selector-item.active .item-ip {
    color: #93c5fd;
}

.item-check {
    color: #2563eb;
    flex: 0 0 auto;
}
</style>
