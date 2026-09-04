import { api } from '../lib/api';
import log from '../utils/logger';

export interface UserProfile {
    id?: string;
    email?: string;
    display_name?: string;
    groups?: string[];
}

type UserResponse = UserProfile & { data?: UserProfile };
const USER_CACHE_TTL_MS = 60 * 60 * 1000;

export class UserManager {
    private user: UserProfile = {};
    private lastFetch = 0;

    async loadUser(): Promise<UserProfile> {
        const now = Date.now();
        if (this.user.email && now - this.lastFetch < USER_CACHE_TTL_MS) {
            return this.user;
        }

        try {
            const response = await api.get<UserResponse>('/api/v1/control/me');
            this.user = response?.data || response || {};
            this.lastFetch = now;
            return this.user;
        } catch (error) {
            log.error('user', 'Error loading user:', error);
            return this.user;
        }
    }

    getUser(): UserProfile {
        return this.user;
    }
}

const userManager = new UserManager();
export default userManager;
