import { isFirefox } from "./vars";
import Token from '../utils/token.ts';
import serverManager from '../service/servers.js';

const handlers = {
    loadServers: () => serverManager.getServers(),
    getServers: () => serverManager.getServers(),
};
let customHeaders = '';

const getLocalStorage = (keys) => new Promise((resolve) => {
    chrome.storage.local.get(keys, (storage) => resolve(storage || {}));
});

const resolveProxyServer = (activeServer) => {
    if (!activeServer) return null;

    const host = activeServer.host || activeServer.url || activeServer.ip || '';
    const rawPort = activeServer.port || activeServer.proxy_port;
    const port = Number(rawPort);

    if (!host || !Number.isFinite(port) || port <= 0) {
        return null;
    }

    return {
        host,
        port,
        id: activeServer.id,
    };
};

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
                const proxyServer = resolveProxyServer(storage.server?.active);
                if (proxyServer) {
                    resolve({
                        type: 'https',
                        host: proxyServer.host,
                        port: proxyServer.port,
                    })
                } else {
                    resolve({ type: 'direct' })
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
                const serverID = storage.server?.active?.id || storage.server?.id;
                customHeaders = {
                    "Proxy-Authorization": `Bearer ${token}|${serverID}`
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

export const enableProxy = async () => {
    if (!isFirefox) {
        const storage = await getLocalStorage(['server']);
        const proxyServer = resolveProxyServer(storage.server?.active);
        if (!proxyServer) {
            return false;
        }

        //chrome.action.setBadgeText({ text: response.data.active.data.country_code });
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: proxyServer.host,
                    port: proxyServer.port,
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