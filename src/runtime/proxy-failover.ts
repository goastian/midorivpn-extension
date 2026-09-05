import type { ActiveServer, ProxyServer } from '../utils/proxy-routing';

export type ProxySelectionMode = 'automatic' | 'manual';
export type ProxyFailoverPhase = 'off' | 'connecting' | 'connected' | 'retrying';

export interface ProxyCandidate extends ActiveServer {
  id: string;
  name: string;
  location: string;
  country_code: string;
  protocol: 'proxy';
  probe_url: string;
  endpoint: string;
  port: number;
  priority: number;
}

export interface ProxyFailoverState {
  enabled: boolean;
  selectionMode: ProxySelectionMode;
  manualServerId: string;
  activeServer: ProxyCandidate | null;
  phase: ProxyFailoverPhase;
  retryAttempt: number;
  nextRetryAt: number;
  consecutiveFailures: number;
  lastFailureAt: number;
  lastError: string;
}

export interface ProxyFailoverDependencies {
  readState(): Promise<ProxyFailoverState>;
  writeState(state: ProxyFailoverState): Promise<void>;
  listAutomaticCandidates(): Promise<ProxyCandidate[]>;
  getManualCandidate(serverId: string): Promise<ProxyCandidate | null>;
  probe(candidate: ProxyCandidate): Promise<number | null>;
  updateProbeBypass(candidates: ProxyCandidate[]): Promise<void>;
  getScopedCredential(serverId: string): Promise<string | null>;
  invalidateScopedCredential(): void;
  applyProxy(proxy: ProxyServer): Promise<void>;
  applyBlockProxy(): Promise<void>;
  resetProxy(): Promise<void>;
  scheduleRetry(when: number): Promise<void>;
  cancelRetry(): Promise<void>;
  showConnected(): Promise<void>;
  showFailure(): Promise<void>;
  showDisconnected(): Promise<void>;
  now(): number;
  random(): number;
}

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;
const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 15_000;
const PROBE_TIMEOUT_MS = 1_500;

