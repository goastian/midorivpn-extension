import browser from "webextension-polyfill";
import badge from "../utils/badge.js";
import { handleProxy, debugProxyState, enableProxy, validateProxyReady } from "../utils/proxy";
import {
  ensureValidAccessToken,
  getRefreshAlarmTimestamp,
  getNextRefreshAttemptTimestamp,
  clearTokens,
  clearProxyScopedCredentials,
  getProxyScopedToken,
} from "../lib/api";
import serverManager from "../service/servers.js";
import user from "../service/User.js";
import Token from "../utils/token.ts";
import { REDIRECT_URI } from "../utils/authentification";
import log from "../utils/logger.js";
import { hasRequiredVpnPermissions } from "../utils/permissions.js";
import { resolveProxyServer } from "../utils/proxy-routing";
import {
  getMidoriPrivacyStatus,
  isTrustedMidoriPrivacyRequest,
} from "../utils/privacy-status.ts";

// Expose debug helper on globalThis so it can be called from the background
// inspector console: await debugProxy()
// Only exposed in non-production builds to avoid leaking internal state.
if (process.env.NODE_ENV !== "production") {
  globalThis.debugProxy = debugProxyState;
}

const TOKEN_REFRESH_ALARM = "auth-token-refresh";
// Throttle how often we force a token refresh in response to a 407 so a burst
// of rejections does not hammer Authentik.

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
      chrome.storage.local.get(["store"], resolve),
    );
    if (store?.state) {
      await chrome.storage.local.set({ store: { ...store, state: false } });
    }
  } catch (_) {
    // ignore
  }
  try {
    if (chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#E67B7B" });
    }
  } catch (_) {
    // ignore
  }
}

async function turnOffVpnForMissingPermissions() {
  try {
    const { store } = await new Promise((resolve) =>
      chrome.storage.local.get(["store"], resolve),
    );
    if (store?.state) {
      await chrome.storage.local.set({ store: { ...store, state: false } });
    }
  } catch (_) {
    // ignore
  }
  try {
    if (chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#E67B7B" });
    }
  } catch (_) {
    // ignore
  }
}

async function ensureRequiredVpnPermissions() {
  // All MidoriVPN permissions are declared as required in manifest.json, so
  // the browser grants them at install time. If the user later revokes one,
  // this guard flips the VPN switch off so traffic does not silently leak.
  // We no longer open a welcome/permissions tab: the user must re-enable the
  // permission from the browser's add-on manager.
  const granted = await hasRequiredVpnPermissions();
  if (granted) return true;

  await turnOffVpnForMissingPermissions();
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
    if (getNextRefreshAttemptTimestamp()) {
      return null;
    }
    await markSessionExpired();
  }
  return token;
}

const handlers = {
  loadServers: async () => {
    log.diag("background", "handler:loadServers:start");
    const result = await serverManager.loadServers();
    log.diag("background", "handler:loadServers:done", {
      count: Array.isArray(result?.servers) ? result.servers.length : null,
      activeId: result?.active?.id || null,
    });
    return result;
  },
  loadUser: async () => {
    return user.LoadUser();
  },
  provisionConnection: async (msg) => {
    log.diag("background", "handler:provisionConnection:start", {
      serverId: msg?.serverId || null,
      activeId: msg?.activeServer?.id || null,
      proxyEndpoint: resolveProxyServer(msg?.activeServer),
    });
    const serverId = msg.serverId;
    const active = msg.activeServer;
    if (!serverId) throw new Error("No server selected");
    if (!active || active.id !== serverId) {
      throw new Error("Selected server is not active");
    }
    const proxyEndpoint = resolveProxyServer(active);
    if (!proxyEndpoint) {
      throw new Error("Selected server does not support browser proxy mode");
    }

    const token = await ensureValidAccessToken();
    if (!token) throw new Error("Login session expired");

    log.diag("background", "handler:provisionConnection:ok", {
      serverId,
      proxyEndpoint,
    });
    return {
      id: null,
      server_id: serverId,
      mode: "proxy",
      proxy_endpoint: proxyEndpoint,
    };
  },
  reconfigureProxy: async (msg) => {
    if (!(await ensureRequiredVpnPermissions()))
      throw new Error("Missing browser permissions");
    const { store } = await new Promise((resolve) =>
      chrome.storage.local.get(["store"], resolve),
    );
    if (!store?.state) return { enabled: false };
    if (!msg?.activeServer) throw new Error("No server selected");
    const { server = {} } = await new Promise((resolve) =>
      chrome.storage.local.get(["server"], resolve),
    );
    await chrome.storage.local.set({
      server: { ...server, active: msg.activeServer },
    });
    if (!(await enableProxy()))
      throw new Error("Could not configure proxy for selected server");
    return { enabled: true };
  },
};

