import badge from '../utils/badge.js';
import { handleProxy } from '../utils/proxy';
import { api, ensureValidAccessToken, getRefreshAlarmTimestamp } from '../lib/api';
import serverManager from '../service/servers.js';
import user from '../service/User.js';
import Token from '../utils/token.ts';

const TOKEN_REFRESH_ALARM = 'auth-token-refresh';

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
  await ensureValidAccessToken(forceRefresh);
  await scheduleTokenRefresh();
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

    // First try to reuse an existing connection for this server
    try {
      const existing = await api.get('/api/v1/control/connections');
      if (Array.isArray(existing)) {
        const match = existing.find(c => c.server_id === serverId && c.is_active);
        if (match) {
          await chrome.storage.local.set({ connection: match });
          return match;
        }
      }
    } catch (_) {
      // Ignore — proceed to create
    }

    try {
      const keypair = await api.post('/api/v1/control/keypair');
      const connection = await api.post('/api/v1/control/connections', {
        server_id: serverId,
        public_key: keypair.public_key,
        device_name: 'extension',
      });

      await chrome.storage.local.set({ connection });
      return connection;
    } catch (err) {
      // 409 = device limit — try to reuse any existing connection
      if (err.message && err.message.includes('device limit')) {
        const existing = await api.get('/api/v1/control/connections');
        if (Array.isArray(existing) && existing.length > 0) {
          const active = existing.find(c => c.is_active) || existing[0];
          await chrome.storage.local.set({ connection: active });
          return active;
        }
      }
      throw err;
    }
  },
};

badge();

syncTokenSession().catch((error) => {
  console.error('Failed to initialize token session:', error);
});

// Firefox: proxy.onRequest handles all proxy routing and auth.
browser.proxy.onRequest.addListener(handleProxy, {
  urls: ['<all_urls>'],
});

// Log proxy errors so they are visible in the browser console.
browser.proxy.onError.addListener((error) => {
  console.error('[proxy] Error:', error);
});

// Firefox fires onAuthRequired when the proxy replies with 407.
// Credentials are already provided via proxy.onRequest (handleProxy),
// so if we get here it means the proxy rejected them — always cancel
// to suppress the native username/password dialog.
browser.webRequest.onAuthRequired.addListener(
  (details) => {
    if (!details.isProxy) return {};
    console.warn('[auth] onAuthRequired: proxy rejected credentials, cancelling', details.url);
    return { cancel: true };
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// Handle OAuth callback route — only fire on the main frame
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = new URL(details.url);
  const redirectUri = process.env.AUTHENTIK_REDIRECT_URI || '';

  // Match the callback URL
  if (redirectUri && details.url.startsWith(redirectUri)) {
    const token = new Token();
    const success = await token.exchangeCode(details.url);
    if (success) {
      await syncTokenSession();
      // Close the callback tab
      chrome.tabs.remove(details.tabId);
    }
  }
});

if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    syncTokenSession().catch((error) => {
      console.error('Failed to restore token session on startup:', error);
    });
  });
}

if (chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    syncTokenSession().catch((error) => {
      console.error('Failed to sync token session after install/update:', error);
    });
  });
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== TOKEN_REFRESH_ALARM) return;

    syncTokenSession(true).catch((error) => {
      console.error('Scheduled token refresh failed:', error);
    });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!changes.access_token && !changes.refresh_token && !changes.token_expires_at) return;

  scheduleTokenRefresh().catch((error) => {
    console.error('Failed to reschedule token refresh:', error);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return;

  const handler = handlers[msg.type];
  if (handler) {
    Promise.resolve(handler(msg, sender))
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message || 'Unknown error' })
      );
    return true;
  } else {
    sendResponse({ success: false, error: 'Unknown command' });
  }
});