<template>
    <div class="container-control">
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
        <p v-if="permissionError" class="permission-error">{{ permissionError }}</p>
    </div>
</template>

<script>
import useStore from '../stores/useStore';
import { enableBadge, disableBadge } from '../utils/badge';
import { disableProxy, enableProxy, validateProxyReady } from '../utils/proxy';
export default {
    data() {
        return {
            storage: useStore(),
            permissionError: '',
        }
    },

    methods: {
        async enableproxy() {
            this.permissionError = '';
            if(!this.storage.state) {
                const ready = await validateProxyReady();
                if (!ready.ok) {
                    this.permissionError = ready.error || 'VPN proxy is not ready';
                    return;
                }
                const result = await enableProxy();
                if(result) {
                    await this.storage.changeState();
                    enableBadge();
                }
            } else {
                const result = await disableProxy();
                if(result)  {
                    await this.storage.changeState();
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

.permission-error {
    position: absolute;
    top: 138px;
    width: min(220px, 90vw);
    margin: 0;
    color: #E67B7B;
    font-size: .72rem;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
}
</style>
