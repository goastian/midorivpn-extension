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

//routes
chrome.webNavigation.onCommitted.addListener(async (details) => {
  const url = new URL(details.url);
  if (url.pathname === '/callback') {
    const module = await import('../utils/token.ts');
    const token = new module.default();
    token.ngOnInit(url);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg.type];
  if (handler) {
    Promise.resolve(handler(msg, sender))
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message || 'Error desconocido' })
      );
    return true; // respuesta asíncrona
  } else {
    sendResponse({ success: false, error: 'Comando no reconocido' });
  }
});

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(result);
    });
  });
}