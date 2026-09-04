import browser from 'webextension-polyfill';
import badge from '../utils/badge';
import { handleProxy, debugProxyState, enableProxy, disableProxy } from '../utils/proxy';
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
import { resolveProxyServer, type ActiveServer } from '../utils/proxy-routing';
import { createProxyAuthenticationHandler } from '../utils/proxy-auth-listener';
import { getMidoriPrivacyStatus, isTrustedMidoriPrivacyRequest } from '../utils/privacy-status';
import { createBrowserRuntimeAdapter } from '../runtime/browser-adapter';
import { createOAuthRuntime } from '../runtime/auth-runtime';
import { createProxyRuntime, type AuthSessionState } from '../runtime/proxy-runtime';

if (process.env.NODE_ENV !== 'production') {
  (globalThis as typeof globalThis & { debugProxy?: typeof debugProxyState }).debugProxy = debugProxyState;
}

const TOKEN_REFRESH_ALARM = 'auth-token-refresh';
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

const proxyRuntime = createProxyRuntime({
  synchronizeAuthSession,
  isVpnEnabled: async () => (await readLocalStore()).state === true,
  getScopedCredential: getProxyScopedToken,
  hasRequiredPermissions: hasRequiredVpnPermissions,
  enableProxy,
  disableProxy,
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
  activeServer?: ActiveServer & { id?: string };
};

const handlers: Record<string, (message: BackgroundMessage) => Promise<unknown>> = {
  loadServers: async () => serverManager.loadServers(),
  loadUser: async () => user.loadUser(),
  provisionConnection: async (message) => {
    const serverId = message.serverId;
    const active = message.activeServer;
    if (!serverId) throw new Error('No server selected');
    if (!active || active.id !== serverId) throw new Error('Selected server is not active');
    const proxyEndpoint = resolveProxyServer(active);
    if (!proxyEndpoint) throw new Error('Selected server does not support browser proxy mode');
    if (!(await ensureValidAccessToken())) throw new Error('Login session expired');
    return { id: null, server_id: serverId, mode: 'proxy', proxy_endpoint: proxyEndpoint };
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
  onUnavailable: proxyRuntime.turnOffVpn,
});
const proxyErrorHandler = (error: unknown) => log.error('proxy-error', error);

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
