<template>
    <div class="home-container column justify-between">
        <div class="glow-backdrop"></div>
        <div class="hero column items-center">
            <div class="brand-badge row items-center ga-xs">
                <img src="/icons/logo.png" class="brand-logo" alt="Midori" />
            </div>
            <div class="shield-wrapper">
                <img src="/icons/icon128.png" class="shield-logo" width="88" height="88" alt="Midori VPN" />
            </div>
            <h2 class="title">Secure &amp; Private Browsing</h2>
            <p class="description">One-click encrypted connection powered by Astian Network.</p>
            
            <div class="features-row row ga-xs">
                <div class="feature-chip row items-center ga-xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>Zero-Log</span>
                </div>
                <div class="feature-chip row items-center ga-xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                    <span>High Speed</span>
                </div>
                <div class="feature-chip row items-center ga-xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Encrypted</span>
                </div>
            </div>
        </div>

        <div class="footer column items-center ga-sm">
            <button class="primary-btn row items-center justify-center ga-sm" :disabled="loading" @click="login">
                <svg v-if="loading" class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span v-if="!loading">Sign in to Midori VPN</span>
                <span v-else>Connecting to Authentik…</span>
            </button>
            <div class="powered-by row items-center ga-xs">
                <span>Protected by</span>
                <strong>Astian, Inc.</strong>
            </div>
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
.home-container {
    width: 330px;
    height: 460px;
    background: #FFFFFF;
    padding: 1.25rem 1rem 1rem;
    position: relative;
    overflow: hidden;
}

.glow-backdrop {
    position: absolute;
    top: -40px;
    left: 50%;
    transform: translateX(-50%);
    width: 240px;
    height: 180px;
    background: radial-gradient(circle, rgba(14, 165, 233, 0.12) 0%, rgba(14, 165, 233, 0) 70%);
    pointer-events: none;
}

.hero {
    gap: .75rem;
    padding-top: .25rem;
    z-index: 1;
}

.brand-badge {
    padding: .2rem .5rem;
}

.brand-logo {
    height: 22px;
    width: auto;
    object-fit: contain;
}

.shield-wrapper {
    margin-top: .25rem;
    filter: drop-shadow(0 10px 18px rgba(14, 165, 233, 0.22));
    transition: transform .3s ease;
}

.shield-wrapper:hover {
    transform: scale(1.04);
}

.title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #0F172A;
    margin: 0;
    text-align: center;
    letter-spacing: -0.01em;
}

.description {
    text-align: center;
    font-size: .82rem;
    color: #64748B;
    margin: 0;
    max-width: 26ch;
    line-height: 1.4;
}

.features-row {
    margin-top: .35rem;
    justify-content: center;
    flex-wrap: wrap;
}

.feature-chip {
    background: #F1F5F9;
    color: #475569;
    border: 1px solid #E2E8F0;
    border-radius: 999px;
    padding: .25rem .55rem;
    font-size: .68rem;
    font-weight: 600;
}

.feature-chip svg {
    color: #0EA5E9;
}

.footer {
    z-index: 1;
    width: 100%;
}

.primary-btn {
    width: 100%;
    height: 44px;
    background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
    color: white;
    border: none;
    border-radius: .6rem;
    font-size: .9rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);
    transition: all .2s ease;
}

.primary-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #0284C7 0%, #0369A1 100%);
    box-shadow: 0 6px 16px rgba(14, 165, 233, 0.45);
    transform: translateY(-1px);
}

.primary-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.3);
}

.primary-btn:disabled {
    opacity: .75;
    cursor: progress;
}

.spinner {
    animation: spin .75s linear infinite;
    flex-shrink: 0;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.powered-by {
    color: #94A3B8;
    font-size: .68rem;
}

.powered-by strong {
    color: #64748B;
    font-weight: 600;
}

@media screen and (min-width: 360px) and (pointer: coarse) {
    .home-container {
        width: 100%;
        min-width: 0;
        height: 100vh;
        height: 100dvh;
    }
}
</style>
