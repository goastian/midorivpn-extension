import { describe, expect, it, vi } from 'vitest';
import {
  createProxyFailoverRuntime,
  defaultProxyFailoverState,
  probeCandidateHTTPS,
  retryDelayMs,
  selectLowestMedian,
  type ProxyCandidate,
  type ProxyFailoverState,
} from '../runtime/proxy-failover';

const candidate = (id: string, priority = 0): ProxyCandidate => ({
  id,
  name: id,
  location: 'test',
  country_code: 'DO',
  protocol: 'proxy',
  probe_url: `https://${id}.example/.well-known/midorivpn/edge-health`,
  endpoint: `${id}.example`,
  port: 443,
  priority,
  transports: [{ protocol: 'proxy', host: `${id}.example`, port: 443, enabled: true, health_status: 'healthy' }],
});

function harness(initial: Partial<ProxyFailoverState> = {}) {
  let state = { ...defaultProxyFailoverState(), ...initial };
  const candidates = [candidate('slow'), candidate('fast')];
  const deps = {
    readState: vi.fn(async () => structuredClone(state)),
    writeState: vi.fn(async (next: ProxyFailoverState) => { state = structuredClone(next); }),
    listAutomaticCandidates: vi.fn(async () => candidates),
    getManualCandidate: vi.fn(async (id: string) => candidates.find((item) => item.id === id) || null),
    probe: vi.fn<(item: ProxyCandidate) => Promise<number | null>>(async (item) => item.id === 'fast' ? 10 : 30),
    updateProbeBypass: vi.fn(async () => undefined),
    getScopedCredential: vi.fn(async () => 'opaque'),
    invalidateScopedCredential: vi.fn(),
    applyProxy: vi.fn(async () => undefined),
    applyBlockProxy: vi.fn(async () => undefined),
    resetProxy: vi.fn(async () => undefined),
    scheduleRetry: vi.fn(async () => undefined),
    cancelRetry: vi.fn(async () => undefined),
    showConnected: vi.fn(async () => undefined),
    showFailure: vi.fn(async () => undefined),
    showDisconnected: vi.fn(async () => undefined),
    now: vi.fn(() => 1_000_000),
    random: vi.fn(() => 0.5),
  };
  return { deps, runtime: createProxyFailoverRuntime(deps), state: () => state };
}

describe('proxy failover selector', () => {
  it('requires three successful probes and chooses the lowest median', async () => {
    const values = new Map([
      ['a', [30, 10, 20]],
      ['b', [8, 9, 10]],
      ['broken', [1, null, 1]],
    ]);
    const positions = new Map<string, number>();
    const selected = await selectLowestMedian(
      [candidate('a'), candidate('broken', 100), candidate('b')],
      async (item) => {
        const position = positions.get(item.id) || 0;
        positions.set(item.id, position + 1);
        return values.get(item.id)?.[position] ?? null;
      },
      2,
    );
    expect(selected?.id).toBe('b');
  });

  it('uses priority and stable id only to break equal RTT medians', async () => {
    const selected = await selectLowestMedian(
      [candidate('a', 1), candidate('b', 2)],
      async () => 10,
    );
    expect(selected?.id).toBe('b');
  });

  it('keeps jitter within ±20 percent at every capped backoff step', () => {
    expect(retryDelayMs(0, 0)).toBe(4_000);
    expect(retryDelayMs(0, 1)).toBe(6_000);
    expect(retryDelayMs(99, 0)).toBe(48_000);
    expect(retryDelayMs(99, 1)).toBe(72_000);
  });

  it('accepts only an exact HTTPS health endpoint and status 204', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    let clock = 10;
    await expect(probeCandidateHTTPS(candidate('edge'), fetcher as typeof fetch, () => (clock += 5))).resolves.toBe(5);
    expect(fetcher).toHaveBeenCalledWith(
      'https://edge.example/.well-known/midorivpn/edge-health',
      expect.objectContaining({ method: 'HEAD', cache: 'no-store', credentials: 'omit', redirect: 'error' }),
    );
    await expect(probeCandidateHTTPS({ ...candidate('edge'), probe_url: 'http://edge.example/.well-known/midorivpn/edge-health' }, fetcher as typeof fetch)).resolves.toBeNull();
    await expect(probeCandidateHTTPS({ ...candidate('edge'), probe_url: 'https://edge.example/health' }, fetcher as typeof fetch)).resolves.toBeNull();
  });
});

