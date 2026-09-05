import browser from 'webextension-polyfill';
import badge, { disableBadge, enableBadge } from '../utils/badge';
import {
  handleProxy,
  debugProxyState,
  applyBlockedProxy,
  currentBypassDomains,
  setProbeBypassURLs,
} from '../utils/proxy';
import {
  clearTokens,
  ensureValidAccessToken,
  getNextRefreshAttemptTimestamp,
  getProxyScopedToken,
  getRefreshAlarmTimestamp,
  getTokens,
  invalidateProxyScopedToken,
} from '../lib/api';
import { exchangeCode } from '../lib/oauth';
import serverManager from '../service/servers';
import user from '../service/user';
import { REDIRECT_URI } from '../utils/authentification';
import log from '../utils/logger';
import { hasRequiredVpnPermissions } from '../utils/permissions';
import { createProxyAuthenticationHandler } from '../utils/proxy-auth-listener';
import { getMidoriPrivacyStatus, isTrustedMidoriPrivacyRequest } from '../utils/privacy-status';
import { createBrowserRuntimeAdapter } from '../runtime/browser-adapter';
import { createOAuthRuntime } from '../runtime/auth-runtime';
import { createProxyRuntime, type AuthSessionState } from '../runtime/proxy-runtime';
import {
  createProxyFailoverRuntime,
  defaultProxyFailoverState,
  probeCandidateHTTPS,
  type ProxyCandidate,
  type ProxyFailoverState,
  type ProxySelectionMode,
} from '../runtime/proxy-failover';

if (process.env.NODE_ENV !== 'production') {
  (globalThis as typeof globalThis & { debugProxy?: typeof debugProxyState }).debugProxy = debugProxyState;
}

const TOKEN_REFRESH_ALARM = 'auth-token-refresh';
const PROXY_FAILOVER_ALARM = 'proxy-failover-retry';
const PROXY_FAILOVER_STORAGE_KEY = 'midori_proxy_failover_v1';
const browserAdapter = createBrowserRuntimeAdapter(
  process.env.BROWSER,
  chrome,
  browser as unknown as Parameters<typeof createBrowserRuntimeAdapter>[2],
);

async function clearRefreshAlarm(): Promise<void> {
  if (chrome.alarms?.clear) await chrome.alarms.clear(TOKEN_REFRESH_ALARM);
}

async function scheduleTokenRefresh(): Promise<void> {
  if (!chrome.alarms?.create) return;
  const alarmAt = await getRefreshAlarmTimestamp();
  if (!alarmAt) {
    await clearRefreshAlarm();
    return;
  }

  if (alarmAt <= Date.now()) {
    const token = await ensureValidAccessToken();
    const retryAt = getNextRefreshAttemptTimestamp();
    if (retryAt && retryAt > Date.now()) {
      chrome.alarms.create(TOKEN_REFRESH_ALARM, { when: retryAt });
      return;
    }
    if (!token) {
      await clearRefreshAlarm();
      return;
    }
    await scheduleTokenRefresh();
    return;
  }
  chrome.alarms.create(TOKEN_REFRESH_ALARM, { when: alarmAt });
}

async function synchronizeAuthSession(forceRefresh = false): Promise<AuthSessionState> {
  const storedSession = await getTokens();
  const hadSession = Boolean(storedSession.access_token || storedSession.refresh_token);
  const token = await ensureValidAccessToken(forceRefresh);
  await scheduleTokenRefresh();
  if (token) return 'ready';
  if (getNextRefreshAttemptTimestamp()) return 'retrying';
  if (!hadSession) return 'anonymous';
  await clearTokens();
  return 'revoked';
}

function readLocalStore(): Promise<{ state?: boolean }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['store'], ({ store }) => resolve(store || {}));
  });
}

async function persistVpnDisabled(): Promise<void> {
  const store = await readLocalStore();
  if (store.state) await chrome.storage.local.set({ store: { ...store, state: false } });
}

