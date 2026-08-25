import { getProxyScopedCredentials } from "../lib/api";
import log from "./logger.js";
import { hasRequiredVpnPermissions } from "./permissions.js";
import { resolveProxyServer, buildBypassDomains } from "./proxy-routing";

const bypassDomains = buildBypassDomains({
  apiUrl: process.env.API_URL || "",
  authentikIssuer: process.env.AUTHENTIK_ISSUER || "",
});

const getLocalStorage = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, (storage) => resolve(storage || {}));
  });

const blockProxyRequest = () => ({ type: "https", host: "127.0.0.1", port: 1 });

export const validateProxyReady = async () => {
  const storage = await getLocalStorage(["server"]);
  const proxyServer = resolveProxyServer(storage.server?.active);
  if (!proxyServer) {
    return {
      ok: false,
      error: "Selected server does not support browser proxy mode",
    };
  }

  const hasVpnPermission = await hasRequiredVpnPermissions();
  if (!hasVpnPermission) {
    return { ok: false, error: "Missing browser permissions" };
  }

  const credentials = await getProxyScopedCredentials(proxyServer);
  if (!credentials) {
    return { ok: false, error: "Proxy credentials are unavailable" };
  }

  return { ok: true, proxy: credentials.endpoint };
};

export const handleProxy = async (details) => {
  try {
    const url = new URL(details.url);
    const hostname = url.hostname;

    if (bypassDomains.includes(hostname)) {
      return { type: "direct" };
    }

    const storage = await getLocalStorage(["store", "server"]);

    if (!storage.store?.state) {
      log.info("proxy", "VPN toggle OFF");
      return { type: "direct" };
    }

    const hasVpnPermission = await hasRequiredVpnPermissions();
    if (!hasVpnPermission) {
      log.warn(
        "proxy",
        "Missing <all_urls> permission — blocking to prevent IP leak",
      );
      return blockProxyRequest();
    }

    const proxyServer = resolveProxyServer(storage.server?.active);
    if (!proxyServer) {
      log.warn("proxy", "No secure proxy server is configured");
      return blockProxyRequest();
    }

    let credentials;
    let tokenErr;
    try {
      credentials = await getProxyScopedCredentials(proxyServer);
    } catch (e) {
      tokenErr = e;
    }

    // Retry token if momentarily renewing
    if (!credentials) {
      for (let i = 0; i < 3 && !credentials; i++) {
        await new Promise((r) => setTimeout(r, 300));
        try {
          credentials = await getProxyScopedCredentials(proxyServer);
        } catch {
          /* retry */
        }
      }
    }

    if (!credentials) {
      log.warn(
        "proxy",
        "No scoped proxy token — blocking to prevent IP leak",
        tokenErr?.message || "",
      );
      return blockProxyRequest();
    }

    // HTTPS CONNECT target is the endpoint returned with this scoped token,
    // never a separately cached server-list endpoint.
    const proxyInfo = {
      type: "https",
      host: credentials.endpoint.host,
      port: credentials.endpoint.port,
    };
    // username/password → Proxy-Authorization: Basic (for Firefox & Chrome onAuthRequired)
    proxyInfo.username = "midorivpn";
    proxyInfo.password = credentials.token;
    // proxyAuthorizationHeader → Firefox 128+ custom header value
    proxyInfo.proxyAuthorizationHeader = `Bearer ${credentials.token}`;

    log.info("proxy", "secure proxy route established");
    return proxyInfo;
  } catch (e) {
    log.error("proxy", "handleProxy error:", e);
    return blockProxyRequest();
  }
};

// ── Debug helper ─────────────────────────────────────────────────────────────
export const debugProxyState = async () => {
  const storage = await getLocalStorage([
    "store",
    "server",
    "connection",
    "access_token",
  ]);
  const active = storage.server?.active;
  const proxyServer = resolveProxyServer(active);
  const report = {
    vpnToggle: storage.store?.state ?? false,
    serverActive: active ?? null,
    resolvedProxy: proxyServer ?? null,
    hasAccessToken: !!storage.access_token,
    hasAllUrlsPermission: await hasRequiredVpnPermissions(),
    connection: storage.connection ?? null,
  };
  log.warn("proxy", "debug", JSON.stringify(report, null, 2));
  return report;
};

// ── Dual Engine Enable / Disable (Chromium + Firefox) ────────────────────────
export const enableProxy = async () => {
  const result = await validateProxyReady();
  if (!result.ok) return false;

  // If running in Chromium (chrome.proxy.settings API available)
  if (typeof chrome !== "undefined" && chrome?.proxy?.settings?.set) {
    const config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "https",
          host: result.proxy.host,
          port: Number(result.proxy.port),
        },
        bypassList: bypassDomains,
      },
    };
    await new Promise((resolve) => {
      chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
        log.info("proxy", "Chromium secure proxy settings configured");
        resolve(true);
      });
    });
  }

  return true;
};

export const disableProxy = async () => {
  if (typeof chrome !== "undefined" && chrome?.proxy?.settings?.set) {
    await new Promise((resolve) => {
      chrome.proxy.settings.set(
        { value: { mode: "direct" }, scope: "regular" },
        () => {
          log.info("proxy", "Chromium chrome.proxy.settings reset to direct");
          resolve(true);
        },
      );
    });
  }
  return true;
};
