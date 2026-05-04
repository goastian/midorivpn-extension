<template>
  <div class="mesh-page column ga-md">

    <!-- Header -->
    <div class="mesh-header row items-center ga-sm">
      <button v-if="view !== 'list'" class="nav-btn" @click="goBack" aria-label="Back">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button v-else class="nav-btn" @click="$emit('close')" aria-label="Close mesh">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="title-stack">
        <h2 class="mesh-title">
          {{ view === 'list' ? 'Mesh Atlas' : view === 'node' ? 'Node Control' : 'Mesh Detail' }}
        </h2>
        <span class="mesh-kicker">{{ viewSubtitle }}</span>
      </div>
      <button v-if="view === 'list'" class="refresh-btn ml-auto" title="Refresh" :disabled="mesh.loading" @click="reload">
        <svg :class="{ spinning: mesh.loading }" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 6v5h-5M4 18v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M18.8 11A7 7 0 0 0 6.3 7.2M5.2 13A7 7 0 0 0 17.7 16.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Error banner -->
    <div v-if="mesh.error" class="error-banner row items-center ga-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.3 4.2 2.8 17.4A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.6L13.7 4.2a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>{{ mesh.error }}</span>
      <button class="btn-clear-err" @click="mesh.clearError()">✕</button>
    </div>

    <!-- ── VIEW: LIST ─────────────────────────────────────────────────────── -->
    <template v-if="view === 'list'">
      <section class="atlas-hero column ga-sm">
        <div class="hero-orbit" aria-hidden="true"></div>
        <span class="eyebrow">Public mesh directory</span>
        <h3 class="hero-title">Nearby relay islands, mapped by origin.</h3>
        <p class="hero-copy">Every mesh is auto-named from its public country code. No Test, My Mesh, or unknown XX entries.</p>
        <div class="stats-grid">
          <div class="stat-chip">
            <span class="stat-number">{{ visibleMeshList.length }}</span>
            <span class="stat-label">meshes</span>
          </div>
          <div class="stat-chip">
            <span class="stat-number">{{ totalMembers }}</span>
            <span class="stat-label">members</span>
          </div>
          <div class="stat-chip wide">
            <span class="stat-number mono">{{ mesh.myMeshIp || 'offline' }}</span>
            <span class="stat-label">your mesh IP</span>
          </div>
        </div>
      </section>

      <!-- Node status summary card -->
      <div class="node-mini-card row items-center ga-sm" @click="view = 'node'" role="button" tabindex="0">
        <div class="node-icon" :class="{ active: mesh.nodeActive }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4v6M8 7a6 6 0 1 0 8 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="column mini-copy">
          <span class="status-mini">Mesh node {{ mesh.nodeActive ? 'online' : 'standby' }}</span>
          <span class="status-sub">{{ mesh.nodeActive ? 'Routing overlay traffic' : 'Activate when you are ready to join' }}</span>
        </div>
        <span v-if="mesh.myMeshIp" class="mini-ip">{{ mesh.myMeshIp }}</span>
        <span class="chevron ml-auto">›</span>
      </div>

      <!-- Mesh list -->
      <div class="section-row row items-center">
        <span class="section-title">Available meshes</span>
        <span class="section-count ml-auto">{{ visibleMeshList.length }}</span>
      </div>

      <div v-if="mesh.loading && !mesh.meshList.length" class="skeleton-list column ga-xs">
        <div class="skeleton-card"></div>
        <div class="skeleton-card short"></div>
        <div class="skeleton-card"></div>
      </div>
      <div v-if="!visibleMeshList.length && !mesh.loading" class="empty-card column ga-sm items-center">
        <div class="empty-icon">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3c2.2 2.4 3.4 5.4 3.4 9S14.2 18.6 12 21M12 3C9.8 5.4 8.6 8.4 8.6 12S9.8 18.6 12 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="empty-text">No public mesh networks yet.</span>
        <span class="hint-text">Mesh networks appear automatically once users connect from a public origin.</span>
      </div>
      <div v-else class="mesh-list column ga-xs">
        <div
          v-for="m in visibleMeshList"
          :key="m.id"
          class="mesh-row row items-center ga-sm"
          @click="openDetail(m)"
          role="button"
        >
          <div class="country-badge">{{ countryCode(m) }}</div>
          <div class="column mesh-copy">
            <div class="row items-center ga-xs">
              <span class="mesh-name">{{ m.name }}</span>
              <span class="live-pill">live</span>
            </div>
            <span class="mesh-sub">{{ m.subnet }} · {{ m.member_count }}/{{ m.max_members }} members</span>
            <div class="capacity-track" aria-hidden="true">
              <span class="capacity-fill" :style="{ width: occupancy(m) + '%' }"></span>
            </div>
          </div>
          <span class="chevron">›</span>
        </div>
      </div>
    </template>

    <!-- ── VIEW: NODE ─────────────────────────────────────────────────────── -->
    <template v-else-if="view === 'node'">
      <div class="node-card column ga-md">
        <div class="node-hero column ga-sm">
          <span class="node-state-pill" :class="{ active: mesh.nodeActive }">{{ mesh.nodeActive ? 'Online' : 'Standby' }}</span>
          <h3 class="node-title">{{ mesh.nodeActive ? 'Your mesh node is active' : 'Your mesh node is waiting' }}</h3>
          <p class="hint-text">
            {{ mesh.nodeActive ? 'You can exchange mesh traffic with peers using your overlay IP.' : 'Activate to join the overlay and receive a private mesh IP.' }}
          </p>
          <button
            class="btn-toggle"
            :class="mesh.nodeActive ? 'btn-danger' : 'btn-primary'"
            :disabled="mesh.loading"
            @click="toggleNode"
          >{{ mesh.loading ? '…' : (mesh.nodeActive ? 'Deactivate' : 'Activate') }}</button>
        </div>

        <div v-if="mesh.nodeActive && mesh.myMeshIp" class="ip-box row items-center ga-sm">
          <span class="label">Your IP</span>
          <code class="ip-val">{{ mesh.myMeshIp }}</code>
          <button class="btn-copy btn-copy-sm" @click="copyText(mesh.myMeshIp, 'ip')" :title="copied === 'ip' ? 'Copied!' : 'Copy'">
            {{ copied === 'ip' ? '✓' : '📋' }}
          </button>
        </div>

        <div v-if="mesh.nodeActive" class="peers-section column ga-xs">
          <div class="row items-center ga-sm">
            <span class="label">Peers ({{ mesh.peers.length }})</span>
            <button class="btn-text btn-refresh ml-auto" :disabled="mesh.loading" @click="mesh.loadNodeStatus()">Refresh</button>
          </div>
          <div v-if="mesh.loading" class="loading-text">Refreshing peers…</div>
          <div v-else-if="!mesh.peers.length" class="empty-text">No peers online yet.</div>
          <div v-else v-for="peer in mesh.peers" :key="peer.mesh_ip" class="peer-row row items-center ga-sm">
            <span class="peer-ip">{{ peer.mesh_ip }}</span>
            <span v-if="peer.display_name" class="peer-name">{{ peer.display_name }}</span>
          </div>
        </div>

        <p v-if="!mesh.nodeActive" class="hint-text">
          Activate to join the mesh overlay and reach other VPN users directly via their mesh IPs.
        </p>
      </div>
    </template>

    <!-- ── VIEW: DETAIL ───────────────────────────────────────────────────── -->
    <template v-else-if="view === 'detail' && currentMesh">
      <div class="node-card column ga-md">
        <div class="detail-hero row ga-sm">
          <div class="country-badge large">{{ countryCode(currentMesh) }}</div>
          <div class="column mesh-copy">
            <span class="mesh-name detail-name">{{ currentMesh.name }}</span>
            <span class="mesh-sub">{{ currentMesh.country_code || countryCode(currentMesh) }} origin mesh</span>
          </div>
        </div>

        <!-- Info -->
        <div class="info-grid">
          <div class="info-tile">
            <span class="label">Subnet</span>
            <code class="ip-val">{{ currentMesh.subnet }}</code>
          </div>
          <div class="info-tile">
            <span class="label">Members</span>
            <span class="stat-val">{{ currentMesh.member_count }}/{{ currentMesh.max_members }}</span>
          </div>
          <div v-if="currentMesh.description" class="info-tile full">
            <span class="label">About</span>
            <span class="desc-val">{{ currentMesh.description }}</span>
          </div>
        </div>

        <div class="capacity-panel column ga-xs">
          <div class="row items-center">
            <span class="label">Capacity</span>
            <span class="stat-val ml-auto">{{ occupancy(currentMesh) }}%</span>
          </div>
          <div class="capacity-track prominent" aria-hidden="true">
            <span class="capacity-fill" :style="{ width: occupancy(currentMesh) + '%' }"></span>
          </div>
        </div>

        <p class="hint-text">
          Member details are available in the admin panel. The public directory only exposes safe mesh metadata.
        </p>
      </div>
    </template>

  </div>