async function showFailureBadge(): Promise<void> {
  if (!chrome.action?.setBadgeText) return;
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#E67B7B' });
}

type StoredProxySelection = {
  selectionMode?: ProxySelectionMode;
  manualServerId?: string;
};

function readStorage(keys: string[]): Promise<Record<string, any>> {
  return new Promise((resolve) => chrome.storage.local.get(keys, (value) => resolve(value || {})));
}

function finiteInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Number.isInteger(value) ? Math.min(Math.max(value as number, minimum), maximum) : fallback;
}

function storedProxyCandidate(value: unknown): ProxyCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ProxyCandidate>;
  if (typeof candidate.id !== 'string' || !candidate.id || candidate.protocol !== 'proxy' ||
      typeof candidate.endpoint !== 'string' || !candidate.endpoint ||
      !Number.isInteger(candidate.port) || (candidate.port as number) < 1 || (candidate.port as number) > 65535 ||
      !Array.isArray(candidate.transports)) return null;
  try {
    const probe = new URL(candidate.probe_url || '');
    if (probe.protocol !== 'https:' || probe.pathname !== '/.well-known/midorivpn/edge-health' ||
        probe.username || probe.password || probe.search || probe.hash) return null;
  } catch {
    return null;
  }
  return candidate as ProxyCandidate;
}

async function readProxyFailoverState(): Promise<ProxyFailoverState> {
  const stored = await readStorage(['store', 'server', PROXY_FAILOVER_STORAGE_KEY]);
  const defaults = defaultProxyFailoverState();
  const metadata = stored[PROXY_FAILOVER_STORAGE_KEY] || {};
  const selection = (stored.server || {}) as StoredProxySelection;
  const selectionMode = selection.selectionMode === 'manual' ? 'manual' : 'automatic';
  const phase = ['off', 'connecting', 'connected', 'retrying'].includes(metadata.phase)
    ? metadata.phase
    : defaults.phase;
  const activeServer = Object.hasOwn(metadata, 'activeServer')
    ? storedProxyCandidate(metadata.activeServer)
    : null;
  return {
    ...defaults,
    enabled: stored.store?.state === true,
    selectionMode,
    manualServerId: selectionMode === 'manual' && typeof selection.manualServerId === 'string'
      ? selection.manualServerId
      : '',
    activeServer,
    phase,
    retryAttempt: finiteInteger(metadata.retryAttempt, 0, 0, 5),
    nextRetryAt: finiteInteger(metadata.nextRetryAt, 0, 0, Number.MAX_SAFE_INTEGER),
    consecutiveFailures: finiteInteger(metadata.consecutiveFailures, 0, 0, 2),
    lastFailureAt: finiteInteger(metadata.lastFailureAt, 0, 0, Number.MAX_SAFE_INTEGER),
    lastError: typeof metadata.lastError === 'string' ? metadata.lastError.slice(0, 128) : '',
  };
}

async function writeProxyFailoverState(state: ProxyFailoverState): Promise<void> {
  const stored = await readStorage(['store', 'server']);
  await chrome.storage.local.set({
    store: { ...(stored.store || {}), state: state.enabled },
    server: {
      ...(stored.server || {}),
      active: state.activeServer,
      selectionMode: state.selectionMode,
      manualServerId: state.manualServerId,
    },
    [PROXY_FAILOVER_STORAGE_KEY]: state,
  });
}

const failoverAdapter = createBrowserRuntimeAdapter(
  process.env.BROWSER,
  chrome,
  browser as unknown as Parameters<typeof createBrowserRuntimeAdapter>[2],
);

