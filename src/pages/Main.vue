<template>
  <div class="container column">

    <!-- ── Settings overlay (full-popup) ─────────────────────────────────── -->
    <SettingsPage
      v-if="showSettings"
      class="settings-overlay"
      @close="showSettings = false"
    />

    <!-- ── Main popup ────────────────────────────────────────────────────── -->
    <template v-else>
      <div class="header">
        <div class="row items-center ga-sm">
          <img src="/icons/logo.png" class="logo" />
        </div>
        <Options @open-settings="showSettings = true" />
      </div>
      <div class="center">
        <v-switch />
      </div>
      <div class="main column ga-md">
        <div class="server-picker column ga-sm">
          <span class="subtitle">Select Server</span>
          <v-select />
        </div>
        <div class="main-footer column ga-sm">
          <div class="row ga-sm">
            <!-- Lucide gem icon (MIT) -->
            <svg class="icon-gem" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="m2 9 3.5-5h13L22 9 12 22 2 9z" stroke="#49B9FF" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="M2 9h20M9 4 7 9l5 13 5-13-2-5" stroke="#49B9FF" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
            <div class="column ga-sm">
              <h3 class="primary-text">VPN Premium</h3>
              <span class="description">Get unlimited data, more servers, and faster speeds.</span>
            </div>
          </div>
          <button class="btn update" @click="openLink">Upgrade to Premium</button>
        </div>
      </div>
    </template>

  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
export default {
  inject: ['app_name'],
  components: {
    VSelect: defineAsyncComponent(() => import('../components/Select.vue')),
    VSwitch: defineAsyncComponent(() => import('../components/Switch.vue')),
    Options: defineAsyncComponent(() => import('../components/Options.vue')),
    SettingsPage: defineAsyncComponent(() => import('./Settings.vue')),
  },

  data() {
    return {
      showSettings: false,
    };
  },

  methods: {
    openLink() {
      const apiUrl = process.env.API_URL || '';
      chrome.tabs.create({ url: `${apiUrl}/plans` }, function () {
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
  box-shadow: none;
  color: #202020;
  font-family: 'Inter', sans-serif;
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
