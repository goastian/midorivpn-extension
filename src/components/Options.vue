<template>
    <div class="container-options">
        <button class="menu-btn" @click="show = !show" aria-label="Options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="5" r="2" fill="currentColor"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
                <circle cx="12" cy="19" r="2" fill="currentColor"/>
            </svg>
        </button>

        <div v-if="show" class="dialog column">
            <div class="dialog-top column">
                <h2>{{ user.name }}</h2>
                <span class="text-secondary email">{{ user.email }}</span>
            </div>

            <div class="divider"></div>

            <div class="dialog-main column ga-xs">
                <a @click="account" class="menu-item row items-center ga-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.6"/>
                        <path d="m19.4 15-.7-.4a7.5 7.5 0 0 0 0-5.2l.7-.4a1 1 0 0 0 .4-1.4l-1-1.7a1 1 0 0 0-1.4-.4l-.7.4a7.5 7.5 0 0 0-4.5-2.6V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v.7a7.5 7.5 0 0 0-4.5 2.6l-.7-.4a1 1 0 0 0-1.4.4l-1 1.7a1 1 0 0 0 .4 1.4l.7.4a7.5 7.5 0 0 0 0 5.2l-.7.4a1 1 0 0 0-.4 1.4l1 1.7a1 1 0 0 0 1.4.4l.7-.4a7.5 7.5 0 0 0 4.5 2.6V21a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.7a7.5 7.5 0 0 0 4.5-2.6l.7.4a1 1 0 0 0 1.4-.4l1-1.7a1 1 0 0 0-.4-1.4Z" stroke="currentColor" stroke-width="1.4"/>
                    </svg>
                    Manage Account
                </a>
                <a @click="openSettings" class="menu-item row items-center ga-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    Settings
                </a>
                <a @click="openAbout" class="menu-item row items-center ga-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
                        <path d="M12 8h.01M11 11h1v5h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    About
                </a>
            </div>

            <div class="divider"></div>

            <div class="dialog-footer">
                <a @click="logout" class="signup row items-center ga-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 12H4m0 0 4-4m-4 4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M10 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    Log out
                </a>
            </div>
        </div>
    </div>
</template>

<script>
import Auth from '../utils/authentification.ts';
export default {
    data() {
        return {
            show: false,
            user: {},
        }
    },

    created() {
        this.loadUser();
    },

    methods: {
        loadUser() {
            chrome.runtime.sendMessage({ type: 'loadUser' }, (response) => {
                if (response?.success) {
                    this.user = response.data;
                } else {
                    console.error('Error loading user:', response?.error);
                }
            });
        },

        account() {
            const issuer = process.env.AUTHENTIK_ISSUER || '';
            chrome.tabs.create({ url: issuer }, function () {
                window.close();
            });
        },

        openSettings() {
            this.show = false;
            this.$emit('open-settings');
        },

        openAbout() {
            const apiUrl = process.env.API_URL || '';
            const url = apiUrl ? `${apiUrl}/about` : 'about:blank';
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
    width: 28px;
    position: relative;
}

.menu-btn {
    width: 28px;
    height: 28px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background-color: #F8FAFC;
    color: #334155;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color .15s ease, color .15s ease;
}

.menu-btn:hover {
    background-color: #E2E8F0;
    color: #0F172A;
}

.dialog {
    position: absolute;
    width: 180px;
    background-color: white;
    top: 34px;
    right: 0;
    box-shadow: rgba(15, 23, 42, 0.12) 0px 6px 18px 0px, rgba(15, 23, 42, 0.06) 0px 1px 3px 0px;
    z-index: 20;
    border-radius: .5rem;
    overflow: hidden;
}

h2 {
    font-size: .9rem;
}

.divider {
    width: 100%;
    height: 1px;
    background-color: #E5E7EB;
}

.dialog-top {
    padding: .6rem .7rem;
}

.dialog-top > h2 {
    margin: 0;
}

.dialog-top > span {
    font-size: .7rem;
}

.text-secondary {
    color: #6E6E6E;
}

.email {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 165px;
    display: block;
}

.dialog-main {
    padding: .3rem 0;
}

.menu-item {
    cursor: pointer;
    font-size: .85rem;
    padding: .5rem .7rem;
    color: #202020;
    transition: background-color .15s ease;
}

.menu-item:hover {
    background-color: #F1F5F9;
}

a {
    text-decoration: none;
}

.dialog-footer {
    padding: .3rem 0;
}

.signup {
    cursor: pointer;
    font-size: .85rem;
    padding: .5rem .7rem;
    color: #B22222;
    transition: background-color .15s ease;
}

.signup:hover {
    background-color: #FEF2F2;
}
</style>