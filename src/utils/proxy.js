import { isFirefox } from "./vars";
import { ensureValidAccessToken } from '../lib/api';

const API_URL = process.env.API_URL || '';
const AUTHENTIK_ISSUER = process.env.AUTHENTIK_ISSUER || '';

// Domains that must bypass the proxy to avoid circular auth dependencies
const bypassDomains = [
    'localhost',
    '127.0.0.1',
    ...(API_URL ? [new URL(API_URL).hostname] : []),
    ...(AUTHENTIK_ISSUER ? [new URL(AUTHENTIK_ISSUER).hostname] : []),
];

const getLocalStorage = (keys) => new Promise((resolve) => {
    chrome.storage.local.get(keys, (storage) => resolve(storage || {}));
});

const resolveProxyServer = (activeServer) => {
    if (!activeServer) return null;

    const host = activeServer.endpoint || activeServer.host || '';
    const rawPort = activeServer.proxy_port || 8888;
    const port = Number(rawPort);

    if (!host || !Number.isFinite(port) || port <= 0) {
        return null;
    }

    return { host, port };
};

export const handleProxy = (details) => {
    return new Promise((resolve) => {
        const url = new URL(details.url);
        const hostname = url.hostname;

        if (bypassDomains.includes(hostname)) {
            resolve({ type: 'direct' });
            return;
        }

        chrome.storage.local.get(['store', 'server'], async (storage) => {
            if (storage.store?.state) {
                const proxyServer = resolveProxyServer(storage.server?.active);
                if (proxyServer) {
                    resolve({
                        type: 'http',
                        host: proxyServer.host,
                        port: proxyServer.port,
                    });
                } else {
                    resolve({ type: 'direct' });
                }
            } else {
                resolve({ type: 'direct' });
            }
        });
    });
};

export const handleHeader = (details) => {
    return new Promise((resolve) => {
        chrome.storage.local.get(['store'], async (storage) => {
            if (storage.store?.state) {
                const access_token = await ensureValidAccessToken();
                if (access_token) {
                    details.requestHeaders.push({
                        name: 'Proxy-Authorization',
                        value: `Bearer ${access_token}`
                    });
                }
                resolve({ requestHeaders: details.requestHeaders });
            } else {
                resolve({});
            }
        });
    });
};

export const enableProxy = async () => {
    if (!isFirefox) {
        const storage = await getLocalStorage(['server']);
        const proxyServer = resolveProxyServer(storage.server?.active);
        if (!proxyServer) {
            return false;
        }

        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: proxyServer.host,
                    port: proxyServer.port,
                },
                bypassList: [
                    "localhost",
                    "127.0.0.1",
                    "::1",
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.168.0.0/16",
                    ...(API_URL ? [new URL(API_URL).hostname] : []),
                    ...(AUTHENTIK_ISSUER ? [new URL(AUTHENTIK_ISSUER).hostname] : []),
                ]
            }
        };
        chrome.proxy.settings.set({ value: config, scope: "regular" });

        // Add auth headers for Chrome
        if (typeof browser !== 'undefined' && browser.webRequest) {
            browser.webRequest.onBeforeSendHeaders.addListener(
                async function (details) {
                    const access_token = await ensureValidAccessToken();
                    if (access_token) {
                        details.requestHeaders.push({
                            name: 'Proxy-Authorization',
                            value: `Bearer ${access_token}`
                        });
                    }
                    return { requestHeaders: details.requestHeaders };
                },
                { urls: ["<all_urls>"] },
                ["blocking", "requestHeaders"]
            );
        }
        return true;
    }
    return true;
};

export const disableProxy = async () => {
    if (!isFirefox) {
        await chrome.proxy.settings.clear({ scope: "regular" });
        return true;
    }
    return true;
};