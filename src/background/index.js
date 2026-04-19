import badge from '../utils/badge.js';
import { isFirefox } from '../utils/vars';
import { ensureValidAccessToken, getRefreshAlarmTimestamp } from '../lib/api';

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
    const module = await import('../service/servers.js');
    return module.default.loadServers();
  },
  loadUser: async () => {
    const module = await import('../service/User.js');
    return module.default.LoadUser();
  },
};

badge();

syncTokenSession().catch((error) => {
  console.error('Failed to initialize token session:', error);
});

if (isFirefox) {
  import('../utils/proxy').then(({ handleHeader, handleProxy }) => {
    browser.proxy.onRequest.addListener(handleProxy, {
      urls: ['<all_urls>'],
    });

    const registerHeaderListener = (withBlocking) => {
      const extraInfoSpec = withBlocking ? ['blocking', 'requestHeaders'] : ['requestHeaders'];
      browser.webRequest.onBeforeSendHeaders.addListener(
        handleHeader,
        { urls: ['<all_urls>'] },
        extraInfoSpec
      );
    };

    if (chrome.permissions?.contains) {
      chrome.permissions.contains({ permissions: ['webRequestBlocking'] }, (granted) => {
        try {
          registerHeaderListener(Boolean(granted));
          if (!granted) {
            console.warn('webRequestBlocking permission missing; registered non-blocking header listener.');
          }
        } catch (error) {
          console.error('Failed to register Firefox header listener:', error);
        }
      });
    } else {
      try {
        registerHeaderListener(true);
      } catch (error) {
        console.error('Failed to register Firefox blocking header listener:', error);
      }
    }
  });
};

// Handle OAuth callback route — only fire on the main frame
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = new URL(details.url);
  const redirectUri = process.env.AUTHENTIK_REDIRECT_URI || '';

  // Match the callback URL
  if (redirectUri && details.url.startsWith(redirectUri)) {
    const module = await import('../utils/token.ts');
    const token = new module.default();
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