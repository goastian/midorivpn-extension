<template>
  <div class="container column">
    <div class="header">
      <div class="row items-center ga-sm">
        <img src="/icons/logo.png" class="logo" />
      </div>
      <Options />
    </div>
    <div class="center">
      <v-switch />
    </div>
    <div class="main column ga-md">
      <div class="server-picker column ga-sm">
        <span class="subtitle">Select Server</span>
        <v-select />
      </div>
      <div class="desktop-promo column ga-sm">
        <div class="row items-center ga-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="rgba(255,255,255,0.9)" stroke-width="1.6"/>
            <path d="M8 21h8M12 17v4" stroke="rgba(255,255,255,0.9)" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          <div class="column ga-xs">
            <h3 class="promo-title">MidoriVPN Desktop</h3>
            <span class="promo-desc">Mesh VPN, always-on protection &amp; full native performance.</span>
          </div>
        </div>
        <button class="btn-download" @click="openDesktop">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex-shrink:0">
            <path d="M12 3v13M7 12l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 19h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Download desktop client
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import VSelectComp from '../components/Select.vue';
import VSwitchComp from '../components/Switch.vue';
import OptionsComp from '../components/Options.vue';
export default {
  inject: ['app_name'],
  components: {
    VSelect: VSelectComp,
    VSwitch: VSwitchComp,
    Options: OptionsComp,
  },

  methods: {
    openDesktop() {
      const apiUrl = process.env.API_URL || '';
      chrome.tabs.create({ url: `${apiUrl}/download` }, function () {
        window.close();
      });
    }
  }
}
</script>

<style scoped>
.container {
  width: 330px;
  height: 460px;
  background-color: #F1F5F9;
  background-image: radial-gradient(circle, #e5e7eb 1px, transparent 1px);
  background-size: 20px 20px;
  padding: .5rem;
  color: #202020;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  gap: .5rem;
  overflow: hidden;
}

.header {
  background-color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: .4rem .8rem;
  border-radius: .4rem;
  height: 48px;
  flex: 0 0 48px;
  position: relative;
  z-index: 100;
}

.header img {
  height: 28px;
  width: auto;
  max-width: 130px;
  object-fit: contain;
  display: block;
}

.center {
  width: 100%;
  flex: 0 0 128px;
  position: relative;
  z-index: 2;
}

.main {
  background-color: white;
  flex: 1;
  min-height: 0;
  border-radius: .87rem;
  padding: 48px .85rem .75rem;
  position: relative;
  z-index: 1;
}

.subtitle {
  font-size: .72rem;
  color: #64748b;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
}

.server-picker {
  position: relative;
  z-index: 80;
}

/* Desktop promo banner */
.desktop-promo {
  background: linear-gradient(135deg, #1a7a4a 0%, #25a060 60%, #2db56e 100%);
  border-radius: .6rem;
  padding: .75rem;
}

.promo-title {
  color: #fff;
  font-size: .88rem;
  font-weight: 600;
  line-height: 1.2;
  margin: 0;
}

.promo-desc {
  color: rgba(255, 255, 255, 0.8);
  font-size: .72rem;
  line-height: 1.35;
}

.btn-download {
  background-color: white;
  color: #1a7a4a;
  border: none;
  padding: .42rem 0;
  border-radius: .4rem;
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .4rem;
  transition: background-color .15s;
}

.btn-download:hover {
  background-color: #f0fdf4;
}

/* Utility */
.row { display: flex; flex-direction: row; }
.column { display: flex; flex-direction: column; }
.items-center { align-items: center; }
.ga-xs { gap: 0.25rem; }
.ga-sm { gap: 0.5rem; }
.ga-md { gap: 0.75rem; }
</style>


<style scoped>
.container {
  width: 330px;
  height: 460px;
  background-color: #F1F5F9;
  background-image: radial-gradient(circle, #e5e7eb 1px, transparent 1px);
  background-size: 20px 20px;
  padding: .5rem;
  box-shadow: none;
  color: #202020;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  gap: .5rem;
  overflow: hidden;
}

.header {
  background-color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: .4rem .8rem;
  border-radius: .4rem;
  height: 48px;
  flex: 0 0 48px;
  /* position + z-index ensure the Options dropdown renders above .center and .main */
  position: relative;
  z-index: 100;
}

.header img,
.header-logo {
  height: 28px;
  width: auto;
  max-width: 130px;
  object-fit: contain;
  display: block;
}

.center {
  width: 100%;
  flex: 0 0 128px;
  position: relative;
  z-index: 2;
}

.btn {
  border: none;
  background-color: transparent;
  cursor: pointer;
}

.btn-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #64748b;
  padding: 2px;
  border-radius: 0.3rem;
  transition: color 0.15s;
}

.btn-settings:hover {
  color: #49B9FF;
}

.text-md {
  font-size: 1.7rem;
}

.main {
  background-color: white;
  flex: 1;
  min-height: 0;
  border-radius: .87rem;
  padding: 48px .85rem .75rem;
  position: relative;
  z-index: 1;
}

.subtitle {
  font-size: .72rem;
  color: #64748b;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
}

.server-picker {
  position: relative;
  z-index: 80;
}

.main-footer {
  box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 5px 0px, rgba(0, 0, 0, 0.1) 0px 0px 1px 0px;
  padding: .75rem;
  border-radius: .5rem;
  min-height: 0;
}

.primary-text {
  font-size: .9rem;
  line-height: 1.2;
}

.description {
  font-size: .74rem;
  line-height: 1.35;
  color: #64748b;
}

.btn.update {
  background-color: #49B9FF;
  color: white;
  padding: .42rem 0;
  border-radius: .4rem;
  font-size: .82rem;
  font-weight: 600;
}

.icon-gem {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
}

/* Settings overlay: fills same container dimensions as the main popup */
.settings-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
}
</style>
