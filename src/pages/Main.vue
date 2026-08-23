<template>
    <div class="main-container column">
        <div class="header row items-center justify-between">
            <div class="brand-row row items-center ga-xs">
                <img src="/icons/logo.png" class="header-logo" alt="Midori VPN" />
            </div>
            <Options />
        </div>

        <div class="center-switch-box">
            <v-switch />
        </div>

        <div class="content-card column justify-between">
            <div class="server-picker column ga-xs">
                <span class="section-subtitle">Virtual Location</span>
                <v-select />
            </div>

            <div v-if="!isMobile" class="desktop-card column ga-xs">
                <div class="row items-center ga-sm">
                    <div class="desktop-icon-box row items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                    </div>
                    <div class="column">
                        <h3 class="desktop-title">Midori VPN Desktop</h3>
                        <span class="desktop-desc">System-wide WireGuard &amp; Mesh</span>
                    </div>
                </div>
                <button class="btn-desktop-download row items-center justify-center ga-xs" @click="openDesktop">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download App</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import VSelectComp from '../components/Select.vue';
import VSwitchComp from '../components/Switch.vue';
import OptionsComp from '../components/Options.vue';
import { getLatestDownloadUrl } from '../utils/download.js';
import { detectDesktopEnvironment } from '../utils/platform.js';

export default {
  components: {
    VSelect: VSelectComp,
    VSwitch: VSwitchComp,
    Options: OptionsComp,
  },
  inject: ['app_name'],

  data() {
    return {
      isMobile: false,
    };
  },

  async created() {
    const env = await detectDesktopEnvironment();
    this.isMobile = env.confidence === 'mobile';
  },

  methods: {
    async openDesktop() {
      const url = await getLatestDownloadUrl();
      chrome.tabs.create({ url }, function () {
        window.close();
      });
    }
  }
}
</script>

<style scoped>
.main-container {
  width: 330px;
  height: 460px;
  background-color: #F8FAFC;
  background-image: radial-gradient(circle, #E2E8F0 1px, transparent 1px);
  background-size: 16px 16px;
  padding: .5rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  gap: .5rem;
  overflow: hidden;
}

.header {
  background-color: #FFFFFF;
  padding: .35rem .75rem;
  border-radius: .6rem;
  height: 46px;
  flex: 0 0 46px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  position: relative;
  z-index: 100;
}

.header-logo {
  height: 24px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
  display: block;
}

.center-switch-box {
  width: 100%;
  flex: 0 0 128px;
  position: relative;
  z-index: 2;
}

.content-card {
  background-color: #FFFFFF;
  flex: 1;
  min-height: 0;
  border-radius: .85rem;
  border: 1px solid #E2E8F0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  padding: 48px .75rem .65rem;
  position: relative;
  z-index: 1;
}

.section-subtitle {
  font-size: .68rem;
  color: #64748B;
  font-weight: 700;
  letter-spacing: .03em;
  text-transform: uppercase;
}

.server-picker {
  position: relative;
  z-index: 80;
  margin-top: .15rem;
}

/* Desktop card banner */
.desktop-card {
  background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
  border-radius: .65rem;
  padding: .65rem .75rem;
  border: 1px solid #334155;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}

.desktop-icon-box {
  width: 30px;
  height: 30px;
  border-radius: .4rem;
  background: rgba(14, 165, 233, 0.15);
  color: #38BDF8;
  flex-shrink: 0;
}

.desktop-title {
  color: #FFFFFF;
  font-size: .8rem;
  font-weight: 600;
  line-height: 1.2;
  margin: 0;
}

.desktop-desc {
  color: #94A3B8;
  font-size: .68rem;
  line-height: 1.2;
}

.btn-desktop-download {
  background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
  color: #FFFFFF;
  border: none;
  padding: .38rem 0;
  border-radius: .45rem;
  font-size: .78rem;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  margin-top: .25rem;
  box-shadow: 0 2px 6px rgba(14, 165, 233, 0.3);
  transition: all .15s ease;
}

.btn-desktop-download:hover {
  background: linear-gradient(135deg, #0284C7 0%, #0369A1 100%);
  box-shadow: 0 3px 8px rgba(14, 165, 233, 0.4);
}

@media screen and (min-width: 360px) and (pointer: coarse) {
  .main-container {
    width: 100%;
    min-width: 0;
    height: 100vh;
    height: 100dvh;
  }
}
</style>