const proxyFailover = createProxyFailoverRuntime({
  readState: readProxyFailoverState,
  writeState: writeProxyFailoverState,
  listAutomaticCandidates: () => serverManager.loadProxyCandidates(),
  getManualCandidate: (serverId) => serverManager.getManualCandidate(serverId),
  probe: probeCandidateHTTPS,
  updateProbeBypass: async (candidates) => setProbeBypassURLs(candidates.map((candidate) => candidate.probe_url)),
  getScopedCredential: getProxyScopedToken,
  invalidateScopedCredential: invalidateProxyScopedToken,
  applyProxy: (proxy) => failoverAdapter.applyProxy(proxy, currentBypassDomains()),
  applyBlockProxy: applyBlockedProxy,
  resetProxy: () => failoverAdapter.resetProxy(),
  scheduleRetry: async (when) => {
    if (chrome.alarms?.create) chrome.alarms.create(PROXY_FAILOVER_ALARM, { when });
  },
  cancelRetry: async () => {
    if (chrome.alarms?.clear) await chrome.alarms.clear(PROXY_FAILOVER_ALARM);
  },
  showConnected: enableBadge,
  showFailure: showFailureBadge,
  showDisconnected: async () => disableBadge(),
  now: () => Date.now(),
  random: () => Math.random(),
});

const proxyRuntime = createProxyRuntime({
  synchronizeAuthSession,
  isVpnEnabled: async () => (await readLocalStore()).state === true,
  hasRequiredPermissions: hasRequiredVpnPermissions,
  restoreProxy: proxyFailover.restore,
  disableProxy: async () => {
    await proxyFailover.disconnect();
    return true;
  },
  persistVpnDisabled,
  showFailureBadge,
});

const oauthRuntime = createOAuthRuntime({
  redirectUri: REDIRECT_URI,
  exchangeCode,
  synchronizeSession: async () => {
    const state = await synchronizeAuthSession();
    if (state === 'revoked') await proxyRuntime.turnOffVpn();
  },
  closeTab: async (tabId) => {
    if (chrome.tabs?.remove) await chrome.tabs.remove(tabId);
  },
});

type BackgroundMessage = {
  type?: string;
  serverId?: string;
  selectionMode?: ProxySelectionMode;
};

const handlers: Record<string, (message: BackgroundMessage) => Promise<unknown>> = {
  loadServers: async () => serverManager.loadServers(),
  loadUser: async () => user.loadUser(),
  getProxyFailoverStatus: readProxyFailoverState,
  connectProxy: async () => {
    if (!(await ensureValidAccessToken())) throw new Error('Login session expired');
    if (!(await hasRequiredVpnPermissions())) throw new Error('Missing browser permissions');
    await proxyFailover.connect();
    return readProxyFailoverState();
  },
  disconnectProxy: async () => {
    await proxyFailover.disconnect();
    return readProxyFailoverState();
  },
  setProxySelection: async (message) => {
    if (message.selectionMode !== 'automatic' && message.selectionMode !== 'manual') {
      throw new Error('Invalid proxy selection mode');
    }
    await proxyFailover.setSelection(message.selectionMode, message.serverId || '');
    return readProxyFailoverState();
  },
};

badge();
proxyRuntime.ensureRequiredPermissions().catch((error) => {
  log.warn('permissions', 'Unable to verify required permissions on boot:', error?.message || error);
});
proxyRuntime.restoreProxySession().catch((error) => {
  log.error('boot', 'Unable to restore proxy session:', error?.message || error);
});

const proxyAuthHandler = createProxyAuthenticationHandler({
  getToken: getProxyScopedToken,
  invalidateToken: invalidateProxyScopedToken,
  onUnavailable: async () => { await proxyFailover.noteProxyFailure(); },
});
const proxyErrorHandler = (error: unknown) => {
  log.error('proxy-error', error);
  void proxyFailover.noteProxyFailure().catch((failure) => {
    log.warn('failover', 'Unable to process proxy failure:', failure?.message || failure);
  });
};

let proxyListenersRegistered = false;
let webRequestListenersRegistered = false;
let webNavigationListenerRegistered = false;
let tabListenerRegistered = false;

