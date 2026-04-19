import { api } from '../lib/api';

class User {
    __user;
    __loading;
    __lastFetch;
    __TTL;
    constructor() {
        this.__user = {};
        this.__loading = false;
        this.__lastFetch = 0;
        this.__TTL = 60 * 60 * 1000;
    };

    async LoadUser() {
        const now = Date.now();

        if (this.__user?.email && now - this.__lastFetch < this.__TTL) {
            return this.__user;
        }

        try {
            const user = await api.get('/api/v1/control/me');
            this.__user = user;
            this.__lastFetch = now;
            return this.__user;
        } catch (error) {
            console.error('Error loading user:', error);
            return this.__user;
        }
    };

    getUser() {
        return this.__user;
    };
};

const user = new User;
export default user;