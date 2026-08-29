import { describe, expect, it, vi } from 'vitest';
import { registerProxyAuthentication } from '../utils/proxy-auth-listener';

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
