import { defineStore } from "pinia";
import { api } from '../lib/api';
import serverManager from '../service/servers.js';

const useServerStore = defineStore('server', {
    state: () => ({
        servers: [],
        active: null,
        connectionId: null,
    }),

    actions: {
        async loadServers() {
            try {
                const result = await serverManager.loadServers();
                if (result?.servers) {
                    this.servers = result.servers;
                    if (!this.active && result.active) {
                        this.active = result.active;
                    }
                }
            } catch (error) {
                console.error('Error loading servers:', error);
            }
        },

        setActive(server) {
            this.active = server;
            serverManager.setActive(server);
        },

        async provisionConnection() {
            if (!this.active) return 'No server selected';

            try {
                // Generate keypair via backend
                const keypair = await api.post('/api/v1/control/keypair');

                // Create connection on the selected server
                const connection = await api.post('/api/v1/control/connections', {
                    server_id: this.active.id,
                    public_key: keypair.public_key,
                    device_name: 'extension',
                });

                this.connectionId = connection.id;

                // Store connection config for proxy use
                await chrome.storage.local.set({
                    connection: connection,
                    server: { active: this.active },
                });

                return null; // success
            } catch (error) {
                console.error('Error provisioning connection:', error);
                return error.message || 'Failed to create connection';
            }
        },
    },

    getters: {
        persistFields() {
            return ['connectionId', 'active', 'servers'];
        },
    },
});

export default useServerStore;