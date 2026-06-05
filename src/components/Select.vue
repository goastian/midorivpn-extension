<template>
    <div ref="root" class="selector">
        <!-- Trigger button -->
        <button
            type="button"
            class="selector-btn"
            :aria-expanded="open"
            @click="toggleDropdown"
        >
            <div class="selector-info">
                <span class="selector-label">{{ selected ? selected.label : (showTriggerLoading ? 'Cargando servidores…' : 'Select a server…') }}</span>
                <span v-if="selected && selected.ip" class="selector-ip">{{ selected.ip }}</span>
            </div>
            <svg v-if="showTriggerLoading" class="spinner trigger-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="#cbd5e1" stroke-width="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#49B9FF" stroke-width="3" stroke-linecap="round" />
            </svg>
            <!-- Lucide chevron-down (MIT) -->
            <svg v-else class="chevron" :class="{ open }" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </button>

        <!-- Dropdown panel -->
        <div v-if="open" class="selector-menu" role="listbox">
            <div v-if="isLoading" class="selector-loading">
                <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="#cbd5e1" stroke-width="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#49B9FF" stroke-width="3" stroke-linecap="round" />
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
                        <path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            </template>

            <div v-else class="selector-empty">
                {{ emptyMessage }}
            </div>
        </div>
    </div>
</template>

<script>
import useVpnStore from '../stores/useVpnStore.js';
import badge from '../utils/badge.js';
import log from '../utils/logger.js';

/** Strips port from an endpoint string ("1.2.3.4:51820" → "1.2.3.4") */
function stripPort(endpoint) {
    if (!endpoint) return '';
    return endpoint.split(':')[0];
}

export default {
    data() {
        return {
            vpn: useVpnStore(),
            open: false,
            loading: false,
        };
    },

    computed: {
        selectedId() {
            return this.vpn.active?.id ?? '';
        },

        allOptions() {
            return this.vpn.servers.map(s => ({
                id: s.id,
                label: s.name || s.country_code,
                ip: stripPort(s.endpoint),
                _ref: s,
            }));
        },

        selected() {
            return this.allOptions.find(o => o.id === this.selectedId) ?? null;
        },

        isLoading() {
            return this.loading || this.vpn.serversLoading;
        },

        showTriggerLoading() {
            return this.vpn.serversLoading && !this.selected;
        },

        emptyMessage() {
            const m = this.vpn.serversMeta;
            if (m?.source === 'error') {
                return `No se pudieron cargar servidores: ${m.error || 'error de red'}`;
            }
            if ((m?.total || 0) > 0 && (m?.eligibleProxy || 0) === 0) {
                return 'No hay servidores con proxy habilitado (proxy_port).';
            }
            return 'No servers available';
        },
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

    methods: {
        async toggleDropdown() {
            if (this.open) {
                this.open = false;
                log.diag('selector', 'dropdown:close');
                return;
            }
            this.open = true;
            this.loading = true;
            log.diag('selector', 'dropdown:open', {
                currentOptions: this.allOptions.length,
                selectedId: this.selectedId || null,
            });
            try {
                await this.vpn.loadServers();
                log.diag('selector', 'dropdown:loaded', {
                    options: this.allOptions.length,
                    selectedId: this.selectedId || null,
                });
            } finally {
                this.loading = false;
            }
        },

        pick(opt) {
            log.diag('selector', 'pick', {
                id: opt?.id || null,
                label: opt?.label || null,
                ip: opt?.ip || null,
            });
            this.vpn.setActive(opt._ref);
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
