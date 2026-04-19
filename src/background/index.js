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

    browser.webRequest.onBeforeSendHeaders.addListener(
      handleHeader,
      { urls: ['<all_urls>'] },
      ['blocking', 'requestHeaders']
    );
  });
};

// Handle OAuth callback route
chrome.webNavigation.onCommitted.addListener(async (details) => {
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