</template>

<script>
import useMeshStore from '../stores/useMeshStore';

export default {
  name: 'MeshPage',
  emits: ['close'],

  data() {
    return {
      mesh: useMeshStore(),
      view: 'list',          // 'list' | 'node' | 'detail'
      currentMesh: null,
      copied: null,
    };
  },

  computed: {
    /** Public mesh directory. Backend already filters invalid/legacy meshes. */
    visibleMeshList() {
      return this.mesh.meshList;
    },

    totalMembers() {
      return this.visibleMeshList.reduce((total, item) => total + Number(item.member_count || 0), 0);
    },

    viewSubtitle() {
      if (this.view === 'node') return this.mesh.nodeActive ? 'Overlay online' : 'Overlay standby';
      if (this.view === 'detail') return this.currentMesh?.subnet || 'Public metadata';
      return `${this.visibleMeshList.length} public meshes`;
    },
  },

  async created() {
    await Promise.all([
      this.mesh.loadNodeStatus(),
      this.mesh.listMeshes(),
    ]);

    this._meshEventListener = (msg) => {
      if (msg?.type !== 'meshEvent') return;
      this.mesh.loadNodeStatus().catch(() => {});
      if (this.view === 'list') this.mesh.listMeshes().catch(() => {});
      if (this.view === 'detail' && this.currentMesh) {
        this.mesh.getMesh(this.currentMesh.id).then(() => {
          this.currentMesh = this.mesh.currentMesh;
        }).catch(() => {});
      }
    };
    chrome.runtime.onMessage.addListener(this._meshEventListener);
  },

  beforeUnmount() {
    if (this._meshEventListener) {
      chrome.runtime.onMessage.removeListener(this._meshEventListener);
    }
  },

  methods: {
    async reload() {
      await Promise.all([this.mesh.loadNodeStatus(), this.mesh.listMeshes()]);
    },

    goBack() {
      if (this.view === 'detail') {
        this.view = 'list';
      } else if (this.view === 'node') {
        this.view = 'list';
      }
    },

    async toggleNode() {
      try {
        if (this.mesh.nodeActive) await this.mesh.deactivateNode();
        else await this.mesh.activateNode();
      } catch (_) {}
    },

    async openDetail(m) {
      this.view = 'detail';
      this.currentMesh = m;
      try {
        await this.mesh.getMesh(m.id);
        this.currentMesh = this.mesh.currentMesh;
      } catch (_) {}
    },

    countryCode(mesh) {
      if (mesh?.country_code) return String(mesh.country_code).toUpperCase();
      const match = String(mesh?.name || '').match(/\[([A-Za-z]{2})\]/);
      return match ? match[1].toUpperCase() : '--';
    },

    occupancy(mesh) {
      const max = Number(mesh?.max_members || 0);
      if (!max) return 0;
      return Math.min(100, Math.round((Number(mesh?.member_count || 0) / max) * 100));
    },

    async copyText(text, key) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        this.copied = key;
        setTimeout(() => { this.copied = null; }, 2000);
      } catch (_) {}
    },
  },
};
</script>