export async function probeCandidateHTTPS(
  candidate: ProxyCandidate,
  fetcher: typeof fetch = fetch,
  clock: () => number = () => performance.now(),
): Promise<number | null> {
  let parsed: URL;
  try {
    parsed = new URL(candidate.probe_url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== '/.well-known/midorivpn/edge-health') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = clock();
  try {
    const response = await fetcher(parsed.toString(), {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status !== 204) return null;
    return Math.max(clock() - started, 0);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function defaultProxyFailoverState(): ProxyFailoverState {
  return {
    enabled: false,
    selectionMode: 'automatic',
    manualServerId: '',
    activeServer: null,
    phase: 'off',
    retryAttempt: 0,
    nextRetryAt: 0,
    consecutiveFailures: 0,
    lastFailureAt: 0,
    lastError: '',
  };
}

export function retryDelayMs(attempt: number, random: number): number {
  const index = Math.min(Math.max(attempt, 0), RETRY_DELAYS_MS.length - 1);
  const base = RETRY_DELAYS_MS[index];
  const boundedRandom = Math.min(Math.max(random, 0), 1);
  return Math.round(base * (0.8 + boundedRandom * 0.4));
}

export async function selectLowestMedian(
  candidates: ProxyCandidate[],
  probe: (candidate: ProxyCandidate) => Promise<number | null>,
  concurrency = 4,
): Promise<ProxyCandidate | null> {
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const measurements: Array<{ candidate: ProxyCandidate; median: number }> = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < unique.length) {
      const candidate = unique[cursor++];
      const samples: number[] = [];
      for (let index = 0; index < 3; index += 1) {
        let sample: number | null;
        try {
          sample = await probe(candidate);
        } catch {
          sample = null;
        }
        if (sample === null || !Number.isFinite(sample) || sample < 0) break;
        samples.push(sample);
      }
      if (samples.length !== 3) continue;
      samples.sort((left, right) => left - right);
      measurements.push({ candidate, median: samples[1] });
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(Math.max(concurrency, 1), unique.length) },
    () => worker(),
  ));

  measurements.sort((left, right) =>
    left.median - right.median ||
    right.candidate.priority - left.candidate.priority ||
    left.candidate.id.localeCompare(right.candidate.id));
  return measurements[0]?.candidate ?? null;
}

export function createProxyFailoverRuntime(dependencies: ProxyFailoverDependencies) {
  let recovery: Promise<boolean> | null = null;
  let generation = 0;

  const persistFailure = async (state: ProxyFailoverState, message: string, owner: number): Promise<boolean> => {
    if (owner !== generation) return false;
    const retryAttempt = Math.min(state.retryAttempt + 1, RETRY_DELAYS_MS.length);
    const nextRetryAt = dependencies.now() + retryDelayMs(state.retryAttempt, dependencies.random());
    let blocked = true;
    try {
      await dependencies.updateProbeBypass([]);
      await dependencies.applyBlockProxy();
    } catch {
      blocked = false;
    }
    if (owner !== generation) return false;
    const failed: ProxyFailoverState = {
      ...state,
      enabled: blocked,
      activeServer: null,
      phase: blocked ? 'retrying' : 'off',
      retryAttempt,
      nextRetryAt: blocked ? nextRetryAt : 0,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      lastError: blocked ? message : 'proxy_block_failed',
    };
    dependencies.invalidateScopedCredential();
    await dependencies.writeState(failed);
    await dependencies.showFailure().catch(() => undefined);
    if (blocked) await dependencies.scheduleRetry(nextRetryAt).catch(() => undefined);
    else await dependencies.cancelRetry().catch(() => undefined);
    return false;
  };

  const performRecovery = async (excludeServerId: string, owner: number): Promise<boolean> => {
    const state = await dependencies.readState();
    if (!state.enabled || owner !== generation) return false;

    await dependencies.writeState({ ...state, phase: 'connecting', lastError: '' });
    let candidates: ProxyCandidate[];
    try {
      if (state.selectionMode === 'manual') {
        const manual = state.manualServerId
          ? await dependencies.getManualCandidate(state.manualServerId)
          : null;
        candidates = manual ? [manual] : [];
      } else {
        candidates = await dependencies.listAutomaticCandidates();
        if (excludeServerId) {
          candidates = candidates.filter((candidate) => candidate.id !== excludeServerId);
        }
      }
    } catch {
      return persistFailure(state, 'candidate_list_unavailable', owner);
    }

    await dependencies.updateProbeBypass(candidates);
    try {
      await dependencies.applyBlockProxy();
    } catch {
      return persistFailure(state, 'proxy_configuration_failed', owner);
    }

    const selected = await selectLowestMedian(candidates, dependencies.probe);
    if (owner !== generation) return false;
    if (!selected) return persistFailure(state, 'no_reachable_proxy_server', owner);

    const changedServer = state.activeServer?.id !== selected.id;
    if (changedServer) dependencies.invalidateScopedCredential();
    const selecting: ProxyFailoverState = {
      ...state,
      enabled: true,
      activeServer: selected,
      phase: 'connecting',
      lastError: '',
    };
    // Persist before requesting the scoped credential so authentication
    // challenges and a restarted worker resolve the same effective server.
    await dependencies.writeState(selecting);

    let credential: string | null = null;
    try {
      credential = await dependencies.getScopedCredential(selected.id);
    } catch {
      // Credential acquisition can fail transiently with Control unavailable.
    }
    if (owner !== generation) return false;
    if (!credential) return persistFailure(selecting, 'proxy_credential_unavailable', owner);

    try {
      await dependencies.updateProbeBypass([]);
      await dependencies.applyProxy({
        scheme: 'https',
        host: selected.endpoint,
        port: selected.port,
      });
    } catch {
      return persistFailure(selecting, 'proxy_configuration_failed', owner);
    }
    if (owner !== generation) return false;

    const connected: ProxyFailoverState = {
      ...selecting,
      phase: 'connected',
      retryAttempt: 0,
      nextRetryAt: 0,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      lastError: '',
    };
    await dependencies.writeState(connected);
    await Promise.allSettled([
      dependencies.cancelRetry(),
      dependencies.showConnected(),
    ]);
    return true;
  };

  const recover = (excludeServerId = ''): Promise<boolean> => {
    if (recovery) return recovery;
    const owner = generation;
    recovery = performRecovery(excludeServerId, owner).finally(() => { recovery = null; });
    return recovery;
  };

  const connect = async (): Promise<boolean> => {
    generation += 1;
    const state = await dependencies.readState();
    try {
      await dependencies.updateProbeBypass([]);
      await dependencies.applyBlockProxy();
    } catch {
      await dependencies.writeState({ ...state, enabled: false, phase: 'off', lastError: 'proxy_block_failed' });
      await dependencies.showFailure().catch(() => undefined);
      return false;
    }
    await dependencies.writeState({ ...state, enabled: true, phase: 'connecting', lastError: '' });
    if (recovery) await recovery.catch(() => false);
    return recover();
  };

  const disconnect = async (): Promise<void> => {
    generation += 1;
    const state = await dependencies.readState();
    dependencies.invalidateScopedCredential();
    await dependencies.cancelRetry();
    await dependencies.updateProbeBypass([]);
    await dependencies.resetProxy();
    await dependencies.writeState({
      ...state,
      enabled: false,
      phase: 'off',
      retryAttempt: 0,
      nextRetryAt: 0,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      lastError: '',
    });
    await dependencies.showDisconnected().catch(() => undefined);
  };

  const restore = async (): Promise<boolean> => {
    const state = await dependencies.readState();
    if (!state.enabled) return false;
    if (state.phase === 'retrying' && state.nextRetryAt > dependencies.now()) {
      try {
        await dependencies.updateProbeBypass([]);
        await dependencies.applyBlockProxy();
      } catch {
        await dependencies.writeState({ ...state, enabled: false, phase: 'off', nextRetryAt: 0, lastError: 'proxy_block_failed' });
        await dependencies.showFailure().catch(() => undefined);
        return false;
      }
      await dependencies.scheduleRetry(state.nextRetryAt).catch(() => undefined);
      return false;
    }
    return recover();
  };

  const noteProxyFailure = async (): Promise<boolean> => {
    const state = await dependencies.readState();
    if (!state.enabled || state.phase !== 'connected') return false;
    const now = dependencies.now();
    const failures = state.lastFailureAt > 0 && now - state.lastFailureAt <= FAILURE_WINDOW_MS
      ? state.consecutiveFailures + 1
      : 1;
    if (failures < FAILURE_THRESHOLD) {
      await dependencies.writeState({ ...state, consecutiveFailures: failures, lastFailureAt: now });
      return false;
    }
    generation += 1;
    try {
      await dependencies.updateProbeBypass([]);
      await dependencies.applyBlockProxy();
    } catch {
      await dependencies.writeState({
        ...state,
        enabled: false,
        phase: 'off',
        consecutiveFailures: 0,
        lastFailureAt: 0,
        lastError: 'proxy_block_failed',
      });
      await dependencies.showFailure().catch(() => undefined);
      return false;
    }
    await dependencies.writeState({ ...state, phase: 'retrying', consecutiveFailures: 0, lastFailureAt: 0 });
    return recover(state.selectionMode === 'automatic' ? state.activeServer?.id || '' : '');
  };

  const setSelection = async (selectionMode: ProxySelectionMode, manualServerId = ''): Promise<boolean> => {
    if (selectionMode === 'manual' && !manualServerId) throw new Error('Manual server is required');
    generation += 1;
    const state = await dependencies.readState();
    const modeChanged = state.selectionMode !== selectionMode ||
      (selectionMode === 'manual' && state.manualServerId !== manualServerId);
    const next: ProxyFailoverState = {
      ...state,
      selectionMode,
      manualServerId: selectionMode === 'manual' ? manualServerId : '',
      activeServer: modeChanged ? null : state.activeServer,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      lastError: '',
    };
    dependencies.invalidateScopedCredential();
    await dependencies.writeState(next);
    if (!next.enabled) return true;
    try {
      await dependencies.updateProbeBypass([]);
      await dependencies.applyBlockProxy();
    } catch {
      await dependencies.writeState({ ...next, enabled: false, phase: 'off', lastError: 'proxy_block_failed' });
      await dependencies.showFailure().catch(() => undefined);
      return false;
    }
    if (recovery) await recovery.catch(() => false);
    return recover();
  };

  return { connect, disconnect, noteProxyFailure, recover, restore, setSelection };
}
