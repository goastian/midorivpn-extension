import badge from '../utils/badge.js';
import { handleProxy, debugProxyState } from '../utils/proxy';
import { api, ensureValidAccessToken, refreshAccessToken, getRefreshAlarmTimestamp, clearTokens } from '../lib/api';
import serverManager from '../service/servers.js';
import user from '../service/User.js';
import Token from '../utils/token.ts';
import { REDIRECT_URI } from '../utils/authentification';
import log from '../utils/logger.js';
import { hasRequiredVpnPermissions, openPermissionsPage } from '../utils/permissions.js';

// Expose debug helper on globalThis so it can be called from the background
// inspector console: await debugProxy()
// Only exposed in non-production builds to avoid leaking internal state.
if (process.env.NODE_ENV !== 'production') {
  globalThis.debugProxy = debugProxyState;
}

const TOKEN_REFRESH_ALARM = 'auth-token-refresh';
const REQUIRE_ALL_URLS_PERMISSION = process.env.REQUIRE_ALL_URLS_PERMISSION !== 'false';
// Throttle how often we force a token refresh in response to a 407 so a burst
// of rejections does not hammer Authentik.
const PROXY_REFRESH_MIN_INTERVAL_MS = 15 * 1000;
let lastProxyTriggeredRefresh = 0;

async function markSessionExpired() {
  try {
    await clearTokens();
  } catch (_) {
    // ignore
  }
  try {
    // Flip the user-facing "connected" toggle off so handleProxy routes direct
    // and the popup no longer lies about being connected.
    const { store } = await new Promise((resolve) =>
      chrome.storage.local.get(['store'], resolve)
    );
    if (store?.state) {
      await chrome.storage.local.set({ store: { ...store, state: false } });
    }
  } catch (_) {
    // ignore
  }
  try {
    if (chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#E67B7B' });
    }
  } catch (_) {
    // ignore
  }
}

async function turnOffVpnForMissingPermissions() {
  try {
    const { store } = await new Promise((resolve) =>
      chrome.storage.local.get(['store'], resolve)
    );
    if (store?.state) {
      await chrome.storage.local.set({ store: { ...store, state: false } });
    }
  } catch (_) {
    // ignore
  }
  try {
    if (chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#E67B7B' });
    }
  } catch (_) {
    // ignore
  }
}

async function ensureRequiredVpnPermissions({ openPage = !REQUIRE_ALL_URLS_PERMISSION } = {}) {
  const granted = await hasRequiredVpnPermissions();
  if (granted) return true;

  await turnOffVpnForMissingPermissions();
  if (openPage) {
    await openPermissionsPage();
  }
  return false;
}

async function clearRefreshAlarm() {
  if (!chrome.alarms?.clear) return;
  await chrome.alarms.clear(TOKEN_REFRESH_ALARM);
}

async function scheduleTokenRefresh() {
  if (!chrome.alarms?.create) return;

  const alarmAt = await getRefreshAlarmTimestamp();
  if (!alarmAt) {
    await clearRefreshAlarm();
    return;
  }

  const now = Date.now();
  if (alarmAt <= now) {
    await ensureValidAccessToken();
    return scheduleTokenRefresh();
  }

  chrome.alarms.create(TOKEN_REFRESH_ALARM, { when: alarmAt });
}

async function syncTokenSession(forceRefresh = false) {
  const token = await ensureValidAccessToken(forceRefresh);
  await scheduleTokenRefresh();
  // If we have no access token left (refresh failed definitively) but the
  // user still thinks they are connected, flip the VPN off so traffic stops
  // silently leaking through "direct" and the popup shows the real state.
  if (!token) {
    await markSessionExpired();
  }
  return token;
}

