import { expect, it, vi } from 'vitest';
import { detectDesktopEnvironment } from '../utils/platform';

it('does not inspect GPU or request high entropy identifiers for a download link', async () => {
    sessionStorage.clear();
    const highEntropy = vi.fn().mockResolvedValue({ architecture: 'arm', platform: 'macOS' });
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { getHighEntropyValues: highEntropy } });
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await detectDesktopEnvironment();
    expect(highEntropy).not.toHaveBeenCalled();
    expect(canvas).not.toHaveBeenCalled();
});
