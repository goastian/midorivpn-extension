import {
  registerProxyAuthentication,
  type ProxyAuthHandler,
  type WebRequestAPI,
} from '../utils/proxy-auth-listener';

export type BrowserTarget = 'chrome' | 'firefox';

export interface ProxyEndpoint {
  host: string;
  port: number;
  scheme: 'https';
}

type FirefoxProxyAPI = {
  onRequest?: {
    addListener: (listener: (details: { url: string }) => unknown, filter: { urls: string[] }) => void;
  };
  onError?: {
    addListener: (listener: (error: unknown) => void) => void;
  };
};

type WebExtensionAPI = {
  proxy?: FirefoxProxyAPI;
  webRequest?: WebRequestAPI;
};

type NativeChromeAPI = typeof chrome;

export interface BrowserRuntimeAdapter {
  readonly target: BrowserTarget;
  applyProxy(endpoint: ProxyEndpoint, bypassList: string[]): Promise<void>;
  resetProxy(): Promise<void>;
  registerProxyRouting(
    handler: (details: { url: string }) => unknown,
    onError: (error: unknown) => void,
  ): boolean;
  registerProxyAuthentication(handler: ProxyAuthHandler): boolean;
}

function normalizedTarget(value: string | undefined): BrowserTarget {
  return value === 'firefox' ? 'firefox' : 'chrome';
}

function updateChromiumProxy(
  nativeChrome: NativeChromeAPI,
  value: chrome.proxy.ProxyConfig,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const settings = nativeChrome.proxy?.settings;
    if (!settings?.set) {
      reject(new Error('Chromium proxy settings API is unavailable'));
      return;
    }
    settings.set({ value, scope: 'regular' }, () => {
      const failure = nativeChrome.runtime?.lastError;
      if (failure) {
        reject(new Error(failure.message || 'Unable to update Chromium proxy settings'));
        return;
      }
      resolve();
    });
  });
}

export function createBrowserRuntimeAdapter(
  targetValue = process.env.BROWSER,
  nativeChrome: NativeChromeAPI = chrome,
  webExtensionBrowser: WebExtensionAPI =
    ((globalThis as typeof globalThis & { browser?: WebExtensionAPI }).browser || {}),
): BrowserRuntimeAdapter {
  const target = normalizedTarget(targetValue);

  return {
    target,
    async applyProxy(endpoint, bypassList) {
      if (target === 'firefox') return;
      await updateChromiumProxy(nativeChrome, {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: endpoint.scheme,
            host: endpoint.host,
            port: endpoint.port,
          },
          bypassList,
        },
      });
    },
    async resetProxy() {
      if (target === 'firefox') return;
      await updateChromiumProxy(nativeChrome, { mode: 'direct' });
    },
    registerProxyRouting(handler, onError) {
      if (target !== 'firefox') {
        const proxyError = nativeChrome.proxy?.onProxyError;
        if (proxyError?.addListener) proxyError.addListener(onError);
        return true;
      }
      const requestEvent = webExtensionBrowser.proxy?.onRequest;
      const errorEvent = webExtensionBrowser.proxy?.onError;
      if (!requestEvent?.addListener || !errorEvent?.addListener) return false;
      requestEvent.addListener(handler, { urls: ['<all_urls>'] });
      errorEvent.addListener(onError);
      return true;
    },
    registerProxyAuthentication(handler) {
      const webRequest = target === 'chrome'
        ? nativeChrome.webRequest as unknown as WebRequestAPI
        : webExtensionBrowser.webRequest || nativeChrome.webRequest as unknown as WebRequestAPI;
      return registerProxyAuthentication(webRequest, handler, target);
    },
  };
}

export { normalizedTarget };
