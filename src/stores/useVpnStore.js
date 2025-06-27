import { defineStore } from "pinia";
import axios from 'axios';
import Token from '../utils/token';
import serverManager from '../service/servers.js';

const useServerStore = defineStore('server', {
    state: () => ({
        servers: [],
        active: null,
        id: null,
    }),

    actions: {
        async loadServers() {
            const validated = new Token();
            const token = await validated.getDecryptedToken();
            const isValidated = await validated.verificate();
            if (isValidated) {
                const ser = serverManager.getServers();
                const res = await axios.get(`${process.env.PASSPORT_DOMAIN_SERVER}/api/v1/users/vpn/servers`, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                });
                if (res.status === 200) {
                    this.servers = { ...res.data.data };
                    if (!this.active) {
                        this.active = { ...res.data.data[0] }
                    }
                }
            }
        },

        async createDevice() {
            const validated = new Token();
            const token = await validated.getDecryptedToken();
            try {
                const params = {
                    name: 'extension'
                }

                if (this.id) {
                    params.id = this.id;
                }

                const res = await axios.post(`${process.env.PASSPORT_DOMAIN_SERVER}/api/v1/users/vpn/devices`, params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                });

                if (res.status == 201) {
                    this.id = res.data.data.id;
                }
            } catch (error) {
                return error.response.data.message
            }
        },
    },

    getters: {
        persistFields() {
            return ['id', 'active', 'servers'];
        },
    },
});

export default useServerStore;