badge();

log.info("boot", "background loaded, initializing token session");
ensureRequiredVpnPermissions().catch((error) => {
  log.warn(
    "permissions",
    "Failed to check required VPN permissions on boot:",
    error?.message || error,
  );
});
syncTokenSession()
  .then(() => {})
  .catch((error) => {
    log.error("boot", "Failed to initialize token session:", error);
  });

// Listener registration is guarded because `browser.proxy`, `browser.webRequest`
// and `browser.webNavigation` come from optional_permissions. Until the user
// grants them via the welcome page, those APIs are `undefined`. Registering
// blindly at module load would throw a TypeError and kill the background
// service worker — which would also kill the OAuth callback handler below,
// making login impossible. Instead, we register lazily and re-register on
// `permissions.onAdded` so the background keeps working in any state.
const proxyAuthHandler = async (details) => {
  clearProxyScopedCredentials();
  if (!details.isProxy) return {};
  log.warn(
    "auth",
    "407 from proxy for",
    details.url,
    "- refreshing scoped proxy credential",
  );

  try {
    const token = await getProxyScopedToken();

    if (!token) {
      log.warn("auth", "no token available after 407, cancelling");
      await markSessionExpired();
      return { cancel: true };
    }

    return {
      authCredentials: {
        username: "midorivpn",
        password: token,
      },
    };
  } catch (err) {
    log.warn("auth", "refresh after 407 failed:", err?.message || err);
    if (err && err.shouldClear) {
      await markSessionExpired();
    }
    return { cancel: true };
  }
};

const proxyErrorHandler = (error) => {
  log.error("proxy-error", error);
};

const processingCallbacks = new Set();

const oauthNavigationHandler = async (details) => {
  if (details.frameId !== 0 || !details.url) return;

  try {
    const callbackURL = new URL(details.url);
    const expectedURL = REDIRECT_URI ? new URL(REDIRECT_URI) : null;

    const isCallback =
      expectedURL &&
      callbackURL.origin === expectedURL.origin &&
      callbackURL.pathname === expectedURL.pathname;

    if (isCallback && callbackURL.searchParams.has("code")) {
      const code = callbackURL.searchParams.get("code");
      if (code && processingCallbacks.has(code)) return;
      if (code) processingCallbacks.add(code);

      log.info("auth", "OAuth callback detected", {
        tabId: details.tabId || null,
      });
      const token = new Token();
      const success = await token.exchangeCode(details.url);
      if (success) {
        log.info(
          "auth",
          "Token exchange successful, syncing session and closing tab",
        );
        await syncTokenSession();
        if (
          details.tabId &&
          typeof chrome !== "undefined" &&
          chrome.tabs?.remove
        ) {
          try {
            chrome.tabs.remove(details.tabId);
          } catch (_) {
            /* tab might already be closed */
          }
        }
      } else {
        log.error("auth", "Token exchange failed", {
          tabId: details.tabId || null,
        });
      }
    }
  } catch (err) {
    log.error("auth", "Error in oauthNavigationHandler:", err);
  }
};

