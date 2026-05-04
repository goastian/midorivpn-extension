<template>
    <div class="container-control">
        <!-- VPN assigned IP badge (shown only when connected) -->
        <div v-if="storage.state && assignedIp" class="ip-badge">
            <!-- Lucide shield icon (MIT) -->
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 2 3 6v6c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V6l-9-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
            {{ assignedIp }}
        </div>
        <span v-if="storage.state" class="tag active">Connected</span>
        <span v-else class="tag">Disconnected</span>
        <div class="control">
            <button @click="enableproxy" class="btn-control row items-center justify-center" :class="{'active' : storage.state}" :aria-label="storage.state ? 'Disconnect' : 'Connect'">
                <!-- Lucide power icon (MIT) -->
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12 3v9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                    <path d="M6.5 5.5a8 8 0 1 0 11 0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    </div>
</template>

<script>
import useStore from '../stores/useStore';
import useMeshStore from '../stores/useMeshStore';
import useSettingsStore from '../stores/useSettingsStore';
import { enableBadge, disableBadge } from '../utils/badge';
import { disableProxy, enableProxy } from '../utils/proxy';
export default {
    data() {
        return {
            storage: useStore(),
            mesh: useMeshStore(),
            settingsStore: useSettingsStore(),
            assignedIp: null,
        }
    },

    computed: {
        meshIp() {
            if (!this.settingsStore.meshEnabled) return null;
            if (!this.mesh.myMeshIp) return null;
            return this.mesh.myMeshIp;
        }
    },

    async created() {
        if (this.settingsStore.meshEnabled) {
            await this.mesh.loadNodeStatus();
        }
        await this.loadAssignedIp();
    },

    watch: {
        // Refresh IP badge whenever the VPN connects or disconnects
        'storage.state'(newVal) {
            if (newVal) {
                this.loadAssignedIp();
            } else {
                this.assignedIp = null;
            }
        }
    },

    methods: {
        async loadAssignedIp() {
            if (!this.storage.state) {
                this.assignedIp = null;
                return;
            }
            try {
                const data = await new Promise((resolve) =>
                    chrome.storage.local.get(['connection'], resolve)
                );
                // `assigned_ip` comes from the Peer model returned by the backend
                // (e.g. "10.8.0.5/32" — strip the CIDR suffix for display).
                const raw = data?.connection?.assigned_ip || null;
                this.assignedIp = raw ? raw.split('/')[0] : null;
            } catch {
                this.assignedIp = null;
            }
        },

        async enableproxy() {
            if(!this.storage.state) {
                const result = await enableProxy();
                if(result) {
                    await this.storage.changeState();
                    enableBadge();
                }
            } else {
                const result = await disableProxy();
                if(result)  {
                    this.storage.changeState();
                    disableBadge();
                }
            }
        },
    }
}
</script>

<style scoped>
.container-control {
    position: absolute;
    bottom: -44px;
    left: 0;
    right: 0;
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.control {
    width: 128px;
    height: 128px;
    border-radius: 50%;
    background-color: #F1F5F9;
    padding: .85rem;
}

.btn-control {
    width: 100%;
    height: 100%;
    background-color: #E67B7B;
    border-radius: 50%;
    border: none;
    box-shadow: rgba(0, 0, 0, 0.35) 0px -50px 36px -28px inset;
    color: white;
    cursor: pointer;
    transition: background-color .2s ease;
}

.btn-control.active {
    background-color: #4AC176;
}

.btn-control:hover {
    filter: brightness(1.08);
}

.tag {
    position: absolute;
    /* explicit centering — avoids relying on flex static-position */
    left: 50%;
    transform: translateX(-50%);
    top: -24px;
    white-space: nowrap;
    background-color: #FFE6E6;
    color: #E67B7B;
    border: 1px solid #E67B7B;
    border-radius: 1rem;
    padding: .24rem .9rem;
    font-size: .75rem;
    display: flex;
    justify-content: center;
    align-items: center;
}

.tag.active {
    color: #4AC176;
    border-color: #4AC176;
    background-color: #CBFFDE;
}

.mesh-ip-badge {
    display: none; /* reserved for future use */
}

.ip-badge {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -47px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: .28rem;
    font-size: .72rem;
    color: #0369a1;
    background: #e0f2fe;
    border: 1px solid #7dd3fc;
    border-radius: 1rem;
    padding: .15rem .6rem;
    font-weight: 500;
}
</style>
