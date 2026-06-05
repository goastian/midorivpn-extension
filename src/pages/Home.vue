<template>
    <div class="container">
        <div class="hero">
            <img src="/icons/title.png" class="logo-title" />
            <img src="/icons/icon128.png" class="logo" width="96" />
            <h2 class="title">Protect your connection</h2>
            <p class="description">Sign in once. We'll keep your traffic private.</p>
        </div>
        <div class="footer">
            <button class="primary" :disabled="loading" @click="login">
                <span v-if="!loading">Sign in to Midori VPN</span>
                <span v-else>Opening sign in…</span>
            </button>
            <span class="tagline">We put your privacy first</span>
        </div>
    </div>
</template>

<script>
import Auth from '../utils/authentification.ts';
import log from '../utils/logger.js';
export default {
    inject: ['app_name'],

    data() {
        return { loading: false };
    },

    methods: {
        async login() {
            if (this.loading) return;
            this.loading = true;
            try {
                const auth = new Auth();
                await auth.signIn();
            } catch (error) {
                log.error('home', 'signIn failed:', error);
                this.loading = false;
            }
        },
    }
}
</script>

<style scoped>
.container {
    width: 330px;
    height: 460px;
    background-color: white;
    padding: 1.2rem;
    color: #202020;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .75rem;
    padding-top: .5rem;
}

.logo-title {
    width: 120px;
}

.logo {
    margin-top: .5rem;
}

.title {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0;
    text-align: center;
}

.description {
    text-align: center;
    font-size: .85rem;
    color: rgb(75, 85, 99);
    margin: 0;
    max-width: 24ch;
    line-height: 1.35;
}

.footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .5rem;
}

.primary {
    width: 100%;
    background-color: #0EA5E9;
    color: white;
    border: none;
    padding: .7rem;
    border-radius: .35rem;
    font-size: .92rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color .15s ease, opacity .15s ease;
}

.primary:hover:not(:disabled) {
    background-color: #0284C7;
}

.primary:disabled {
    opacity: .7;
    cursor: progress;
}

.tagline {
    color: gray;
    font-size: .7rem;
}
</style>
