<template>
    <div class="container-control">
        <div v-if="storage.state" class="status-pill active row items-center ga-xs">
            <span class="pulse-dot active"></span>
            <span class="status-text">Connected</span>
        </div>
        <div v-else class="status-pill row items-center ga-xs">
            <span class="pulse-dot"></span>
            <span class="status-text">Disconnected</span>
        </div>

        <div class="control-wrapper" :class="{ 'connected': storage.state }">
            <div v-if="storage.state" class="pulse-ring"></div>
            <div class="control-socket">
                <button
                    class="btn-control row items-center justify-center"
                    :class="{ 'active': storage.state, 'connecting': connecting }"
                    :disabled="connecting"
                    :aria-label="storage.state ? 'Disconnect' : 'Connect'"
                    @click="enableproxy"
                >
                    <svg v-if="connecting" class="spinner" width="36" height="36" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" />
                    </svg>
                    <!-- Lucide power icon (MIT) -->
                    <svg v-else class="power-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 3v9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
                        <path d="M6.5 5.5a8 8 0 1 0 11 0" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
                    </svg>
                </button>
            </div>
        </div>

        <p v-if="permissionError" class="permission-error">{{ permissionError }}</p>
    </div>
</template>

<script>
import useStore from '../stores/useStore';
import { enableBadge, disableBadge } from '../utils/badge';
import { disableProxy, enableProxy, validateProxyReady } from '../utils/proxy';
import { requestRequiredVpnPermissions } from '../utils/permissions';

export default {
    data() {
        return {
            storage: useStore(),
            permissionError: '',
            connecting: false,
        }
    },

    methods: {
        async enableproxy() {
            if (this.connecting) return;
            this.permissionError = '';
            this.connecting = true;
            try {
                if (!this.storage.state) {
                    let ready = await validateProxyReady();
                    if (!ready.ok && ready.error === 'Missing browser permissions') {
                        const granted = await requestRequiredVpnPermissions();
                        if (granted) {
                            ready = await validateProxyReady();
                        }
                    }
                    if (!ready.ok) {
                        this.permissionError = ready.error || 'VPN proxy is not ready';
                        return;
                    }
                    const result = await enableProxy();
                    if (result) {
                        await this.storage.changeState();
                        enableBadge();
                    }
                } else {
                    const result = await disableProxy();
                    if (result) {
                        await this.storage.changeState();
                        disableBadge();
                    }
                }
            } catch (err) {
                this.permissionError = err?.message || 'Connection error';
            } finally {
                this.connecting = false;
            }
        },
    }
}
</script>

<style scoped>
.container-control {
    position: absolute;
    bottom: -46px;
    left: 0;
    right: 0;
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.status-pill {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -26px;
    white-space: nowrap;
    background: #FFFFFF;
    color: #64748B;
    border: 1px solid #E2E8F0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    border-radius: 999px;
    padding: .25rem .75rem;
    font-size: .72rem;
    font-weight: 600;
    letter-spacing: .02em;
    text-transform: uppercase;
    transition: all .25s ease;
}

.status-pill.active {
    background: #ECFDF5;
    color: #059669;
    border-color: #A7F3D0;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
}

.pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #94A3B8;
    display: inline-block;
}

.pulse-dot.active {
    background-color: #10B981;
    box-shadow: 0 0 8px #10B981;
    animation: live-blink 1.8s infinite ease-in-out;
}

@keyframes live-blink {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .4; transform: scale(.85); }
}

.control-wrapper {
    position: relative;
    width: 128px;
    height: 128px;
}

.pulse-ring {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 2px solid rgba(16, 185, 129, 0.45);
    animation: ring-pulse 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    pointer-events: none;
}

@keyframes ring-pulse {
    0% {
        transform: scale(0.95);
        opacity: 0.8;
    }
    50% {
        transform: scale(1.08);
        opacity: 0.2;
    }
    100% {
        transform: scale(1.18);
        opacity: 0;
    }
}

.control-socket {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background-color: #F8FAFC;
    border: 4px solid #FFFFFF;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    padding: .5rem;
    position: relative;
    z-index: 2;
}

.btn-control {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #FB7185 0%, #E11D48 100%);
    border-radius: 50%;
    border: none;
    box-shadow: 0 6px 16px rgba(225, 29, 72, 0.32), inset 0 2px 4px rgba(255, 255, 255, 0.25);
    color: white;
    cursor: pointer;
    transition: all .25s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-control:hover:not(:disabled) {
    transform: scale(1.03);
    box-shadow: 0 8px 22px rgba(225, 29, 72, 0.45), inset 0 2px 4px rgba(255, 255, 255, 0.3);
}

.btn-control:active:not(:disabled) {
    transform: scale(0.96);
}

.btn-control.active {
    background: linear-gradient(135deg, #10B981 0%, #047857 100%);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45), inset 0 2px 4px rgba(255, 255, 255, 0.35);
}

.btn-control.active:hover:not(:disabled) {
    transform: scale(1.03);
    box-shadow: 0 8px 26px rgba(16, 185, 129, 0.55), inset 0 2px 4px rgba(255, 255, 255, 0.4);
}

.power-icon {
    transition: transform .3s ease;
}

.btn-control:hover .power-icon {
    transform: rotate(6deg);
}

.spinner {
    animation: spin .75s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.permission-error {
    position: absolute;
    top: 140px;
    width: min(240px, 90vw);
    margin: 0;
    color: #E11D48;
    background: #FFF1F2;
    border: 1px solid #FECDD3;
    border-radius: .4rem;
    padding: .3rem .5rem;
    font-size: .7rem;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
}
</style>
