<template>
    <div class="container-options">
        <button @click="show = !show">
            ︙
        </button>

        <div v-if="show" class="dialog column">
            <div class="dialog-top column">
                <h2>{{ user.name }}</h2>
                <span class="text-secondary email">{{ user.email }}</span>
                <!--<span class="text-secondary">Plan</span>-->
            </div>

            <div class="divider"></div>

            <div class="dialog-main">
                <a @click="account" class="account row items-center ga-sm">
                    🛠️ Manage Account
                </a>
            </div>

            <div class="divider"></div>

            <div class="dialog-footer">
                <a @click="logout" class="signup row items-center ga-sm">
                    👋 Log out
                </a>
            </div>
        </div>
    </div>
</template>

<script>
import Authentification from '../utils/authentification.ts';
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
                    console.error('Error al obtener servidores:', response?.error);
                }
            });
        },

        account() {
            chrome.tabs.create({ url: `${process.env.PASSPORT_SERVER}` }, function () {
                window.close();
            });
        },

        logout() {
            const authentification = new Authentification();
            authentification.logout();
        }
    }
}
</script>

<style scoped>
.container-options {
    height: 100%;
    width: 20px;
    position: relative;
}

button {
    width: 100%;
    height: 100%;
    border: none;
    background-color: transparent;
    color: black;
    cursor: pointer;
}

.dialog {
    position: absolute;
    width: 150px;
    background-color: white;
    bottom: -100px;
    right: 0;
    box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 5px 0px, rgba(0, 0, 0, 0.1) 0px 0px 1px 0px;
    z-index: 20;
    border-radius: .4rem;
}

h2 {
    font-size: .9rem;
}

.divider {
    width: 100%;
    height: .05rem;
    background-color: #D3D3D3;
}

.dialog-top {
    padding: .4rem;
}

.dialog-top>span {
    font-size: .7rem;
}

.text-secondary {
    color: #6E6E6E;
}

.email {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 135px;
}

.dialog-main {
    padding: .4rem;
}

.account {
    cursor: pointer;
    font-size: .8rem;
}

a {
    text-decoration: none;
    color: #202020;
    font-size: .9rem;
}

.dialog-footer {
    padding: .4rem;
}

.signup {
    cursor: pointer;
    font-size: .8rem;
    color: #B22222;
}
</style>