describe('proxy failover lifecycle', () => {
  it('connects automatically to the lowest RTT candidate and persists it', async () => {
    const { runtime, deps, state } = harness();
    await expect(runtime.connect()).resolves.toBe(true);
    expect(state()).toMatchObject({ enabled: true, phase: 'connected', retryAttempt: 0 });
    expect(state().activeServer?.id).toBe('fast');
    expect(deps.getScopedCredential).toHaveBeenCalledWith('fast');
    expect(deps.applyProxy).toHaveBeenCalledWith({ scheme: 'https', host: 'fast.example', port: 443 });
    expect(deps.updateProbeBypass).toHaveBeenLastCalledWith([]);
  });

  it('keeps manual mode pinned even when another server is faster', async () => {
    const { runtime, state } = harness({ selectionMode: 'manual', manualServerId: 'slow' });
    await runtime.connect();
    expect(state().activeServer?.id).toBe('slow');
  });

  it('fails closed and schedules durable retry when no candidate is reachable', async () => {
    const { runtime, deps, state } = harness();
    deps.probe.mockResolvedValue(null);
    await expect(runtime.connect()).resolves.toBe(false);
    expect(deps.applyBlockProxy).toHaveBeenCalledTimes(3);
    expect(deps.updateProbeBypass).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'fast' }),
      expect.objectContaining({ id: 'slow' }),
    ]));
    expect(deps.scheduleRetry).toHaveBeenCalledWith(1_005_000);
    expect(state()).toMatchObject({ enabled: true, phase: 'retrying', retryAttempt: 1, lastError: 'no_reachable_proxy_server' });
  });

  it('does not claim protection when Chromium cannot install the blocking route', async () => {
    const { runtime, deps, state } = harness();
    deps.applyBlockProxy.mockRejectedValue(new Error('policy denied'));
    await expect(runtime.connect()).resolves.toBe(false);
    expect(state()).toMatchObject({ enabled: false, phase: 'off', lastError: 'proxy_block_failed' });
    expect(deps.listAutomaticCandidates).not.toHaveBeenCalled();
  });

  it('turns credential errors into fail-closed retries instead of rejecting recovery', async () => {
    const { runtime, deps, state } = harness();
    deps.getScopedCredential.mockRejectedValue(new Error('control offline'));
    await expect(runtime.connect()).resolves.toBe(false);
    expect(state()).toMatchObject({ enabled: true, phase: 'retrying', lastError: 'proxy_credential_unavailable' });
    expect(deps.scheduleRetry).toHaveBeenCalled();
  });

  it('switches only after three proxy failures and excludes the failed automatic edge', async () => {
    const { runtime, deps, state } = harness({ enabled: true, phase: 'connected', activeServer: candidate('fast') });
    await expect(runtime.noteProxyFailure()).resolves.toBe(false);
    await expect(runtime.noteProxyFailure()).resolves.toBe(false);
    await expect(runtime.noteProxyFailure()).resolves.toBe(true);
    expect(deps.applyBlockProxy).toHaveBeenCalledTimes(2);
    expect(state().activeServer?.id).toBe('slow');
  });

  it('does not combine isolated proxy errors into the three-failure threshold', async () => {
    const { runtime, deps, state } = harness({ enabled: true, phase: 'connected', activeServer: candidate('fast') });
    deps.now.mockReturnValueOnce(1_000_000).mockReturnValueOnce(1_020_000).mockReturnValueOnce(1_040_000);
    await runtime.noteProxyFailure();
    await runtime.noteProxyFailure();
    await runtime.noteProxyFailure();
    expect(state()).toMatchObject({ phase: 'connected', consecutiveFailures: 1 });
    expect(deps.listAutomaticCandidates).not.toHaveBeenCalled();
  });

  it('restores persisted enabled state in a fresh worker and disconnect cancels retry', async () => {
    const shared = harness({ enabled: true, phase: 'connecting', retryAttempt: 2 });
    const freshWorker = createProxyFailoverRuntime(shared.deps);
    await expect(freshWorker.restore()).resolves.toBe(true);
    expect(shared.state().phase).toBe('connected');
    await freshWorker.disconnect();
    expect(shared.state()).toMatchObject({ enabled: false, phase: 'off', retryAttempt: 0 });
    expect(shared.deps.cancelRetry).toHaveBeenCalled();
    expect(shared.deps.resetProxy).toHaveBeenCalledOnce();
    expect(shared.deps.showDisconnected).toHaveBeenCalledOnce();
  });

  it('preserves the pending backoff across a service-worker restart', async () => {
    const shared = harness({ enabled: true, phase: 'retrying', retryAttempt: 2, nextRetryAt: 1_030_000 });
    const freshWorker = createProxyFailoverRuntime(shared.deps);
    await expect(freshWorker.restore()).resolves.toBe(false);
    expect(shared.deps.listAutomaticCandidates).not.toHaveBeenCalled();
    expect(shared.deps.applyBlockProxy).toHaveBeenCalledOnce();
    expect(shared.deps.scheduleRetry).toHaveBeenCalledWith(1_030_000);
    expect(shared.state().phase).toBe('retrying');
  });

  it('persists a manual selection across worker instances', async () => {
    const shared = harness();
    await shared.runtime.setSelection('manual', 'slow');
    const freshWorker = createProxyFailoverRuntime(shared.deps);
    await freshWorker.connect();
    expect(shared.state()).toMatchObject({ selectionMode: 'manual', manualServerId: 'slow' });
    expect(shared.state().activeServer?.id).toBe('slow');
  });

  it('lets a new manual selection supersede an in-flight automatic recovery', async () => {
    const shared = harness();
    let release!: (value: string) => void;
    shared.deps.getScopedCredential
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValue('opaque');
    const automatic = shared.runtime.connect();
    await vi.waitFor(() => expect(shared.deps.getScopedCredential).toHaveBeenCalledWith('fast'));
    const manual = shared.runtime.setSelection('manual', 'slow');
    release('stale-credential');
    await expect(automatic).resolves.toBe(false);
    await expect(manual).resolves.toBe(true);
    expect(shared.state()).toMatchObject({ selectionMode: 'manual', manualServerId: 'slow', phase: 'connected' });
    expect(shared.state().activeServer?.id).toBe('slow');
  });

  it('does not resurrect a proxy after disconnect wins an in-flight recovery', async () => {
    const shared = harness();
    let release!: (value: string) => void;
    shared.deps.getScopedCredential.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const connecting = shared.runtime.connect();
    await vi.waitFor(() => expect(shared.deps.getScopedCredential).toHaveBeenCalledOnce());
    await shared.runtime.disconnect();
    release('stale-credential');
    await expect(connecting).resolves.toBe(false);
    expect(shared.state()).toMatchObject({ enabled: false, phase: 'off' });
    expect(shared.deps.applyProxy).not.toHaveBeenCalled();
  });
});
