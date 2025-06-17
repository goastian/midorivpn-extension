import badge from '../utils/badge';
import { handleHeader, handleProxy } from '../utils/proxy';
import { isFirefox } from '../utils/vars';

import Token from '../utils/token.ts';

import serverManager from '../service/servers.js';
import user from '../service/User.js';

const handlers = {
  loadServers: () => serverManager.loadServers(),
  loadUser: () => user.LoadUser(),
};

badge();


if (isFirefox) {
  browser.proxy.onRequest.addListener(handleProxy, {
    urls: ['<all_urls>'],
  });

  // Añade cabeceras personalizadas
  browser.webRequest.onBeforeSendHeaders.addListener(
    handleHeader,
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"]
  );
};

//routes
chrome.webNavigation.onCommitted.addListener((details) => {
  const url = new URL(details.url);
  if (url.pathname === '/callback') {
    const token = new Token();
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