let proxyListenersRegistered = false;
let webRequestListenersRegistered = false;
let webNavigationListenerRegistered = false;
let tabListenerRegistered = false;

function registerProxyListeners() {
  if (proxyListenersRegistered) return;
  try {
    if (!browser?.proxy?.onRequest?.addListener) {
      log.warn(
        "boot",
        "browser.proxy unavailable — skipping proxy listener registration",
      );
      return;
    }
    browser.proxy.onRequest.addListener(handleProxy, { urls: ["<all_urls>"] });
    browser.proxy.onError.addListener(proxyErrorHandler);
    proxyListenersRegistered = true;
    log.info("boot", "proxy listeners registered");
  } catch (err) {
    log.warn(
      "boot",
      "failed to register proxy listeners:",
      err?.message || err,
    );
  }
}

const chromiumProxyAuthHandler = (details, callback) => {
  proxyAuthHandler(details)
    .then(callback)
    .catch(() => callback({ cancel: true }));
};

function registerWebRequestListeners() {
  if (webRequestListenersRegistered) return;
  try {
    const webReq =
      (typeof browser !== "undefined" && browser?.webRequest) ||
      (typeof chrome !== "undefined" && chrome?.webRequest);
    if (!webReq?.onAuthRequired?.addListener) {
      log.warn(
        "boot",
        "webRequest.onAuthRequired unavailable — skipping onAuthRequired registration",
      );
      return;
    }
    const chromium =
      typeof browser === "undefined" || !browser.runtime?.getBrowserInfo;
    webReq.onAuthRequired.addListener(
      chromium ? chromiumProxyAuthHandler : proxyAuthHandler,
      { urls: ["<all_urls>"] },
      chromium ? ["asyncBlocking"] : ["blocking"],
    );
    webRequestListenersRegistered = true;
    log.info(
      "boot",
      "webRequest.onAuthRequired registered for Chromium/Firefox",
    );
  } catch (err) {
    log.warn(
      "boot",
      "failed to register webRequest listener:",
      err?.message || err,
    );
  }
}

function registerWebNavigationListener() {
  if (webNavigationListenerRegistered) return;
  try {
    if (!chrome?.webNavigation?.onCommitted?.addListener) {
      log.warn(
        "boot",
        "chrome.webNavigation unavailable — OAuth callback detection disabled until permissions granted",
      );
      return;
    }

    let filter;
    try {
      if (REDIRECT_URI) {
        const u = new URL(REDIRECT_URI);
        filter = {
          url: [
            {
              hostEquals: u.hostname,
              pathEquals: u.pathname,
              schemes: [u.protocol.replace(":", "")],
            },
          ],
        };
      }
    } catch (_) {
      /* fall back to unfiltered */
    }

    if (filter) {
      chrome.webNavigation.onCommitted.addListener(
        oauthNavigationHandler,
        filter,
      );
    } else {
      chrome.webNavigation.onCommitted.addListener(oauthNavigationHandler);
    }
    webNavigationListenerRegistered = true;
    log.info("boot", "webNavigation.onCommitted registered");
  } catch (err) {
    log.warn(
      "boot",
      "failed to register webNavigation listener:",
      err?.message || err,
    );
  }
}

function registerOAuthTabListener() {
  if (tabListenerRegistered) return;
  try {
    if (typeof chrome !== "undefined" && chrome.tabs?.onUpdated?.addListener) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        const url = changeInfo.url || tab?.url;
        if (
          url &&
          url.includes("/extension/callback") &&
          url.includes("code=")
        ) {
          oauthNavigationHandler({ frameId: 0, url, tabId });
        }
      });
      tabListenerRegistered = true;
      log.info("boot", "tabs.onUpdated registered for OAuth callback");
    }
  } catch (err) {
    log.warn("boot", "failed to register tabs listener:", err);
  }
}

