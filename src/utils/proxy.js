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

export const handleProxy = async (details) => {
    try {
        const url = new URL(details.url);
        const hostname = url.hostname;

        if (bypassDomains.includes(hostname)) {
            return { type: 'direct' };
        }

        const storage = await getLocalStorage(['store', 'server']);

        if (!storage.store?.state) {
            return { type: 'direct' };
        }

        const proxyServer = resolveProxyServer(storage.server?.active);
        if (!proxyServer) {
            console.warn('[proxy] No proxy server resolved from storage:', storage.server?.active);
            return { type: 'direct' };
        }

        const proxyInfo = {
            type: 'http',
            host: proxyServer.host,
            port: proxyServer.port,
        };

        let token;
        try {
            token = await ensureValidAccessToken();
        } catch (e) {
            console.warn('[proxy] Token error:', e.message);
        }

        if (!token) {
            console.warn('[proxy] No access token, falling back to direct for', hostname);
            return { type: 'direct' };
        }

        // username/password → Firefox sends Proxy-Authorization: Basic
        proxyInfo.username = 'midorivpn';
        proxyInfo.password = token;
        // proxyAuthorizationHeader → Firefox 128+ sends custom header value
        proxyInfo.proxyAuthorizationHeader = `Bearer ${token}`;

        console.log('[proxy] Routing', hostname, '->', proxyServer.host + ':' + proxyServer.port);
        return proxyInfo;
    } catch (e) {
        console.error('[proxy] handleProxy error:', e);
        return { type: 'direct' };
    }
};

// Firefox: proxy.onRequest handles routing. enableProxy/disableProxy
// only toggle the store state — the actual proxy decision is in handleProxy.
export const enableProxy = async () => true;
export const disableProxy = async () => true;