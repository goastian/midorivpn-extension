<template>
  <div class="settings-page column ga-md">

    <!-- Header -->
    <div class="settings-header row items-center ga-sm">
      <button class="btn-back" @click="$emit('close')">←</button>
      <h2 class="settings-title">Settings</h2>
    </div>

    <!-- Section: Features -->
    <div class="section-card column">
      <span class="section-label">Features</span>

      <div class="divider"></div>

      <!-- Mesh toggle -->
      <div class="setting-row row items-center ga-sm">
        <div class="setting-info column" style="flex:1; min-width:0">
          <span class="setting-name">Mesh Networks</span>
          <span class="setting-desc">Connect directly to other VPN users via a peer-to-peer overlay network.</span>
        </div>
        <button
          class="toggle-btn"
          :class="{ active: settings.meshEnabled }"
          :aria-pressed="settings.meshEnabled"
          @click="settings.setMeshEnabled(!settings.meshEnabled)"
          role="switch"
          :aria-checked="settings.meshEnabled"
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </div>

  </div>
</template>

<script>
import useSettingsStore from '../stores/useSettingsStore';

export default {
  name: 'SettingsPage',
  emits: ['close'],

  data() {
    return {
      settings: useSettingsStore(),
    };
  },
};
</script>

<style scoped>
.settings-page {
  padding: 0.6rem;
  width: 330px;
  min-height: 460px;
  background-color: #F1F5F9;
  color: #202020;
  font-family: 'Inter', sans-serif;
  box-sizing: border-box;
  overflow-y: auto;
}

.settings-header {
  background: white;
  border-radius: 0.4rem;
  padding: 0.4rem 0.8rem;
  margin-bottom: 0.2rem;
}

.settings-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.btn-back {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #49B9FF;
  padding: 0;
}

.section-card {
  background: white;
  border-radius: 0.6rem;
  padding: 0.75rem 1rem;
  box-shadow: rgba(0,0,0,0.04) 0 1px 3px;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 0.25rem;
}

.divider {
  height: 1px;
  background: #f1f5f9;
  margin: 0.25rem 0 0.5rem;
}

.setting-row {
  padding: 0.25rem 0;
}

.setting-info {
  gap: 0.15rem;
}

.setting-name {
  font-size: 0.88rem;
  font-weight: 500;
  color: #1e293b;
}

.setting-desc {
  font-size: 0.75rem;
  color: #94a3b8;
  line-height: 1.4;
}

/* Toggle switch */
.toggle-btn {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: #cbd5e1;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
  padding: 0;
}

.toggle-btn.active {
  background: #49B9FF;
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.2s;
  display: block;
}

.toggle-btn.active .toggle-knob {
  transform: translateX(18px);
}

/* Utility */
.row { display: flex; flex-direction: row; }
.column { display: flex; flex-direction: column; }
.items-center { align-items: center; }
.ga-sm { gap: 0.5rem; }
.ga-md { gap: 0.75rem; }
</style>