function registerAllListeners() {
  registerProxyListeners();
  registerWebRequestListeners();
  registerWebNavigationListener();
  registerOAuthTabListener();
}

registerAllListeners();

// Re-register when the user grants the optional permissions via the welcome
// page. Firefox/Chrome fire `permissions.onAdded` after a successful
// chrome.permissions.request().
if (chrome.permissions?.onAdded?.addListener) {
  chrome.permissions.onAdded.addListener(() => {
    log.info("boot", "permissions added — registering missing listeners");
    registerAllListeners();
  });
}

if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    ensureRequiredVpnPermissions().catch((error) => {
      log.warn(
        "permissions",
        "Failed to check required VPN permissions on startup:",
        error?.message || error,
      );
    });
    syncTokenSession()
      .then(() => {})
      .catch((error) => {
        log.error("boot", "Failed to restore token session on startup:", error);
      });
  });
}

if (chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    // On first install: open the welcome/permissions page so the user can
    // explicitly grant <all_urls> host access (Firefox MV3 defaults to
    // "Only When Clicked" without this step).
    if (details.reason === "install") {
      ensureRequiredVpnPermissions().catch((error) => {
        log.warn(
          "permissions",
          "Failed to check required VPN permissions after install:",
          error?.message || error,
        );
      });
    } else {
      ensureRequiredVpnPermissions().catch((error) => {
        log.warn(
          "permissions",
          "Failed to check required VPN permissions after update:",
          error?.message || error,
        );
      });
    }
    syncTokenSession().catch((error) => {
      log.error(
        "boot",
        "Failed to sync token session after install/update:",
        error,
      );
    });
  });
}

if (chrome.permissions?.onRemoved) {
  chrome.permissions.onRemoved.addListener((removed) => {
    if (!removed?.origins?.includes("<all_urls>")) return;
    log.warn("permissions", "<all_urls> permission removed; turning VPN off");
    turnOffVpnForMissingPermissions().catch((error) => {
      log.warn(
        "permissions",
        "Failed to handle removed VPN permission:",
        error?.message || error,
      );
    });
  });
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== TOKEN_REFRESH_ALARM) return;
    log.info("alarm", "token refresh alarm fired");
    syncTokenSession(true).catch((error) => {
      log.error("alarm", "Scheduled token refresh failed:", error);
    });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (
    !changes.access_token_enc &&
    !changes.refresh_token_enc &&
    !changes.token_expires_at
  )
    return;

  scheduleTokenRefresh().catch((error) => {
    log.error("alarm", "Failed to reschedule token refresh:", error);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return;

  const ALLOWED_TYPES = new Set(Object.keys(handlers));
  if (!msg?.type || !ALLOWED_TYPES.has(msg.type)) {
    log.warn("background", "message:unknown", { type: msg?.type || null });
    sendResponse({ success: false, error: "Unknown command" });
    return;
  }

  const handler = handlers[msg.type];
  Promise.resolve(handler(msg, sender))
    .then((result) => {
      sendResponse({ success: true, data: result });
    })
    .catch((error) => {
      log.error("background", "message:failure", {
        type: msg.type,
        error: error?.message || String(error),
      });
      sendResponse({
        success: false,
        error: error.message || "An unexpected error occurred",
      });
    });
  return true;
});

// Read-only bridge for Midori Privacy. Only the known blocker identities can
// query this minimal state; server selection, tokens and routing details never
// leave MidoriVPN.
browser.runtime.onMessageExternal.addListener(async (msg, sender) => {
  if (!isTrustedMidoriPrivacyRequest(msg, sender)) return undefined;

  const storage = await browser.storage.local.get(["store"]);
  let proxyConfigured = false;
  if (storage.store?.state) {
    try {
      proxyConfigured = Boolean((await validateProxyReady()).ok);
    } catch (_) {
      // Fail closed: the external consumer must never infer protection.
    }
  }
  return getMidoriPrivacyStatus(storage, proxyConfigured);
});
