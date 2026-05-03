<template>
  <div class="mesh-page column ga-md">

    <!-- Header -->
    <div class="mesh-header row items-center ga-sm">
      <button class="btn-back" @click="$emit('close')">←</button>
      <h2 class="mesh-title">Mesh Node</h2>
    </div>

    <!-- Error banner -->
    <div v-if="mesh.error" class="error-banner row items-center ga-sm">
      <span>⚠️ {{ mesh.error }}</span>
      <button class="btn-clear-err" @click="mesh.clearError()">✕</button>
    </div>

    <!-- Node toggle card -->
    <div class="node-card column ga-md">

      <!-- Status row -->
      <div class="row items-center ga-sm">
        <span class="status-dot" :class="{ active: mesh.nodeActive }"></span>
        <span class="status-label" :class="{ active: mesh.nodeActive }">
          {{ mesh.nodeActive ? 'Node Active' : 'Node Inactive' }}
        </span>
        <button
          class="btn-toggle ml-auto"
          :class="mesh.nodeActive ? 'btn-danger' : 'btn-primary'"
          :disabled="mesh.loading"
          @click="toggleNode"
        >
          {{ mesh.loading ? '…' : (mesh.nodeActive ? 'Deactivate' : 'Activate') }}
        </button>
      </div>

      <!-- Mesh IP -->
      <div v-if="mesh.nodeActive && mesh.myMeshIp" class="ip-box row items-center ga-sm">
        <span class="label">Your IP</span>
        <code class="ip-val">{{ mesh.myMeshIp }}</code>
        <button class="btn-copy btn-copy-sm" @click="copyIP" :title="copied ? 'Copied!' : 'Copy IP'">
          {{ copied ? '✓' : '📋' }}
        </button>
      </div>

      <!-- Peers list -->
      <div v-if="mesh.nodeActive" class="peers-section column ga-xs">
        <div class="row items-center ga-sm">
          <span class="label">Peers ({{ mesh.peers.length }})</span>
          <button class="btn-text btn-refresh" :disabled="mesh.loading" @click="mesh.loadNodeStatus()">↻</button>
        </div>
        <div v-if="mesh.loading" class="loading-text">Loading…</div>
        <div v-else-if="!mesh.peers.length" class="empty-text">No peers online yet.</div>
        <div v-else v-for="peer in mesh.peers" :key="peer.mesh_ip" class="peer-row row items-center ga-sm">
          <span class="peer-ip">{{ peer.mesh_ip }}</span>
          <span v-if="peer.display_name" class="peer-name">{{ peer.display_name }}</span>
        </div>
      </div>

      <!-- Inactive hint -->
      <p v-if="!mesh.nodeActive" class="hint-text">
        Activate to join the mesh overlay and reach other VPN users directly via their mesh IPs.
      </p>

    </div>

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
      copied: false,
    };
  },

  async created() {
    await this.mesh.loadNodeStatus();

    // Refresh node status on real-time mesh events from the background WS.
    this._meshEventListener = (msg) => {
      if (msg?.type !== 'meshEvent') return;
      this.mesh.loadNodeStatus().catch(() => {});
    };
    chrome.runtime.onMessage.addListener(this._meshEventListener);
  },

  beforeUnmount() {
    if (this._meshEventListener) {
      chrome.runtime.onMessage.removeListener(this._meshEventListener);
    }
  },

  methods: {
    async toggleNode() {
      try {
        if (this.mesh.nodeActive) {
          await this.mesh.deactivateNode();
        } else {
          await this.mesh.activateNode();
        }
      } catch (_) {
        // error shown via error banner
      }
    },

    async copyIP() {
      if (!this.mesh.myMeshIp) return;
      try {
        await navigator.clipboard.writeText(this.mesh.myMeshIp);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2000);
      } catch (_) {
        // clipboard not available
      }
    },
  },
};
</script>

<style scoped>
.mesh-page {
  padding: 0.6rem;
  width: 330px;
  min-height: 460px;
  background-color: #F1F5F9;
  color: #202020;
  font-family: 'Inter', sans-serif;
  box-sizing: border-box;
  overflow-y: auto;
}

.mesh-header {
  background: white;
  border-radius: 0.4rem;
  padding: 0.4rem 0.8rem;
  margin-bottom: 0.2rem;
}
.mesh-title { font-size: 1rem; font-weight: 600; margin: 0; }

.btn-back, .btn-text {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #49B9FF;
  padding: 0;
}

.btn-primary {
  background-color: #49B9FF;
  color: white;
  border: none;
  border-radius: 0.4rem;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-danger {
  background-color: #E67B7B;
  color: white;
  border: none;
  border-radius: 0.4rem;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-primary:disabled, .btn-danger:disabled { opacity: 0.5; cursor: default; }

.btn-copy {
  background: #e2e8f0;
  border: none;
  border-radius: 0.3rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-copy-sm { padding: 0.1rem 0.4rem; font-size: 0.72rem; }
.btn-clear-err { background: none; border: none; cursor: pointer; margin-left: auto; color: #b91c1c; }
.btn-refresh { font-size: 0.75rem; margin-left: auto; }

.error-banner {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  border-radius: 0.4rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
}

.node-card {
  background: white;
  border-radius: 0.6rem;
  padding: 1rem;
  box-shadow: rgba(0,0,0,0.06) 0 1px 4px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}
.status-dot.active { background: #22c55e; }

.status-label { font-size: 0.9rem; font-weight: 500; color: #64748b; }
.status-label.active { color: #15803d; }

.ml-auto { margin-left: auto; }
.btn-toggle { white-space: nowrap; }

.ip-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.4rem;
  padding: 0.4rem 0.7rem;
}
.ip-val {
  font-family: monospace;
  font-size: 0.88rem;
  color: #166534;
  flex: 1;
}

.peers-section { margin-top: 0.2rem; }
.peer-row {
  background: #f8fafc;
  border-radius: 0.35rem;
  padding: 0.35rem 0.6rem;
}
.peer-ip {
  font-family: monospace;
  font-size: 0.8rem;
  color: #0369a1;
  min-width: 100px;
}
.peer-name { font-size: 0.82rem; color: #475569; }

.hint-text { font-size: 0.8rem; color: #94a3b8; margin: 0; line-height: 1.4; }

.label { font-size: 0.72rem; color: #64748b; font-weight: 600; text-transform: uppercase; }
.loading-text, .empty-text { font-size: 0.82rem; color: #94a3b8; }

/* Utility */
.row { display: flex; flex-direction: row; }
.column { display: flex; flex-direction: column; }
.items-center { align-items: center; }
.ga-xs { gap: 0.25rem; }
.ga-sm { gap: 0.5rem; }
.ga-md { gap: 0.75rem; }
</style>
