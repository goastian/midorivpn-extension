<template>
  <div class="mesh-page column ga-md">

    <!-- Header -->
    <div class="mesh-header row items-center ga-sm">
      <button v-if="view !== 'list'" class="btn-back" @click="goBack">←</button>
      <button v-else class="btn-back" @click="$emit('close')">←</button>
      <h2 class="mesh-title">
        {{ view === 'list' ? 'Mesh Networks' : view === 'node' ? 'Mesh Node' : view === 'detail' ? (currentMesh?.name || 'Mesh Detail') : view === 'create' ? 'Create Mesh' : 'Join Mesh' }}
      </h2>
      <button v-if="view === 'list'" class="btn-icon ml-auto" title="Refresh" :disabled="mesh.loading" @click="reload">↻</button>
    </div>

    <!-- Error banner -->
    <div v-if="mesh.error" class="error-banner row items-center ga-sm">
      <span>⚠️ {{ mesh.error }}</span>
      <button class="btn-clear-err" @click="mesh.clearError()">✕</button>
    </div>

    <!-- ── VIEW: LIST ─────────────────────────────────────────────────────── -->
    <template v-if="view === 'list'">
      <!-- Node status summary card -->
      <div class="node-mini-card row items-center ga-sm" @click="view = 'node'" role="button">
        <span class="status-dot" :class="{ active: mesh.nodeActive }"></span>
        <span class="status-mini">Node {{ mesh.nodeActive ? 'Active' : 'Inactive' }}</span>
        <span v-if="mesh.myMeshIp" class="mini-ip">{{ mesh.myMeshIp }}</span>
        <span class="chevron ml-auto">›</span>
      </div>

      <!-- Mesh list -->
      <div v-if="mesh.loading && !mesh.meshList.length" class="loading-text">Loading…</div>
      <div v-if="!visibleMeshList.length && !mesh.loading" class="empty-card column ga-sm items-center">
        <span class="empty-icon">🌐</span>
        <span class="empty-text">No mesh networks yet.</span>
        <span class="hint-text">Create one or join with an invite code.</span>
      </div>
      <div v-else class="mesh-list column ga-xs">
        <div
          v-for="m in visibleMeshList"
          :key="m.id"
          class="mesh-row row items-center ga-sm"
          @click="openDetail(m)"
          role="button"
        >
          <div class="column" style="flex:1; min-width:0">
            <span class="mesh-name">{{ m.name }}</span>
            <span class="mesh-sub">{{ m.subnet }} · {{ m.member_count }}/{{ m.max_members }} members</span>
          </div>
          <span class="owner-badge" v-if="m.invite_code">owner</span>
          <span class="chevron">›</span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="row ga-sm">
        <button class="btn-primary flex-1" @click="view = 'create'">+ Create</button>
        <button class="btn-outline flex-1" @click="view = 'join'">Join</button>
      </div>
    </template>

    <!-- ── VIEW: NODE ─────────────────────────────────────────────────────── -->
    <template v-else-if="view === 'node'">
      <div class="node-card column ga-md">
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
            <button class="btn-text btn-refresh" :disabled="mesh.loading" @click="mesh.loadNodeStatus()">↻</button>
          </div>
          <div v-if="mesh.loading" class="loading-text">Loading…</div>
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
        <!-- Info -->
        <div class="column ga-xs">
          <div class="row items-center ga-sm">
            <span class="label">Subnet</span>
            <code class="ip-val">{{ currentMesh.subnet }}</code>
          </div>
          <div class="row items-center ga-sm">
            <span class="label">Members</span>
            <span class="stat-val">{{ currentMesh.member_count }}/{{ currentMesh.max_members }}</span>
          </div>
          <div v-if="currentMesh.description" class="row ga-sm">
            <span class="label">About</span>
            <span class="desc-val">{{ currentMesh.description }}</span>
          </div>
        </div>

        <!-- Invite code (only shown to owner — backend omits invite_code for non-owners) -->
        <div v-if="currentMesh.invite_code" class="invite-box column ga-xs">
          <div class="row items-center ga-sm">
            <span class="label">Invite Code</span>
            <button class="btn-text" :disabled="mesh.loading" @click="refreshInvite">↻ New</button>
          </div>
          <div class="row items-center ga-sm">
            <code class="invite-code">{{ currentMesh.invite_code }}</code>
            <button class="btn-copy btn-copy-sm" @click="copyText(currentMesh.invite_code, 'invite')" :title="copied === 'invite' ? 'Copied!' : 'Copy'">
              {{ copied === 'invite' ? '✓' : '📋' }}
            </button>
          </div>
        </div>

        <!-- Members list -->
        <div class="column ga-xs">
          <span class="label">Members</span>
          <div v-if="mesh.loading" class="loading-text">Loading…</div>
          <div v-else-if="!currentMesh.members?.length" class="empty-text">No members yet.</div>
          <div v-else v-for="member in currentMesh.members" :key="member.id" class="peer-row row items-center ga-sm">
            <span class="peer-ip">{{ member.mesh_ip }}</span>
            <span class="peer-name flex-1">{{ member.display_name || '—' }}</span>
          </div>
        </div>

        <!-- Leave / Delete -->
        <button class="btn-danger" :disabled="mesh.loading" @click="confirmLeave">
          {{ currentMesh.invite_code ? 'Delete Mesh' : 'Leave Mesh' }}
        </button>
      </div>
    </template>

    <!-- ── VIEW: CREATE ───────────────────────────────────────────────────── -->
    <template v-else-if="view === 'create'">
      <div class="node-card column ga-md">
        <div class="field column ga-xs">
          <label class="label" for="m-name">Name *</label>
          <input id="m-name" v-model="form.name" class="input" placeholder="My Mesh" maxlength="64" />
        </div>
        <div class="field column ga-xs">
          <label class="label" for="m-desc">Description</label>
          <input id="m-desc" v-model="form.description" class="input" placeholder="Optional" maxlength="200" />
        </div>
        <div class="field column ga-xs">
          <label class="label" for="m-max">Max members</label>
          <input id="m-max" v-model.number="form.maxMembers" class="input" type="number" min="2" max="50" />
        </div>
        <div class="row ga-sm">
          <button class="btn-outline flex-1" @click="view = 'list'">Cancel</button>
          <button class="btn-primary flex-1" :disabled="mesh.loading || !form.name.trim()" @click="doCreate">
            {{ mesh.loading ? '…' : 'Create' }}
          </button>
        </div>
      </div>
    </template>

    <!-- ── VIEW: JOIN ─────────────────────────────────────────────────────── -->
    <template v-else-if="view === 'join'">
      <div class="node-card column ga-md">
        <div class="field column ga-xs">
          <label class="label" for="j-code">Invite Code *</label>
          <input id="j-code" v-model="joinCode" class="input" placeholder="Paste invite code here" />
        </div>
        <div class="row ga-sm">
          <button class="btn-outline flex-1" @click="view = 'list'">Cancel</button>
          <button class="btn-primary flex-1" :disabled="mesh.loading || !joinCode.trim()" @click="doJoin">
            {{ mesh.loading ? '…' : 'Join' }}
          </button>
        </div>
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
      view: 'list',          // 'list' | 'node' | 'detail' | 'create' | 'join'
      currentMesh: null,
      form: { name: '', description: '', maxMembers: 10 },
      joinCode: '',
      copied: null,
    };
  },

  computed: {
    /** Hide auto-managed session meshes from the user-facing list. */
    visibleMeshList() {
      return this.mesh.meshList.filter(m => !m.is_session);
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
      if (this.view === 'detail' || this.view === 'create' || this.view === 'join') {
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

    async doCreate() {
      try {
        await this.mesh.createMesh({
          name: this.form.name.trim(),
          description: this.form.description.trim(),
          maxMembers: this.form.maxMembers,
        });
        this.form = { name: '', description: '', maxMembers: 10 };
        this.view = 'list';
      } catch (_) {}
    },

    async doJoin() {
      try {
        await this.mesh.joinMesh(this.joinCode.trim());
        this.joinCode = '';
        this.view = 'list';
      } catch (_) {}
    },

    async confirmLeave() {
      if (!this.currentMesh) return;
      const label = this.currentMesh.invite_code ? 'delete' : 'leave';
      if (!confirm(`Are you sure you want to ${label} "${this.currentMesh.name}"?`)) return;
      try {
        await this.mesh.leaveMesh(this.currentMesh.id);
        this.currentMesh = null;
        this.view = 'list';
      } catch (_) {}
    },

    async refreshInvite() {
      if (!this.currentMesh) return;
      try {
        const result = await this.mesh.createInvite(this.currentMesh.id);
        this.currentMesh = { ...this.currentMesh, invite_code: result.invite_code };
      } catch (_) {}
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
  padding: 0.6rem;
  width: 330px;
  min-height: 460px;
  background-color: #F1F5F9;
  color: #202020;
  font-family: 'Inter', sans-serif;
  box-sizing: border-box;
}

.mesh-header {
  background: white;
  border-radius: 0.4rem;
  padding: 0.4rem 0.8rem;
  margin-bottom: 0.2rem;
}
.mesh-title { font-size: 1rem; font-weight: 600; margin: 0; flex: 1; }

.btn-back, .btn-text {
  background: none; border: none; cursor: pointer;
  font-size: 0.9rem; color: #49B9FF; padding: 0;
}
.btn-icon {
  background: none; border: none; cursor: pointer;
  font-size: 1rem; color: #49B9FF; padding: 0;
}
.btn-icon:disabled { opacity: 0.4; cursor: default; }

.btn-primary {
  background-color: #49B9FF; color: white; border: none;
  border-radius: 0.4rem; padding: 0.4rem 0.9rem;
  cursor: pointer; font-size: 0.85rem;
}
.btn-primary:disabled { opacity: 0.5; cursor: default; }

.btn-outline {
  background: white; color: #49B9FF;
  border: 1px solid #49B9FF; border-radius: 0.4rem;
  padding: 0.4rem 0.9rem; cursor: pointer; font-size: 0.85rem;
}
.btn-outline:disabled { opacity: 0.5; cursor: default; }

.btn-danger {
  background-color: #E67B7B; color: white; border: none;
  border-radius: 0.4rem; padding: 0.4rem 0.9rem;
  cursor: pointer; font-size: 0.85rem;
}
.btn-danger:disabled { opacity: 0.5; cursor: default; }

.btn-copy {
  background: #e2e8f0; border: none; border-radius: 0.3rem;
  padding: 0.2rem 0.5rem; font-size: 0.75rem; cursor: pointer;
}
.btn-copy-sm { padding: 0.1rem 0.4rem; font-size: 0.72rem; }
.btn-clear-err { background: none; border: none; cursor: pointer; margin-left: auto; color: #b91c1c; }
.btn-refresh { font-size: 0.75rem; }
.btn-toggle { white-space: nowrap; }

.error-banner {
  background: #fee2e2; border: 1px solid #fca5a5;
  color: #b91c1c; border-radius: 0.4rem;
  padding: 0.4rem 0.6rem; font-size: 0.8rem;
}

.node-mini-card {
  background: white; border-radius: 0.5rem;
  padding: 0.5rem 0.8rem; cursor: pointer;
  box-shadow: rgba(0,0,0,0.04) 0 1px 3px;
  transition: box-shadow 0.15s;
}
.node-mini-card:hover { box-shadow: rgba(0,0,0,0.1) 0 2px 6px; }
.status-mini { font-size: 0.82rem; font-weight: 500; color: #475569; }
.mini-ip { font-family: monospace; font-size: 0.78rem; color: #166534; background: #f0fdf4; padding: 0.1rem 0.4rem; border-radius: 0.3rem; }
.chevron { color: #94a3b8; font-size: 1rem; }

.node-card {
  background: white; border-radius: 0.6rem;
  padding: 1rem; box-shadow: rgba(0,0,0,0.06) 0 1px 4px;
}

.mesh-list { max-height: 240px; overflow-y: auto; }
.mesh-row {
  background: white; border-radius: 0.4rem;
  padding: 0.5rem 0.7rem; cursor: pointer;
  transition: background 0.1s;
}
.mesh-row:hover { background: #f0f9ff; }
.mesh-name { font-size: 0.88rem; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mesh-sub { font-size: 0.73rem; color: #94a3b8; }
.owner-badge {
  font-size: 0.65rem; background: #dbeafe; color: #1d4ed8;
  border-radius: 0.9rem; padding: 0.1rem 0.45rem; white-space: nowrap;
}

.empty-card {
  background: white; border-radius: 0.6rem; padding: 1.5rem 1rem;
  box-shadow: rgba(0,0,0,0.04) 0 1px 3px; text-align: center;
}
.empty-icon { font-size: 1.8rem; }

.status-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #94a3b8; flex-shrink: 0;
}
.status-dot.active { background: #22c55e; }
.status-label { font-size: 0.9rem; font-weight: 500; color: #64748b; }
.status-label.active { color: #15803d; }

.ip-box {
  background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 0.4rem; padding: 0.4rem 0.7rem;
}
.ip-val { font-family: monospace; font-size: 0.88rem; color: #166534; flex: 1; }

.invite-box {
  background: #f0f9ff; border: 1px dashed #7dd3fc;
  border-radius: 0.4rem; padding: 0.5rem 0.7rem;
}
.invite-code {
  font-family: monospace; font-size: 0.8rem; color: #0369a1;
  word-break: break-all; flex: 1;
}

.peers-section { margin-top: 0.2rem; }
.peer-row {
  background: #f8fafc; border-radius: 0.35rem;
  padding: 0.35rem 0.6rem;
}
.peer-ip { font-family: monospace; font-size: 0.8rem; color: #0369a1; min-width: 100px; }
.peer-name { font-size: 0.82rem; color: #475569; }

.field { width: 100%; }
.input {
  width: 100%; box-sizing: border-box;
  padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1;
  border-radius: 0.35rem; font-size: 0.85rem;
  background: #f8fafc; color: #1e293b;
  outline: none;
}
.input:focus { border-color: #49B9FF; background: white; }

.stat-val { font-size: 0.85rem; color: #1e293b; }
.desc-val { font-size: 0.82rem; color: #475569; flex: 1; }

.hint-text { font-size: 0.8rem; color: #94a3b8; margin: 0; line-height: 1.4; }
.label { font-size: 0.72rem; color: #64748b; font-weight: 600; text-transform: uppercase; white-space: nowrap; }
.loading-text, .empty-text { font-size: 0.82rem; color: #94a3b8; }

.ml-auto { margin-left: auto; }
.flex-1 { flex: 1; }

.row { display: flex; flex-direction: row; }
.column { display: flex; flex-direction: column; }
.items-center { align-items: center; }
.ga-xs { gap: 0.25rem; }
.ga-sm { gap: 0.5rem; }
.ga-md { gap: 0.75rem; }
</style>
