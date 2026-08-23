<template>
    <div ref="root" class="container-options">
        <button class="menu-btn" :class="{ 'active': show }" aria-label="Account and Settings" @click="show = !show">
            <div v-if="userInitial" class="avatar-circle">
                <span>{{ userInitial }}</span>
            </div>
            <!-- Lucide more-vertical or user icon (MIT) -->
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        </button>

        <div v-if="show" class="dialog column">
            <div class="dialog-header column">
                <div class="row items-center ga-sm">
                    <div class="avatar-large row items-center justify-center">
                        <span>{{ userInitial || 'U' }}</span>
                    </div>
                    <div class="user-meta column">
                        <h2 class="user-name">{{ user.name || 'Midori User' }}</h2>
                        <span class="user-email text-muted">{{ user.email || 'Protected Account' }}</span>
                    </div>
                </div>
                <div class="plan-badge-row row items-center ga-xs">
                    <span class="plan-pill">Astian Account</span>
                </div>
            </div>

            <div class="divider"></div>

            <div class="dialog-main column ga-xs">
                <button type="button" class="menu-item row items-center ga-sm" @click="account">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span>Manage Account</span>
                </button>
            </div>

            <div class="divider"></div>

            <div class="dialog-footer">
                <button type="button" class="logout-btn row items-center ga-sm" @click="logout">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Log out</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import Auth from '../utils/authentification.ts';
import log from '../utils/logger.js';

export default {
    data() {
        return {
            show: false,
            user: {},
        }
    },

    computed: {
        userInitial() {
            if (this.user?.name && this.user.name.length > 0) {
                return this.user.name[0].toUpperCase();
            }
            if (this.user?.email && this.user.email.length > 0) {
                return this.user.email[0].toUpperCase();
            }
            return '';
        }
    },

    created() {
        this.loadUser();
    },

    mounted() {
        this._clickOutside = (e) => {
            if (!this.$refs.root?.contains(e.target)) {
                this.show = false;
            }
        };
        document.addEventListener('click', this._clickOutside, true);
    },

    beforeUnmount() {
        document.removeEventListener('click', this._clickOutside, true);
    },

    methods: {
        loadUser() {
            chrome.runtime.sendMessage({ type: 'loadUser' }, (response) => {
                if (response?.success) {
                    this.user = response.data || {};
                } else {
                    log.error('options', 'Error loading user:', response?.error);
                }
            });
        },

        account() {
            const url = process.env.ACCOUNT_URL || process.env.API_URL || 'https://accounts.astian.org';
            chrome.tabs.create({ url }, function () {
                window.close();
            });
        },

        logout() {
            const auth = new Auth();
            auth.logout();
        }
    }
}
</script>

<style scoped>
.container-options {
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
}

.menu-btn {
    width: 32px;
    height: 32px;
    border: 1px solid #E2E8F0;
    background-color: #F8FAFC;
    color: #475569;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .2s ease;
}

.menu-btn:hover,
.menu-btn.active {
    background-color: #F1F5F9;
    color: #0F172A;
    border-color: #CBD5E1;
}

.avatar-circle {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
    color: white;
    font-size: .78rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
}

.dialog {
    position: absolute;
    width: 210px;
    background-color: #FFFFFF;
    top: 42px;
    right: 0;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.06);
    z-index: 200;
    border-radius: .75rem;
    border: 1px solid #E2E8F0;
    overflow: hidden;
    animation: fadeIn .15s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
}

.dialog-header {
    padding: .75rem .85rem;
    background: #F8FAFC;
    gap: .45rem;
}

.avatar-large {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
    color: white;
    font-size: .88rem;
    font-weight: 700;
    flex-shrink: 0;
}

.user-meta {
    min-width: 0;
    flex: 1;
}

.user-name {
    font-size: .84rem;
    font-weight: 600;
    color: #0F172A;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.user-email {
    font-size: .7rem;
    color: #64748B;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
}

.plan-badge-row {
    margin-top: .15rem;
}

.plan-pill {
    background: #E0F2FE;
    color: #0369A1;
    font-size: .62rem;
    font-weight: 600;
    padding: .15rem .45rem;
    border-radius: 999px;
}

.divider {
    width: 100%;
    height: 1px;
    background-color: #F1F5F9;
}

.dialog-main {
    padding: .35rem;
}

.menu-item {
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: .82rem;
    font-weight: 500;
    padding: .5rem .6rem;
    color: #334155;
    border-radius: .4rem;
    transition: background-color .15s ease, color .15s ease;
    text-align: left;
}

.menu-item svg {
    color: #64748B;
}

.menu-item:hover {
    background-color: #F1F5F9;
    color: #0F172A;
}

.menu-item:hover svg {
    color: #0EA5E9;
}

.dialog-footer {
    padding: .35rem;
    background: #FFF;
}

.logout-btn {
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: .82rem;
    font-weight: 600;
    padding: .5rem .6rem;
    color: #E11D48;
    border-radius: .4rem;
    transition: background-color .15s ease;
    text-align: left;
}

.logout-btn svg {
    color: #E11D48;
}

.logout-btn:hover {
    background-color: #FFF1F2;
}
</style>