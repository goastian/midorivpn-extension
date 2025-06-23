<template>
    <select v-model="vpn.active">
        <option v-for="item in vpn.servers" :key="item.ip" :value="item">{{ item.data.country }}</option>
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

    watch: {
        "vpn.active"() {
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