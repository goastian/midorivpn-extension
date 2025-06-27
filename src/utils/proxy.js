import { isFirefox } from "./vars";
import Token from '../utils/token.ts';
import serverManager from '../service/servers.js';

const handlers = {
    loadServers: () => serverManager.getServers(),
    getServers: () => serverManager.getServers(),
};
let customHeaders = '';

export const handleProxy = (details) => {
    return new Promise((resolve, reject) => {
        const url = new URL(details.url)
        const hostname = url.hostname

        const whitelistDomains = ['localhost', '127.0.0.1']

        if (whitelistDomains.includes(hostname)) {
            resolve({ type: 'direct' })
            return
        }
        chrome.storage.local.get(['store', 'server'], async (storage) => {
            if (storage.store?.state) {
                if (storage.server?.active) {
                    resolve({
                        type: 'https',
                        host: storage.server.active.url,
                        port: storage.server.active.port,
                    })
                }
            } else {
                resolve({ type: 'direct' })
            }
        })
    })
};

export const handleHeader = (details) => {
    return new Promise((resolve) => {
        const validated = new Token();
        chrome.storage.local.get(['store', 'server'], async (storage) => {
            if (storage.store?.state) {
                const token = await validated.getDecryptedToken();
                customHeaders = {
                    "Proxy-Authorization": `Bearer ${token}|${storage.server.id}`
                };
                for (let name in customHeaders) {
                    details.requestHeaders.push({ name, value: customHeaders[name] });
                }
                resolve({ requestHeaders: details.requestHeaders });
            } else {
                resolve({});
            }
        });
    })
};

export const enableProxy = () => {
    if (!isFirefox) {
        //chrome.action.setBadgeText({ text: response.data.active.data.country_code });
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: '72.144.125.232',
                    port: 1080,
                },
                bypassList: ["<all_urls>"]
            }
        };
        chrome.proxy.settings.set({ value: config, scope: "regular" });
        // Añade cabeceras personalizadas
        browser.webRequest.onBeforeSendHeaders.addListener(
            function (details) {
                for (let name in customHeaders) {
                    details.requestHeaders.push({ name, value: customHeaders[name] });
                }
                return { requestHeaders: details.requestHeaders };
            },
            { urls: ["<all_urls>"] },
            ["blocking", "requestHeaders"]
        );
        return true;
    }
    return true;
}

export const disableProxy = async () => {
    if(!isFirefox) {
        await chrome.proxy.settings.clear({ scope: "regular" });
        return true;
    }
    return true;
}