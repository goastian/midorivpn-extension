import { describe, expect, it, vi } from 'vitest';
import { showExtensionAfterOAuth } from '../utils/oauth-tab';

describe('showExtensionAfterOAuth', () => {
  it('reuses and focuses the callback tab', async () => {
    const update = vi.fn((_tabId, _properties, callback) => callback());
    const api = {
      runtime: { getURL: vi.fn(() => 'moz-extension://test/popup.html') },
      tabs: { update },
    };

    await expect(showExtensionAfterOAuth(0, api)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(0, {
      url: 'moz-extension://test/popup.html',
      active: true,
    }, expect.any(Function));
  });

  it('does not create another tab when the callback tab is unavailable', async () => {
    await expect(showExtensionAfterOAuth(undefined, {})).resolves.toBe(false);
  });

  it('reports a browser update failure', async () => {
    const api = {
      runtime: { getURL: () => 'chrome-extension://test/popup.html', lastError: new Error('closed') },
      tabs: { update: vi.fn((_tabId, _properties, callback) => callback()) },
    };

    await expect(showExtensionAfterOAuth(3, api)).resolves.toBe(false);
  });
});
