import { describe, expect, it, vi } from 'vitest';
import { createProxyAuthenticationHandler, registerProxyAuthentication, selectProxyWebRequestAPI } from '../utils/proxy-auth-listener';

function registration() {
  const addListener = vi.fn();
  return {
    addListener,
    webRequest: { onAuthRequired: { addListener } },
  };
}

describe('registerProxyAuthentication', () => {
  it('uses the asynchronous callback contract required by Chromium', async () => {
    const registered = registration();
    const handler = vi.fn().mockResolvedValue({
      authCredentials: { username: 'midorivpn', password: 'scoped-token' },
    });

    expect(registerProxyAuthentication(registered.webRequest, handler, 'chrome')).toBe(true);
    const [listener, filter, extra] = registered.addListener.mock.calls[0];
    expect(filter).toEqual({ urls: ['<all_urls>'] });
    expect(extra).toEqual(['asyncBlocking']);

    const callback = vi.fn();
    listener({ isProxy: true }, callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith({
      authCredentials: { username: 'midorivpn', password: 'scoped-token' },
    }));
  });

  it('fails closed when the Chromium credential handler rejects', async () => {
    const registered = registration();
    registerProxyAuthentication(
      registered.webRequest,
      vi.fn().mockRejectedValue(new Error('storage unavailable')),
      'chrome',
    );

    const [listener] = registered.addListener.mock.calls[0];
    const callback = vi.fn();
    listener({ isProxy: true }, callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith({ cancel: true }));
  });

  it('keeps the Promise blocking contract for Firefox and Midori', () => {
    const registered = registration();
    const handler = vi.fn();

    expect(registerProxyAuthentication(registered.webRequest, handler, 'firefox')).toBe(true);
    expect(registered.addListener).toHaveBeenCalledWith(
      handler,
      { urls: ['<all_urls>'] },
      ['blocking'],
    );
  });
});

describe('selectProxyWebRequestAPI', () => {
  it('uses the native Chrome API for asyncBlocking callbacks', () => {
    const native = registration().webRequest;
    const polyfill = registration().webRequest;
    expect(selectProxyWebRequestAPI('chrome', native, polyfill)).toBe(native);
  });

  it('uses the Promise-capable polyfill for Firefox and Midori', () => {
    const native = registration().webRequest;
    const polyfill = registration().webRequest;
    expect(selectProxyWebRequestAPI('firefox', native, polyfill)).toBe(polyfill);
  });
});

describe('createProxyAuthenticationHandler', () => {
  it('supplies only the scoped proxy credential', async () => {
    const getToken = vi.fn().mockResolvedValue('vpn-proxy-token');
    const handler = createProxyAuthenticationHandler({
      getToken,
      invalidateToken: vi.fn(),
    });

    await expect(handler({ isProxy: true, requestId: 'request-1' })).resolves.toEqual({
      authCredentials: { username: 'midorivpn', password: 'vpn-proxy-token' },
    });
    expect(getToken).toHaveBeenCalledOnce();
  });

  it('cancels a repeated challenge instead of entering an authentication loop', async () => {
    const invalidateToken = vi.fn();
    const handler = createProxyAuthenticationHandler({
      getToken: vi.fn().mockResolvedValue('vpn-proxy-token'),
      invalidateToken,
    });

    await handler({ isProxy: true, requestId: 'request-2' });
    await expect(handler({ isProxy: true, requestId: 'request-2' })).resolves.toEqual({ cancel: true });
    expect(invalidateToken).toHaveBeenCalledOnce();
  });

  it('fails closed without deleting the OAuth session when a scoped token is unavailable', async () => {
    const onUnavailable = vi.fn();
    const handler = createProxyAuthenticationHandler({
      getToken: vi.fn().mockResolvedValue(null),
      invalidateToken: vi.fn(),
      onUnavailable,
    });

    await expect(handler({ isProxy: true, requestId: 'request-3' })).resolves.toEqual({ cancel: true });
    expect(onUnavailable).toHaveBeenCalledOnce();
  });
});
