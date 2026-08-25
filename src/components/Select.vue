<template>
    <div ref="root" class="selector">
        <!-- Trigger button -->
        <button
            type="button"
            class="selector-btn"
            :class="{ 'is-open': open }"
            :aria-expanded="open"
            @click="toggleDropdown"
        >
            <div class="server-flag-box">
                <span class="flag-icon">{{
                    selected ? getCountryFlag(selected.country_code) : "🌐"
                }}</span>
            </div>
            <div class="selector-info">
                <span class="selector-label">{{
                    selected
                        ? selected.label
                        : showTriggerLoading
                            ? "Loading locations…"
                            : "Select a server…"
                }}</span>
                <span v-if="selected && selected.ip" class="selector-ip">{{
                    selected.ip
                }}</span>
                <span v-else class="selector-sub">Astian Secure Node</span>
            </div>
            <svg
                v-if="showTriggerLoading"
                class="spinner trigger-spinner"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <circle cx="12" cy="12" r="10" stroke="#cbd5e1" stroke-width="2.5" />
                <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="#0EA5E9"
                    stroke-width="2.5"
                    stroke-linecap="round"
                />
            </svg>
            <!-- Lucide chevron-down (MIT) -->
            <svg
                v-else
                class="chevron"
                :class="{ open }"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
            >
                <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </button>

        <!-- Dropdown panel -->
        <div v-if="open" class="selector-menu" role="listbox">
            <div
                v-if="isLoading"
                class="selector-loading row items-center justify-center ga-sm"
            >
                <svg
                    class="spinner"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                >
                    <circle cx="12" cy="12" r="10" stroke="#cbd5e1" stroke-width="2.5" />
                    <path
                        d="M12 2a10 10 0 0 1 10 10"
                        stroke="#0EA5E9"
                        stroke-width="2.5"
                        stroke-linecap="round"
                    />
                </svg>
                <span>Fetching server network…</span>
            </div>
            <template v-else-if="allOptions.length">
                <button
                    v-for="opt in allOptions"
                    :key="opt.id"
                    type="button"
                    class="selector-item row items-center justify-between"
                    :class="{ active: selectedId === opt.id }"
                    role="option"
                    :aria-selected="selectedId === opt.id"
                    @click="pick(opt)"
                >
                    <div class="row items-center ga-sm item-content">
                        <span class="item-flag">{{
                            getCountryFlag(opt.country_code)
                        }}</span>
                        <div class="item-main column">
                            <span class="item-label">{{ opt.label }}</span>
                            <span v-if="opt.ip" class="item-ip">{{ opt.ip }}</span>
                        </div>
                    </div>
                    <svg
                        v-if="selectedId === opt.id"
                        class="item-check"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M20 6 9 17l-5-5"
                            stroke="#0EA5E9"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </button>
            </template>

            <div v-else class="selector-empty">
                {{ emptyMessage }}
            </div>
        </div>
    </div>
</template>

<script>
import useVpnStore from "../stores/useVpnStore.js";
import badge from "../utils/badge.js";
import log from "../utils/logger.js";

/** Strips port from an endpoint string ("1.2.3.4:51820" → "1.2.3.4") */
function stripPort(endpoint) {
  if (!endpoint) return "";
  return endpoint.split(":")[0];
}

function countryCodeToFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export default {
  data() {
    return {
      vpn: useVpnStore(),
      open: false,
      loading: false,
    };
  },

  computed: {
    selectedId() {
      return this.vpn.active?.id ?? "";
    },

    allOptions() {
      return this.vpn.servers.map((s) => ({
        id: s.id,
        label: s.name || s.country_code || "Global Server",
        country_code:
          s.country_code || (s.name && s.name.length === 2 ? s.name : ""),
        ip: stripPort(s.endpoint),
        _ref: s,
      }));
    },

    selected() {
      return this.allOptions.find((o) => o.id === this.selectedId) ?? null;
    },

    isLoading() {
      return this.loading || this.vpn.serversLoading;
    },

    showTriggerLoading() {
      return this.vpn.serversLoading && !this.selected;
    },

    emptyMessage() {
      const m = this.vpn.serversMeta;
      if (m?.source === "error") {
        return `Could not load servers: ${m.error || "network error"}`;
      }
      if ((m?.total || 0) > 0 && (m?.eligibleProxy || 0) === 0) {
        return "No proxy-enabled servers available.";
      }
      return "No servers available";
    },
  },

  mounted() {
    this._clickOutside = (e) => {
      if (!this.$refs.root?.contains(e.target)) this.open = false;
    };
    document.addEventListener("click", this._clickOutside, true);
  },

  beforeUnmount() {
    document.removeEventListener("click", this._clickOutside, true);
  },

  methods: {
    getCountryFlag(code) {
      return countryCodeToFlag(code);
    },

    async toggleDropdown() {
      if (this.open) {
        this.open = false;
        log.diag("selector", "dropdown:close");
        return;
      }
      this.open = true;
      this.loading = true;
      try {
        await this.vpn.loadServers();
      } finally {
        this.loading = false;
      }
    },

    async pick(opt) {
      log.diag("selector", "pick", {
        id: opt?.id || null,
        label: opt?.label || null,
        ip: opt?.ip || null,
      });
      this.vpn.setActive(opt._ref);
      this.open = false;
      badge();
      // Chromium keeps a persistent proxy setting. Reapply it immediately
      // when the selected server changes while protection is active.
      const stored = await new Promise((resolve) =>
        chrome.storage.local.get(["store"], resolve),
      );
      if (stored.store?.state) {
        chrome.runtime.sendMessage(
          { type: "reconfigureProxy", activeServer: opt._ref },
          () => {},
        );
      }
    },
  },
};
</script>

<style scoped>
.selector {
  position: relative;
  width: 100%;
  z-index: 90;
}

.selector-btn {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 52px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.7rem;
  background-color: #ffffff;
  cursor: pointer;
  gap: 0.65rem;
  text-align: left;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.selector-btn:hover {
  border-color: #0ea5e9;
  box-shadow: 0 3px 8px rgba(14, 165, 233, 0.12);
}

.selector-btn.is-open {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
}

.server-flag-box {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.flag-icon {
  font-size: 1.15rem;
  line-height: 1;
}

.selector-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.selector-label {
  font-size: 0.88rem;
  color: #0f172a;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selector-ip {
  font-size: 0.7rem;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selector-sub {
  font-size: 0.68rem;
  color: #94a3b8;
}

.chevron {
  flex-shrink: 0;
  color: #94a3b8;
  transition:
    transform 0.2s ease,
    color 0.2s ease;
}

.selector-btn:hover .chevron {
  color: #0ea5e9;
}

.chevron.open {
  transform: rotate(180deg);
  color: #0ea5e9;
}

.selector-menu {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.7rem;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.15);
  padding: 0.35rem;
  margin: 0;
  max-height: 140px;
  overflow-y: auto;
  z-index: 150;
}

.selector-item {
  width: 100%;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  padding: 0.5rem 0.6rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
  text-align: left;
}

.item-content {
  min-width: 0;
  flex: 1;
}

.item-flag {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.selector-item:hover {
  background-color: #f8fafc;
}

.selector-item.active {
  background-color: #f0f9ff;
}

.item-main {
  min-width: 0;
  gap: 0.08rem;
  flex: 1;
}

.item-label {
  font-size: 0.84rem;
  color: #1e293b;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selector-item.active .item-label {
  color: #0284c7;
  font-weight: 600;
}

.item-ip {
  font-size: 0.68rem;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.selector-item.active .item-ip {
  color: #38bdf8;
}

.item-check {
  flex-shrink: 0;
  margin-left: 0.5rem;
}

.selector-empty {
  color: #94a3b8;
  font-size: 0.78rem;
  cursor: default;
  text-align: center;
  padding: 0.85rem 0.5rem;
}

.selector-loading {
  padding: 0.85rem 0.5rem;
  color: #64748b;
  font-size: 0.78rem;
}

.spinner {
  animation: spin 0.75s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