<style scoped>
.mesh-page {
  --mesh-ink: #132238;
  --mesh-muted: #6b7b92;
  --mesh-soft: #eff6f5;
  --mesh-card: rgba(255, 255, 255, 0.9);
  --mesh-line: rgba(32, 72, 92, 0.12);
  --mesh-blue: #1f9bd8;
  --mesh-green: #2eb872;
  --mesh-red: #e45f64;
  padding: 0.65rem;
  width: 330px;
  height: 460px;
  background:
    radial-gradient(circle at 12% 8%, rgba(76, 193, 118, 0.28), transparent 26%),
    radial-gradient(circle at 90% 4%, rgba(73, 185, 255, 0.3), transparent 30%),
    linear-gradient(165deg, #f8fbf8 0%, #e9f4f7 52%, #edf7ef 100%);
  color: var(--mesh-ink);
  font-family: 'Inter', sans-serif;
  box-sizing: border-box;
  overflow: hidden;
}

.mesh-header {
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 1rem;
  padding: 0.45rem 0.55rem;
  box-shadow: 0 12px 28px rgba(44, 75, 92, 0.1);
  backdrop-filter: blur(12px);
}

.title-stack { display: flex; flex-direction: column; min-width: 0; }
.mesh-title { font-size: 0.98rem; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
.mesh-kicker { color: var(--mesh-muted); font-size: 0.68rem; line-height: 1.1; }

.nav-btn,
.refresh-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid var(--mesh-line);
  border-radius: 0.72rem;
  color: var(--mesh-blue);
  cursor: pointer;
  padding: 0;
  box-shadow: 0 6px 14px rgba(31, 155, 216, 0.08);
}
.refresh-btn:disabled { opacity: 0.55; cursor: default; }
.spinning { animation: spin 0.9s linear infinite; }

.btn-primary {
  background: linear-gradient(135deg, #1f9bd8, #43c77a);
  color: white;
  border: none;
  border-radius: 0.85rem;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 12px 20px rgba(46, 184, 114, 0.22);
}
.btn-primary:disabled { opacity: 0.5; cursor: default; }

.btn-danger {
  background: linear-gradient(135deg, #e45f64, #f39a68);
  color: white;
  border: none;
  border-radius: 0.85rem;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
}
.btn-danger:disabled { opacity: 0.5; cursor: default; }

.btn-copy {
  background: white;
  border: 1px solid var(--mesh-line);
  border-radius: 0.55rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-copy-sm { padding: 0.1rem 0.4rem; font-size: 0.72rem; }
.btn-clear-err { background: none; border: none; cursor: pointer; margin-left: auto; color: #b91c1c; }
.btn-text {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--mesh-blue);
  padding: 0;
  font-weight: 700;
}
.btn-toggle { white-space: nowrap; width: 100%; }

.error-banner {
  background: rgba(254, 226, 226, 0.92);
  border: 1px solid #fca5a5;
  color: #b91c1c;
  border-radius: 0.85rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.78rem;
}

.atlas-hero {
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(140deg, rgba(19, 34, 56, 0.94), rgba(29, 87, 104, 0.88)),
    radial-gradient(circle at 80% 18%, rgba(73, 185, 255, 0.5), transparent 28%);
  color: white;
  border-radius: 1.15rem;
  padding: 0.85rem;
  overflow: hidden;
  box-shadow: 0 18px 38px rgba(19, 34, 56, 0.2);
}
.atlas-hero::after {
  content: "";
  position: absolute;
  inset: auto -28px -44px auto;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: rgba(67, 199, 122, 0.22);
  z-index: -1;
}
.hero-orbit {
  position: absolute;
  top: -42px;
  right: -35px;
  width: 130px;
  height: 130px;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 50%;
}
.hero-orbit::before,
.hero-orbit::after {
  content: "";
  position: absolute;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 50%;
}
.hero-orbit::before { inset: 18px; }
.hero-orbit::after { inset: 38px; background: rgba(255,255,255,0.08); }
.eyebrow {
  color: rgba(255,255,255,0.72);
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hero-title {
  max-width: 230px;
  margin: 0;
  font-size: 1.16rem;
  line-height: 1.05;
  letter-spacing: -0.045em;
}
.hero-copy {
  max-width: 252px;
  margin: 0;
  color: rgba(255,255,255,0.75);
  font-size: 0.76rem;
  line-height: 1.4;
}
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}
.stat-chip {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 0.8rem;
  padding: 0.5rem 0.6rem;
}
.stat-chip.wide { grid-column: span 2; }
.stat-number { color: white; font-size: 1rem; font-weight: 800; line-height: 1; }
.stat-label { color: rgba(255,255,255,0.62); font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.04em; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.82rem; }

.section-row { margin: 0.1rem 0 0; }
.section-title { font-size: 0.72rem; font-weight: 800; color: var(--mesh-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.section-count {
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(19, 34, 56, 0.08);
  color: var(--mesh-ink);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
}

.node-mini-card {
  background: var(--mesh-card);
  border: 1px solid rgba(255,255,255,0.9);
  border-radius: 1rem;
  padding: 0.65rem;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(43, 74, 93, 0.09);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.node-mini-card:hover { transform: translateY(-1px); box-shadow: 0 16px 28px rgba(43, 74, 93, 0.13); }
.node-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.9rem;
  color: #7c8aa0;
  background: #eef3f5;
}
.node-icon.active { color: white; background: linear-gradient(135deg, #43c77a, #1f9bd8); }
.mini-copy { flex: 1; min-width: 0; }
.status-mini { font-size: 0.84rem; font-weight: 800; color: var(--mesh-ink); }
.status-sub { color: var(--mesh-muted); font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-ip {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.7rem;
  color: #12623d;
  background: #e8fff2;
  border: 1px solid #b9f3ce;
  padding: 0.18rem 0.42rem;
  border-radius: 999px;
}
.chevron { color: #91a0b2; font-size: 1rem; }

.node-card {
  background: var(--mesh-card);
  border: 1px solid rgba(255,255,255,0.9);
  border-radius: 1.1rem;
  padding: 0.9rem;
  box-shadow: 0 16px 34px rgba(43, 74, 93, 0.12);
}

.mesh-list {
  max-height: 122px;
  overflow-y: auto;
  padding-right: 0.12rem;
}
.mesh-list::-webkit-scrollbar { width: 5px; }
.mesh-list::-webkit-scrollbar-thumb { background: rgba(19, 34, 56, 0.18); border-radius: 999px; }
.mesh-row {
  background: rgba(255,255,255,0.88);
  border: 1px solid rgba(255,255,255,0.92);
  border-radius: 0.95rem;
  padding: 0.58rem;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.mesh-row:hover { transform: translateY(-1px); background: white; border-color: rgba(31, 155, 216, 0.25); }
.country-badge {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 0.85rem;
  color: white;
  background:
    linear-gradient(135deg, rgba(31,155,216,0.95), rgba(46,184,114,0.95)),
    #1f9bd8;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.03em;
  box-shadow: 0 10px 18px rgba(31, 155, 216, 0.2);
}
.country-badge.large { width: 52px; height: 52px; border-radius: 1rem; font-size: 0.95rem; }
.mesh-copy { flex: 1; min-width: 0; }
.mesh-name {
  font-size: 0.83rem;
  font-weight: 850;
  color: var(--mesh-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-name { font-size: 0.98rem; }
.mesh-sub { font-size: 0.68rem; color: var(--mesh-muted); }
.live-pill {
  flex-shrink: 0;
  font-size: 0.56rem;
  font-weight: 900;
  color: #127346;
  background: #dcfce7;
  border-radius: 999px;
  padding: 0.08rem 0.32rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.empty-card {
  background: rgba(255,255,255,0.82);
  border: 1px dashed rgba(31,155,216,0.28);
  border-radius: 1rem;
  padding: 1.4rem 1rem;
  box-shadow: 0 12px 24px rgba(43, 74, 93, 0.07);
  text-align: center;
}
.empty-icon { color: var(--mesh-blue); }

.ip-box {
  background: #e8fff2;
  border: 1px solid #b9f3ce;
  border-radius: 0.8rem;
  padding: 0.5rem 0.65rem;
}
.ip-val {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82rem;
  color: #12623d;
  flex: 1;
}

.peers-section { margin-top: 0.2rem; }
.peer-row {
  background: #f7fbfc;
  border: 1px solid var(--mesh-line);
  border-radius: 0.72rem;
  padding: 0.42rem 0.6rem;
}
.peer-ip {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  color: #0369a1;
  min-width: 100px;
}
.peer-name { font-size: 0.8rem; color: var(--mesh-muted); }

.node-hero {
  background: linear-gradient(145deg, rgba(19, 34, 56, 0.06), rgba(31,155,216,0.08));
  border: 1px solid var(--mesh-line);
  border-radius: 1rem;
  padding: 0.8rem;
}
.node-state-pill {
  align-self: flex-start;
  color: #7c4b20;
  background: #fff1db;
  border: 1px solid #ffd79a;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.62rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.node-state-pill.active {
  color: #12623d;
  background: #dcfce7;
  border-color: #a7f3c4;
}
.node-title { margin: 0; font-size: 1.05rem; line-height: 1.1; letter-spacing: -0.035em; }

.detail-hero {
  background: linear-gradient(145deg, rgba(31,155,216,0.08), rgba(46,184,114,0.09));
  border: 1px solid var(--mesh-line);
  border-radius: 1rem;
  padding: 0.72rem;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}
.info-tile {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  background: #f7fbfc;
  border: 1px solid var(--mesh-line);
  border-radius: 0.82rem;
  padding: 0.62rem;
}
.info-tile.full { grid-column: span 2; }
.capacity-panel {
  background: #f7fbfc;
  border: 1px solid var(--mesh-line);
  border-radius: 0.82rem;
  padding: 0.62rem;
}
.capacity-track {
  position: relative;
  height: 5px;
  overflow: hidden;
  background: rgba(19, 34, 56, 0.1);
  border-radius: 999px;
}
.capacity-track.prominent { height: 8px; }
.capacity-fill {
  display: block;
  height: 100%;
  min-width: 5px;
  background: linear-gradient(90deg, #1f9bd8, #43c77a);
  border-radius: inherit;
}

.skeleton-card {
  height: 58px;
  border-radius: 0.95rem;
  background: linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.95), rgba(255,255,255,0.55));
  background-size: 220% 100%;
  animation: shimmer 1.2s infinite;
}
.skeleton-card.short { width: 88%; }

.stat-val { font-size: 0.84rem; color: var(--mesh-ink); font-weight: 800; }
.desc-val { font-size: 0.8rem; color: var(--mesh-muted); flex: 1; line-height: 1.35; }

.hint-text { font-size: 0.76rem; color: var(--mesh-muted); margin: 0; line-height: 1.42; }
.label { font-size: 0.62rem; color: var(--mesh-muted); font-weight: 900; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.05em; }
.loading-text, .empty-text { font-size: 0.82rem; color: var(--mesh-muted); }

.ml-auto { margin-left: auto; }

.row { display: flex; flex-direction: row; }
.column { display: flex; flex-direction: column; }
.items-center { align-items: center; }
.ga-xs { gap: 0.25rem; }
.ga-sm { gap: 0.5rem; }
.ga-md { gap: 0.75rem; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
</style>