function registerProxyListeners(): void {
  if (proxyListenersRegistered) return;
  proxyListenersRegistered = browserAdapter.registerProxyRouting(handleProxy, proxyErrorHandler);
  if (!proxyListenersRegistered) log.warn('boot', 'Browser proxy routing API is unavailable');
}

function registerWebRequestListeners(): void {
  if (webRequestListenersRegistered) return;
  webRequestListenersRegistered = browserAdapter.registerProxyAuthentication(proxyAuthHandler);
  if (!webRequestListenersRegistered) log.warn('boot', 'Proxy authentication API is unavailable');
}

function registerWebNavigationListener(): void {
  if (webNavigationListenerRegistered || !chrome.webNavigation?.onCommitted?.addListener) return;
  let filter: chrome.events.UrlFilter[] | undefined;
  try {
    const redirect = new URL(REDIRECT_URI);
    filter = [{
      hostEquals: redirect.hostname,
      pathEquals: redirect.pathname,
      schemes: [redirect.protocol.replace(':', '')],
    }];
  } catch {
    return;
  }
  chrome.webNavigation.onCommitted.addListener(
    (details) => { void oauthRuntime.handleNavigation(details); },
    { url: filter },
  );
  webNavigationListenerRegistered = true;
}

function registerOAuthTabListener(): void {
  if (tabListenerRegistered || !chrome.tabs?.onUpdated?.addListener) return;
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      void oauthRuntime.handleNavigation({ frameId: 0, url: changeInfo.url, tabId });
    }
  });
  tabListenerRegistered = true;
}

function registerAllListeners(): void {
  registerProxyListeners();
  registerWebRequestListeners();
  registerWebNavigationListener();
  registerOAuthTabListener();
}

registerAllListeners();

chrome.permissions?.onAdded?.addListener(() => registerAllListeners());
chrome.permissions?.onRemoved?.addListener((removed) => {
  void proxyRuntime.handlePermissionRemoval(removed).catch((error) => {
    log.warn('permissions', 'Unable to process permission revocation:', error?.message || error);
  });
});

chrome.runtime?.onStartup?.addListener(() => {
  void proxyRuntime.ensureRequiredPermissions();
  void proxyRuntime.restoreProxySession();
});

chrome.runtime?.onInstalled?.addListener(() => {
  void proxyRuntime.ensureRequiredPermissions();
  void proxyRuntime.restoreProxySession();
});

chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === PROXY_FAILOVER_ALARM) {
    void proxyFailover.recover().catch((error) => log.error('failover', 'Scheduled recovery failed:', error));
    return;
  }
  if (alarm.name !== TOKEN_REFRESH_ALARM) return;
  void synchronizeAuthSession(true).then(async (state) => {
    if (state === 'revoked') await proxyRuntime.turnOffVpn();
  }).catch((error) => log.error('alarm', 'Scheduled token refresh failed:', error));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!changes.access_token_enc && !changes.refresh_token_enc && !changes.token_expires_at) return;
  void scheduleTokenRefresh().catch((error) => {
    log.error('alarm', 'Unable to reschedule token refresh:', error);
  });
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (!message?.type || !Object.hasOwn(handlers, message.type)) {
    sendResponse({ success: false, error: 'Unknown command' });
    return false;
  }
  Promise.resolve(handlers[message.type](message))
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error) => {
      log.error('background', 'Message handler failed:', message.type, error?.message || error);
      sendResponse({ success: false, error: error?.message || 'An unexpected error occurred' });
    });
  return true;
});

browser.runtime.onMessageExternal.addListener(async (
  message: unknown,
  sender: { id?: string },
) => {
  if (!isTrustedMidoriPrivacyRequest(message as { action?: string; source?: string }, sender)) return undefined;
  const storage = await browser.storage.local.get(['store']);
  return getMidoriPrivacyStatus(storage);
});
