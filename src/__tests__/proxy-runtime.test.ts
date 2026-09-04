import { describe, expect, it, vi } from 'vitest';
import { createProxyRuntime, type AuthSessionState } from '../runtime/proxy-runtime';

function dependencies(session: AuthSessionState = 'ready') {
  return {
    synchronizeAuthSession: vi.fn(async () => session),
    isVpnEnabled: vi.fn(async () => true),
    getScopedCredential: vi.fn(async () => 'opaque-regional-credential'),
    hasRequiredPermissions: vi.fn(async () => true),
    enableProxy: vi.fn(async () => true),
    disableProxy: vi.fn(async () => true),
    persistVpnDisabled: vi.fn(async () => undefined),
    showFailureBadge: vi.fn(async () => undefined),
  };
}

describe('proxy service-worker lifecycle', () => {
  it('restores an enabled proxy after each fresh service-worker instance', async () => {
    const deps = dependencies();
    await createProxyRuntime(deps).restoreProxySession();
    await createProxyRuntime(deps).restoreProxySession();

    expect(deps.synchronizeAuthSession).toHaveBeenCalledTimes(2);
    expect(deps.getScopedCredential).toHaveBeenCalledTimes(2);
    expect(deps.enableProxy).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent restoration inside one worker instance', async () => {
    let finish!: (value: AuthSessionState) => void;
    const deps = dependencies();
    deps.synchronizeAuthSession = vi.fn(() =>
      new Promise<AuthSessionState>((resolve) => { finish = resolve; }));
    const runtime = createProxyRuntime(deps);

    const first = runtime.restoreProxySession();
    const duplicate = runtime.restoreProxySession();
    finish('ready');
    await Promise.all([first, duplicate]);
    expect(deps.synchronizeAuthSession).toHaveBeenCalledOnce();
    expect(deps.enableProxy).toHaveBeenCalledOnce();
  });

  it('turns the VPN off when token revocation makes the session definitive', async () => {
    const deps = dependencies('revoked');
    await createProxyRuntime(deps).restoreProxySession();
    expect(deps.disableProxy).toHaveBeenCalledOnce();
    expect(deps.persistVpnDisabled).toHaveBeenCalledOnce();
    expect(deps.showFailureBadge).toHaveBeenCalledOnce();
    expect(deps.enableProxy).not.toHaveBeenCalled();
  });

  it('does not show a failure on ordinary logged-out startup', async () => {
    const deps = dependencies('anonymous');
    deps.isVpnEnabled.mockResolvedValue(false);
    await createProxyRuntime(deps).restoreProxySession();
    expect(deps.disableProxy).not.toHaveBeenCalled();
    expect(deps.showFailureBadge).not.toHaveBeenCalled();
  });

  it('fails closed when any required API permission is revoked', async () => {
    const deps = dependencies();
    const runtime = createProxyRuntime(deps);
    await expect(runtime.handlePermissionRemoval({ permissions: ['proxy'] })).resolves.toBe(true);
    expect(deps.disableProxy).toHaveBeenCalledOnce();
    expect(deps.persistVpnDisabled).toHaveBeenCalledOnce();
  });

  it('ignores unrelated permission changes', async () => {
    const deps = dependencies();
    const runtime = createProxyRuntime(deps);
    await expect(runtime.handlePermissionRemoval({ permissions: ['notifications'] })).resolves.toBe(false);
    expect(deps.disableProxy).not.toHaveBeenCalled();
  });
});
