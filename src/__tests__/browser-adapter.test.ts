import { describe, expect, it, vi } from 'vitest';
import { createBrowserRuntimeAdapter } from '../runtime/browser-adapter';

function chromeAPI() {
  const set = vi.fn((_details, done) => done());
  const authAddListener = vi.fn();
  const proxyErrorAddListener = vi.fn();
  return {
    runtime: { lastError: undefined },
    proxy: { settings: { set }, onProxyError: { addListener: proxyErrorAddListener } },
    webRequest: { onAuthRequired: { addListener: authAddListener } },
    set,
    authAddListener,
    proxyErrorAddListener,
  };
}

describe('browser runtime adapters', () => {
  it('applies fixed settings only through the Chromium adapter', async () => {
    const native = chromeAPI();
    const adapter = createBrowserRuntimeAdapter('chrome', native as any, {});
    await adapter.applyProxy({ scheme: 'https', host: 'proxy.example.com', port: 443 }, ['localhost']);
    expect(native.set).toHaveBeenCalledWith({
      value: {
        mode: 'fixed_servers',
        rules: {
          singleProxy: { scheme: 'https', host: 'proxy.example.com', port: 443 },
          bypassList: ['localhost'],
        },
      },
      scope: 'regular',
    }, expect.any(Function));
  });

  it('registers Chromium proxy failures for automatic recovery', () => {
    const native = chromeAPI();
    const adapter = createBrowserRuntimeAdapter('chrome', native as any, {});
    const onError = vi.fn();
    expect(adapter.registerProxyRouting(vi.fn(), onError)).toBe(true);
    expect(native.proxyErrorAddListener).toHaveBeenCalledWith(onError);
  });

  it('registers Firefox request routing and Promise-based authentication separately', () => {
    const native = chromeAPI();
    const requestAddListener = vi.fn();
    const errorAddListener = vi.fn();
    const authAddListener = vi.fn();
    const adapter = createBrowserRuntimeAdapter('firefox', native as any, {
      proxy: {
        onRequest: { addListener: requestAddListener },
        onError: { addListener: errorAddListener },
      },
      webRequest: { onAuthRequired: { addListener: authAddListener } },
    });
    const route = vi.fn();
    const onError = vi.fn();
    const authenticate = vi.fn();

    expect(adapter.registerProxyRouting(route, onError)).toBe(true);
    expect(adapter.registerProxyAuthentication(authenticate)).toBe(true);
    expect(requestAddListener).toHaveBeenCalledWith(route, { urls: ['<all_urls>'] });
    expect(errorAddListener).toHaveBeenCalledWith(onError);
    expect(authAddListener).toHaveBeenCalledWith(authenticate, { urls: ['<all_urls>'] }, ['blocking']);
    expect(native.set).not.toHaveBeenCalled();
  });

  it('fails closed when Chromium rejects a proxy setting update', async () => {
    const native = chromeAPI();
    native.runtime.lastError = { message: 'policy denied' } as never;
    const adapter = createBrowserRuntimeAdapter('chrome', native as any, {});
    await expect(adapter.resetProxy()).rejects.toThrow('policy denied');
  });
});
