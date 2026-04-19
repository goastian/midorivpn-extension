<template>
    <select v-model="selected">
        <option v-for="server in vpn.servers" :key="server.id" :value="server">{{ server.name || server.country_code }}</option>
    </select>
</template>

<script>
import badge from '../utils/badge.js';
import useVpnStore from '../stores/useVpnStore.js';
export default {
    data() {
        return {
            vpn: useVpnStore(),
        }
    },

    computed: {
        selected: {
            get() { return this.vpn.active; },
            set(server) { this.vpn.setActive(server); }
        }
    },

    watch: {
        selected() {
            badge();
        }
    }
}
</script>

<style scoped>
select {
    padding: .4rem 1rem;
    border: none;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: .4rem;
}
</style>