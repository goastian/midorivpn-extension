import axios from 'axios';
import Token from '../utils/token';
import Authentification from '../utils/authentification';

class ServerManager {
    __serversCache;
    __lastFetch;
    __TTL;
    constructor() {
        this.__serversCache = {
            servers: null,
            active: null,
        };
        this.__lastFetch = 0;
        this.__TTL = 60 * 60 * 1000;
    };

    async loadServers() {
        const now = Date.now();

        if (this.__serversCache.servers && now - this.__lastFetch < this.__TTL) {
            return this.__serversCache;
        }

        const validated = new Token();
        const token = await validated.getDecryptedToken();
        const isValidated = await validated.verificate();

        try {
            if (isValidated) {
                const res = await axios.get(`${process.env.PASSPORT_DOMAIN_SERVER}/api/v1/users/vpn/servers`, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                });

                if (res.status === 200) {
                    this.__serversCache.servers = { ...res.data.data };
                    this.__serversCache.active = { ...res.data.data[0] };
                    this.__lastFetch = now;
                    return this.__serversCache;
                }
            } else {
                const authentification = new Authentification();
                await authentification.signIn();
                validated.clearToken();
            }
        } catch (error) {
            console.error('Error loading servers:', error);
        }
    };

    getServers() {
        return this.__serversCache;
    };
};

// Export singleton instance
const serverManager = new ServerManager();
export default serverManager;