const handlers = {
  loadServers: async () => {
    return serverManager.loadServers();
  },
  loadUser: async () => {
    return user.LoadUser();
  },
  provisionConnection: async (msg) => {
    const serverId = msg.serverId;
    if (!serverId) throw new Error('No server selected');

    const { server } = await new Promise((resolve) =>
      chrome.storage.local.get(['server'], resolve)
    );
    const active = server?.active;
    if (!active || active.id !== serverId) {
      throw new Error('Selected server is not active');
    }
    if (active.supports_proxy === false || !active.proxy_port) {
      throw new Error('Selected server does not support browser proxy mode');
    }

    const token = await ensureValidAccessToken();
    if (!token) throw new Error('Login session expired');

    await chrome.storage.local.set({ connection: null });
    return {
      id: null,
      server_id: serverId,
      mode: 'proxy',
      proxy_port: active.proxy_port,
    };
  },
};

badge();

log.info('boot', 'background loaded, initializing token session');
ensureRequiredVpnPermissions().catch((error) => {
  log.warn('permissions', 'Failed to check required VPN permissions on boot:', error?.message || error);
});
syncTokenSession().then(() => {
}).catch((error) => {
  log.error('boot', 'Failed to initialize token session:', error);
});

// Listener registration is guarded because `browser.proxy`, `browser.webRequest`
// and `browser.webNavigation` come from optional_permissions. Until the user
// grants them via the welcome page, those APIs are `undefined`. Registering
// blindly at module load would throw a TypeError and kill the background
// service worker — which would also kill the OAuth callback handler below,
// making login impossible. Instead, we register lazily and re-register on
// `permissions.onAdded` so the background keeps working in any state.
const proxyAuthHandler = async (details) => {
  if (!details.isProxy) return {};
  log.warn('auth', '407 from proxy for', details.url, '- refreshing token and retrying');

  try {
    // Throttle force-refresh so a burst of 407s does not hammer Authentik.
    const now = Date.now();
    let token;
    if (now - lastProxyTriggeredRefresh > PROXY_REFRESH_MIN_INTERVAL_MS) {
      lastProxyTriggeredRefresh = now;
      token = await refreshAccessToken();
      log.info('auth', 'forced refresh after 407 OK, retrying with new token');
      scheduleTokenRefresh().catch(() => { });
    } else {
      // Within the throttle window — reuse whatever we have.
      token = await ensureValidAccessToken();
    }

    if (!token) {
      log.warn('auth', 'no token available after 407, cancelling');
      await markSessionExpired();
      return { cancel: true };
    }

    return {
      authCredentials: {
        username: 'midorivpn',
        password: token,
      },
    };
  } catch (err) {
    log.warn('auth', 'refresh after 407 failed:', err?.message || err);
    if (err && err.shouldClear) {
      await markSessionExpired();
    }
    return { cancel: true };
  }
};

const proxyErrorHandler = (error) => {
  log.error('proxy-error', error);
};

const oauthNavigationHandler = async (details) => {
  if (details.frameId !== 0) return;

  const redirectUri = REDIRECT_URI;
  if (!redirectUri) return;

  try {
    const callbackURL = new URL(details.url);
    const expectedURL = new URL(redirectUri);
    if (callbackURL.origin === expectedURL.origin && callbackURL.pathname === expectedURL.pathname) {
      const token = new Token();
      const success = await token.exchangeCode(details.url);
      if (success) {
        await syncTokenSession();
        chrome.tabs.remove(details.tabId);
      }
    }
  } catch (_) { /* invalid URL — ignore */ }
};

let proxyListenersRegistered = false;
let webRequestListenersRegistered = false;
let webNavigationListenerRegistered = false;

function registerProxyListeners() {
  if (proxyListenersRegistered) return;
  try {
    if (!browser?.proxy?.onRequest?.addListener) {
      log.warn('boot', 'browser.proxy unavailable — skipping proxy listener registration');
      return;
    }
    browser.proxy.onRequest.addListener(handleProxy, { urls: ['<all_urls>'] });
    browser.proxy.onError.addListener(proxyErrorHandler);
    proxyListenersRegistered = true;
    log.info('boot', 'proxy listeners registered');
  } catch (err) {
    log.warn('boot', 'failed to register proxy listeners:', err?.message || err);
  }
}

