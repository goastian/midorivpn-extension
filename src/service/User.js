import axios from 'axios';
import Token from '../utils/token';

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

        if (this.__user && now - this.__lastFetch < this.__TTL) {
            return this.__user;
        }

        const validated = new Token();
        const token = await validated.getDecryptedToken();
        const isValidated = await validated.verificate();
        try {
            if (isValidated) {
                const res = await axios.get(`${process.env.PASSPORT_SERVER}/api/gateway/user`, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                });
                if (res.status == 200) {
                    this.__user = { ...res.data };
                    this.__lastFetch = now;
                    return this.__user;
                }
            }
        } catch (error) {
            console.log(error)
        }
    };

    getUser() {
        return this.__user;
    };
};

const user = new User;
export default user;