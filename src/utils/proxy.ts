import { getProxyScopedToken } from '../lib/api';
import { createBrowserRuntimeAdapter } from '../runtime/browser-adapter';
import log from './logger';
import { hasRequiredVpnPermissions } from './permissions';
import {
  resolveProxyServer,
  buildBypassDomains,
  type ActiveServer,
} from './proxy-routing';

const staticBypassDomains = buildBypassDomains({
  apiUrl: process.env.API_URL || '',
  authentikIssuer: process.env.AUTHENTIK_ISSUER || '',
});
let probeBypassDomains: string[] = [];

export function setProbeBypassURLs(values: string[]): void {
  probeBypassDomains = [...new Set(values.flatMap((value) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' || parsed.pathname !== '/.well-known/midorivpn/edge-health' ||
          parsed.username || parsed.password || parsed.search || parsed.hash) return [];
      return [parsed.hostname];
    } catch {
      return [];
    }
  }))];
}

export function currentBypassDomains(): string[] {
  return [...new Set([...staticBypassDomains, ...probeBypassDomains])];
}

interface ExtensionStorage {
  store?: { state?: boolean };
  server?: { active?: ActiveServer & Record<string, unknown> };
  access_token_enc?: unknown;
}

export interface ProxyDecision {
  type: 'direct' | 'https';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  proxyAuthorizationHeader?: string;
}

const getLocalStorage = (keys: string[]): Promise<ExtensionStorage> =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, (storage) => resolve((storage || {}) as ExtensionStorage));
  });

const blockProxyRequest = (): ProxyDecision => ({ type: 'https', host: '127.0.0.1', port: 1 });

export const handleProxy = async (details: { url: string }): Promise<ProxyDecision> => {
  try {
    const hostname = new URL(details.url).hostname;
    if (currentBypassDomains().includes(hostname)) return { type: 'direct' };

    const storage = await getLocalStorage(['store', 'server']);
    if (!storage.store?.state) return { type: 'direct' };
    if (!(await hasRequiredVpnPermissions())) {
      log.warn('proxy', 'Required browser permissions are unavailable; blocking request');
      return blockProxyRequest();
    }

    const proxyServer = resolveProxyServer(storage.server?.active);
    if (!proxyServer) {
      log.warn('proxy', 'No secure proxy server is configured');
      return blockProxyRequest();
    }

    let token: string | null = null;
    for (let attempt = 0; attempt < 4 && !token; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        token = await getProxyScopedToken();
      } catch {
        // A short credential refresh may overlap several proxy requests.
      }
    }
    if (!token) {
      log.warn('proxy', 'Scoped proxy credentials are unavailable; blocking request');
      return blockProxyRequest();
    }

    return {
      type: 'https',
      host: proxyServer.host,
      port: proxyServer.port,
      username: 'midorivpn',
      password: token,
      proxyAuthorizationHeader: `Bearer ${token}`,
    };
  } catch {
    log.error('proxy', 'Unable to resolve proxy route');
    return blockProxyRequest();
  }
};

export const debugProxyState = async (): Promise<Record<string, unknown>> => {
  const storage = await getLocalStorage(['store', 'server', 'access_token_enc']);
  const report = {
    vpnToggle: storage.store?.state === true,
    hasSelectedServer: Boolean(storage.server?.active),
    hasResolvedProxy: Boolean(resolveProxyServer(storage.server?.active)),
    hasAccessToken: Boolean(storage.access_token_enc),
    hasAllRequiredPermissions: await hasRequiredVpnPermissions(),
  };
  log.warn('proxy', 'debug state', report);
  return report;
};

export const applyBlockedProxy = async (): Promise<void> => {
  await createBrowserRuntimeAdapter().applyProxy(
    { scheme: 'https', host: '127.0.0.1', port: 1 },
    currentBypassDomains(),
  );
};