function registerWebRequestListeners() {
  if (webRequestListenersRegistered) return;
  try {
    if (!browser?.webRequest?.onAuthRequired?.addListener) {
      log.warn('boot', 'browser.webRequest unavailable — skipping onAuthRequired registration');
      return;
    }
    browser.webRequest.onAuthRequired.addListener(
      proxyAuthHandler,
      { urls: ['<all_urls>'] },
      ['blocking']
    );
    webRequestListenersRegistered = true;
    log.info('boot', 'webRequest.onAuthRequired registered');
  } catch (err) {
    log.warn('boot', 'failed to register webRequest listener:', err?.message || err);
  }
}

function registerWebNavigationListener() {
  if (webNavigationListenerRegistered) return;
  try {
    if (!chrome?.webNavigation?.onCommitted?.addListener) {
      log.warn('boot', 'chrome.webNavigation unavailable — OAuth callback detection disabled until permissions granted');
      return;
    }
    chrome.webNavigation.onCommitted.addListener(oauthNavigationHandler);
    webNavigationListenerRegistered = true;
    log.info('boot', 'webNavigation.onCommitted registered');
  } catch (err) {
    log.warn('boot', 'failed to register webNavigation listener:', err?.message || err);
  }
}

function registerAllListeners() {
  registerProxyListeners();
  registerWebRequestListeners();
  registerWebNavigationListener();
}

registerAllListeners();

// Re-register when the user grants the optional permissions via the welcome
// page. Firefox/Chrome fire `permissions.onAdded` after a successful
// chrome.permissions.request().
if (chrome.permissions?.onAdded?.addListener) {
  chrome.permissions.onAdded.addListener(() => {
    log.info('boot', 'permissions added — registering missing listeners');
    registerAllListeners();
  });
}

if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    ensureRequiredVpnPermissions().catch((error) => {
      log.warn('permissions', 'Failed to check required VPN permissions on startup:', error?.message || error);
    });
    syncTokenSession().then(() => {
    }).catch((error) => {
      log.error('boot', 'Failed to restore token session on startup:', error);
    });
  });
}

if (chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    // On first install: open the welcome/permissions page so the user can
    // explicitly grant <all_urls> host access (Firefox MV3 defaults to
    // "Only When Clicked" without this step).
    if (details.reason === 'install') {
      ensureRequiredVpnPermissions().catch((error) => {
        log.warn('permissions', 'Failed to check required VPN permissions after install:', error?.message || error);
      });
    } else {
      ensureRequiredVpnPermissions().catch((error) => {
        log.warn('permissions', 'Failed to check required VPN permissions after update:', error?.message || error);
      });
    }
    syncTokenSession().catch((error) => {
      log.error('boot', 'Failed to sync token session after install/update:', error);
    });
  });
}

if (chrome.permissions?.onRemoved) {
  chrome.permissions.onRemoved.addListener((removed) => {
    if (!removed?.origins?.includes('<all_urls>')) return;
    log.warn('permissions', '<all_urls> permission removed; turning VPN off');
    turnOffVpnForMissingPermissions()
      .then(() => openPermissionsPage())
      .catch((error) => {
        log.warn('permissions', 'Failed to handle removed VPN permission:', error?.message || error);
      });
  });
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== TOKEN_REFRESH_ALARM) return;
    log.info('alarm', 'token refresh alarm fired');
    syncTokenSession(true).catch((error) => {
      log.error('alarm', 'Scheduled token refresh failed:', error);
    });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!changes.access_token && !changes.refresh_token && !changes.token_expires_at) return;

  scheduleTokenRefresh().catch((error) => {
    log.error('alarm', 'Failed to reschedule token refresh:', error);
  });

});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return;

  const ALLOWED_TYPES = new Set(Object.keys(handlers));
  if (!msg?.type || !ALLOWED_TYPES.has(msg.type)) {
    sendResponse({ success: false, error: 'Unknown command' });
    return;
  }

  const handler = handlers[msg.type];
  Promise.resolve(handler(msg, sender))
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error) =>
      sendResponse({ success: false, error: error.message || 'An unexpected error occurred' })
    );
  return true;
});


