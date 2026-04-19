import badge from '../utils/badge.js';
import { isFirefox } from '../utils/vars';

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
      // Close the callback tab
      chrome.tabs.remove(details.tabId);
    }
  }
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