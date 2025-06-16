<template>
    <select v-model="servers.active">
        <option v-for="item in servers.servers" :key="item.ip" :value="item">{{ item.data.country }}</option>
    </select>
</template>

<script>
export default {
    data() {
        return {
            servers: {},
        }
    },

    created() {
        chrome.storage.local.get('encryptedToken', async (storage) => {
            if (storage.encryptedToken) {
                this.loadServers();
            }
        });
    },

    methods: {
        loadServers() {
            chrome.runtime.sendMessage({ type: 'loadServers' }, (response) => {
                if (response?.success) {
                    this.servers = response.data;
                } else {
                    console.error('Error al obtener servidores:', response?.error);
                }
            });
        },
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