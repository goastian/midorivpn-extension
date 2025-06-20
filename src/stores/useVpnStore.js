import { defineStore } from "pinia";
import axios from 'axios';
import Token from '../utils/token';

const useServerStore = defineStore('server', {
    state: () => ({
        id: null,
    }),

    actions: {
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
            return ['id'];
        },
    },
});

export default useServerStore;