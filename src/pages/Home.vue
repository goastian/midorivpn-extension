<template>
    <div class="container">
        <div class="header">
            <h1>{{ app_name }}</h1>
        </div>
        <div class="main">
            <img src="/icons/icon128.png" class="logo" width="80" />
            <div class="main-content">
                <h2 class="title">Protect your connection</h2>
                <span class="description">Surf the web safely and privately with our high-speed VPN</span>
            </div>
            <div class="main-list">
                <div class="container-icon">
                    <Icon class="icon" icon="iconamoon:shield-thin" />
                    <span>Safe connection</span>
                </div>
                <div class="container-icon">
                    <Icon class="icon" icon="tabler:world" />
                    <span>International servers</span>
                </div>
                <div class="container-icon">
                    <Icon class="icon" icon="uil:padlock" />
                    <span>Complete privacy</span>
                </div>
            </div>
        </div>
        <div class="footer">
            <button @click="openLink">Login</button>
            <span>We put your privacy first</span>
        </div>
    </div>
</template>

<script>
import { Icon } from '@iconify/vue';
import Authentification from '../utils/authentification.ts';
export default {
    inject: ['app_name'],
    components: {
        Icon,
    },

    methods: {
        openLink() {
            const authentification = new Authentification();
            authentification.signIn();
        }
    }
}
</script>

<style scoped>
.container {
    width: 330px;
    height: 460px;
    background-color: white;
    background-size: 20px 20px;
    padding: .8rem;
    box-shadow: none;
    color: #202020;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    justify-content: space-between;
    font-family: 'Inter', sans-serif;
}

.header {
    width: 100%;
    display: flex;
    justify-content: center;
}

.main {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.6rem;
}

.main-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .5rem;
}

.title {
    font-size: 1.2rem;
}

.description {
    text-align: center;
    font-size: .8rem;
    color: rgb(75, 85, 99);
}

.main-list {
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: .86rem;
}

.container-icon {
    display: flex;
    align-items: center;
    gap: .3rem;
}

.icon {
    background-color: #E6F6FD;
    color: #0EA5E9;
    border-radius: 50%;
    width: 25px;
    height: 25px;
    padding: .2rem;
}

.footer {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.footer > button {
    width: 100%;
    background-color: #0EA5E9;
    color: white;
    border: none;
    padding: .6rem;
    border-radius: .2rem;
    font-size: .9rem;
    cursor: pointer;
}

.footer > span {
    color: gray;
    font-size: .7rem;
}
</style>