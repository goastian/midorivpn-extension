import { describe, expect, it, vi } from 'vitest';
import { createOAuthRuntime } from '../runtime/auth-runtime';

const redirect = 'https://app.example.com/extension/callback';

describe('OAuth background runtime', () => {
  it('processes simultaneous independent callbacks without overwriting either flow', async () => {
    const exchangeCode = vi.fn(async (url: string) => url.includes('code=first'));
    const synchronizeSession = vi.fn(async () => undefined);
    const closeTab = vi.fn(async () => undefined);
    const runtime = createOAuthRuntime({ redirectUri: redirect, exchangeCode, synchronizeSession, closeTab });

    await Promise.all([
      runtime.handleNavigation({ frameId: 0, tabId: 10, url: `${redirect}?state=a&code=first` }),
      runtime.handleNavigation({ frameId: 0, tabId: 11, url: `${redirect}?state=b&code=second` }),
    ]);

    expect(exchangeCode).toHaveBeenCalledTimes(2);
    expect(synchronizeSession).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(2);
  });

  it('deduplicates duplicate listener delivery for the same callback', async () => {
    let finish!: (value: boolean) => void;
    const exchangeCode = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const synchronizeSession = vi.fn(async () => undefined);
    const closeTab = vi.fn(async () => undefined);
    const runtime = createOAuthRuntime({ redirectUri: redirect, exchangeCode, synchronizeSession, closeTab });
    const details = { frameId: 0, tabId: 0, url: `${redirect}?state=a&code=first` };

    const first = runtime.handleNavigation(details);
    const duplicate = runtime.handleNavigation(details);
    finish(true);
    await Promise.all([first, duplicate]);

    expect(exchangeCode).toHaveBeenCalledOnce();
    expect(synchronizeSession).toHaveBeenCalledOnce();
    expect(closeTab).toHaveBeenCalledWith(0);
  });

  it('ignores unrelated navigation and never invokes a popup API', async () => {
    const exchangeCode = vi.fn();
    const runtime = createOAuthRuntime({
      redirectUri: redirect,
      exchangeCode,
      synchronizeSession: vi.fn(),
      closeTab: vi.fn(),
    });
    await expect(runtime.handleNavigation({ frameId: 0, url: 'https://example.com/' })).resolves.toBe(false);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('closes a callback tab even when local storage makes the exchange fail', async () => {
    const closeTab = vi.fn(async () => undefined);
    const runtime = createOAuthRuntime({
      redirectUri: redirect,
      exchangeCode: vi.fn(async () => { throw new Error('storage unavailable'); }),
      synchronizeSession: vi.fn(),
      closeTab,
    });
    await expect(runtime.handleNavigation({
      frameId: 0,
      tabId: 7,
      url: `${redirect}?state=a&code=first`,
    })).resolves.toBe(false);
    expect(closeTab).toHaveBeenCalledWith(7);
  });
});
