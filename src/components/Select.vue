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
        <ul v-if="open" class="selector-list" role="listbox">
            <li
                v-for="opt in allOptions"
                :key="opt.id"
                class="selector-item"
                :class="{ active: selectedId === opt.id }"
                role="option"
                :aria-selected="selectedId === opt.id"
                @click="pick(opt)"
            >
                <span class="item-label">{{ opt.label }}</span>
                <span v-if="opt.ip" class="item-ip">{{ opt.ip }}</span>
            </li>
            <li v-if="!allOptions.length" class="selector-item empty">
                No servers available
            </li>
        </ul>
    </div>
</template>

<script>
import useVpnStore from '../stores/useVpnStore.js';
import useMeshStore from '../stores/useMeshStore.js';
import useSettingsStore from '../stores/useSettingsStore.js';
import useStore from '../stores/useStore.js';
import badge from '../utils/badge.js';

/** Returns the first usable IP of a subnet (e.g. "10.200.1.0/24" → "10.200.1.1") */
function subnetGateway(subnet) {
    if (!subnet) return '';
    const ip = subnet.split('/')[0];
    const parts = ip.split('.');
    parts[3] = String(parseInt(parts[3]) + 1);
    return parts.join('.');
}

/** Strips port from an endpoint string ("1.2.3.4:51820" → "1.2.3.4") */
function stripPort(endpoint) {
    if (!endpoint) return '';
    return endpoint.split(':')[0];
}

export default {
    data() {
        return {
            vpn: useVpnStore(),
            mesh: useMeshStore(),
            settings: useSettingsStore(),
            vpnState: useStore(),
            open: false,
        };
    },

    computed: {
        selectedId() {
            return this.vpn.active?.id ?? '';
        },

        allOptions() {
            const serverOpts = this.vpn.servers.map(s => ({
                id: s.id,
                label: s.name || s.country_code,
                ip: stripPort(s.endpoint),
                _isMesh: false,
                _ref: s,
            }));

            const meshOpts = (this.settings.meshEnabled && this.mesh.meshList.length)
                ? this.mesh.meshList.map((m, i) => ({
                    id: 'mesh-' + m.id,
                    label: `Server Random #${String(i + 1).padStart(2, '0')}`,
                    ip: subnetGateway(m.subnet),
                    _isMesh: true,
                    _meshRef: m,
                }))
                : [];

            return [...serverOpts, ...meshOpts];
        },

        selected() {
            return this.allOptions.find(o => o.id === this.selectedId) ?? null;
        },
    },

    async created() {
        if (this.settings.meshEnabled) {
            await this.mesh.listMeshes().catch(() => {});
        }
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
        // Mesh disabled: clear list and deselect immediately
        'settings.meshEnabled'(newVal) {
            if (!newVal) {
                this.mesh.clearList();
                if (this.vpn.active?._isMesh) this.vpn.setActive(null);
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
        toggleDropdown() {
            this.open = !this.open;
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
}

.selector-btn {
    display: flex;
    align-items: center;
    width: 100%;
    padding: .45rem .75rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: .4rem;
    background-color: white;
    cursor: pointer;
    gap: .5rem;
    text-align: left;
    transition: border-color .15s;
}

.selector-btn:hover {
    border-color: #49B9FF;
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
}

.chevron {
    flex-shrink: 0;
    color: #94a3b8;
    transition: transform .2s;
}

.chevron.open {
    transform: rotate(180deg);
}

.selector-list {
    position: absolute;
    top: calc(100% + .3rem);
    left: 0;
    right: 0;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: .4rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, .1);
    padding: .25rem 0;
    list-style: none;
    margin: 0;
    max-height: 160px;
    overflow-y: auto;
    z-index: 50;
}

.selector-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    padding: .45rem .75rem;
    cursor: pointer;
    transition: background-color .1s;
}

.selector-item:hover {
    background-color: #f1f5f9;
}

.selector-item.active {
    background-color: #eff6ff;
}

.selector-item.empty {
    color: #94a3b8;
    font-size: .8rem;
    cursor: default;
    justify-content: center;
}

.item-label {
    font-size: .875rem;
    color: #1e293b;
    flex: 1;
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
    flex-shrink: 0;
}

.selector-item.active .item-ip {
    color: #93c5fd;
}
</style>