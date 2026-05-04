import { ensureValidAccessToken } from '../lib/api';
import log from './logger.js';
import { hasRequiredVpnPermissions } from './permissions.js';

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

const blockProxyRequest = () => ({ type: 'http', host: '127.0.0.1', port: 1 });

const resolveProxyServer = (activeServer) => {
    if (!activeServer) return null;

    // 'endpoint' is the public-facing IP/hostname (may include ":port" for WireGuard).
    // 'host' is the internal container name (e.g. "vpn-core") — NOT reachable from
    // the browser. Always prefer endpoint (stripped of any port suffix) for the proxy.
    const raw = activeServer.endpoint || activeServer.host || '';
    const host = raw.split(':')[0];
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
            log.info('proxy', 'VPN toggle OFF, direct ->', hostname);
            return { type: 'direct' };
        }

        const hasVpnPermission = await hasRequiredVpnPermissions();
        if (!hasVpnPermission) {
            log.warn('proxy', 'Missing <all_urls> permission for', hostname, '— blocking to prevent IP leak');
            return blockProxyRequest();
        }

        log.warn('proxy:dbg', 'state=ON host=', hostname,
            '| server.active=', JSON.stringify(storage.server?.active));

        const proxyServer = resolveProxyServer(storage.server?.active);
        if (!proxyServer) {
            log.warn('proxy', 'No proxy server resolved from storage:', storage.server?.active);
            return blockProxyRequest();
        }

        log.warn('proxy:dbg', `resolved → ${proxyServer.host}:${proxyServer.port}`);

        const proxyInfo = {
            type: 'http',
            host: proxyServer.host,
            port: proxyServer.port,
        };

        let token;
        let tokenErr;
        try {
            token = await ensureValidAccessToken();
        } catch (e) {
            tokenErr = e;
        }

        // If token is temporarily unavailable (e.g. mid-refresh), retry briefly
        // rather than falling back to direct — a direct request leaks the real IP.
        if (!token) {
            for (let i = 0; i < 3 && !token; i++) {
                await new Promise(r => setTimeout(r, 300));
                try { token = await ensureValidAccessToken(); } catch { }
            }
        }

        if (!token) {
            // VPN is ON but token is unavailable — BLOCK instead of going direct.
            // Returning a connection that will be refused prevents IP leaks (kill switch).
            log.warn('proxy', 'No access token for', hostname, '— blocking to prevent IP leak', tokenErr?.message || '');
            return blockProxyRequest();
        }

        log.warn('proxy:dbg', 'token OK, routing', hostname, '->', `${proxyServer.host}:${proxyServer.port}`);

        // username/password → Firefox sends Proxy-Authorization: Basic
        proxyInfo.username = 'midorivpn';
        proxyInfo.password = token;
        // proxyAuthorizationHeader → Firefox 128+ sends custom header value
        proxyInfo.proxyAuthorizationHeader = `Bearer ${token}`;

        log.info('proxy', 'route', hostname, '->', `${proxyServer.host}:${proxyServer.port}`);
        return proxyInfo;
    } catch (e) {
        log.error('proxy', 'handleProxy error:', e);
        // On unexpected errors, block rather than leak the real IP.
        return { type: 'http', host: '127.0.0.1', port: 1 };
    }
};

// ── Debug helper — call from background inspector console: ──────────────────
// await debugProxyState()
export const debugProxyState = async () => {
    const storage = await getLocalStorage(['store', 'server', 'connection', 'access_token']);
    const active = storage.server?.active;
    const proxyServer = resolveProxyServer(active);
    const report = {
        vpnToggle: storage.store?.state ?? false,
        serverActive: active ?? null,
        resolvedProxy: proxyServer ?? null,
        hasAccessToken: !!(storage.access_token),
        hasAllUrlsPermission: await hasRequiredVpnPermissions(),
        connection: storage.connection ?? null,
    };
    console.warn('[MidoriVPN] proxy:debug', JSON.stringify(report, null, 2));
    return report;
};

// Firefox: proxy.onRequest handles routing. enableProxy/disableProxy only gate
// whether UI state may change; the actual proxy decision is in handleProxy.
export const enableProxy = async () => hasRequiredVpnPermissions();
export const disableProxy = async () => true;
