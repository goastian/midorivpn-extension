import { wasRequiredVpnPermissionRemoved } from '../utils/permissions';

export type AuthSessionState = 'anonymous' | 'ready' | 'retrying' | 'revoked';

interface ProxyRuntimeDependencies {
  synchronizeAuthSession: () => Promise<AuthSessionState>;
  isVpnEnabled: () => Promise<boolean>;
  getScopedCredential: () => Promise<string | null>;
  hasRequiredPermissions: () => Promise<boolean>;
  enableProxy: () => Promise<boolean>;
  disableProxy: () => Promise<boolean>;
  persistVpnDisabled: () => Promise<void>;
  showFailureBadge: () => Promise<void>;
}

export function createProxyRuntime(dependencies: ProxyRuntimeDependencies) {
  let restoration: Promise<void> | null = null;

  const turnOffVpn = async (): Promise<void> => {
    try {
      await dependencies.disableProxy();
    } catch {
      // Visible state must still converge to disabled.
    }
    await Promise.allSettled([
      dependencies.persistVpnDisabled(),
      dependencies.showFailureBadge(),
    ]);
  };

  const ensureRequiredPermissions = async (): Promise<boolean> => {
    const granted = await dependencies.hasRequiredPermissions();
    if (!granted) await turnOffVpn();
    return granted;
  };

  const restoreProxySession = (): Promise<void> => {
    if (restoration) return restoration;
    restoration = (async () => {
      const session = await dependencies.synchronizeAuthSession();
      const vpnEnabled = await dependencies.isVpnEnabled();
      if (!vpnEnabled) return;
      if (session === 'revoked' || session === 'anonymous') {
        await turnOffVpn();
        return;
      }
      if (session === 'retrying') return;

      if (!(await dependencies.hasRequiredPermissions())) {
        await turnOffVpn();
        return;
      }
      const credential = await dependencies.getScopedCredential();
      if (!credential || !(await dependencies.enableProxy())) {
        await turnOffVpn();
      }
    })().finally(() => {
      restoration = null;
    });
    return restoration;
  };

  const handlePermissionRemoval = async (
    removed: { permissions?: string[]; origins?: string[] } | undefined,
  ): Promise<boolean> => {
    if (!wasRequiredVpnPermissionRemoved(removed)) return false;
    await turnOffVpn();
    return true;
  };

  return {
    ensureRequiredPermissions,
    handlePermissionRemoval,
    restoreProxySession,
    turnOffVpn,
  };
}
