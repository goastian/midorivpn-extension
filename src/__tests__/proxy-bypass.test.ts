import { describe, expect, it } from 'vitest';
import { currentBypassDomains, setProbeBypassURLs } from '../utils/proxy';

describe('dynamic probe bypass', () => {
  it('allows only exact HTTPS edge-health hosts outside the proxy', () => {
    setProbeBypassURLs([
      'https://edge-a.example/.well-known/midorivpn/edge-health',
      'https://edge-a.example/.well-known/midorivpn/edge-health',
      'https://edge-b.example/.well-known/midorivpn/edge-health',
      'http://insecure.example/.well-known/midorivpn/edge-health',
      'https://wrong.example/health',
      'not-a-url',
    ]);
    const bypass = currentBypassDomains();
    expect(bypass).toContain('edge-a.example');
    expect(bypass).toContain('edge-b.example');
    expect(bypass.filter((entry) => entry === 'edge-a.example')).toHaveLength(1);
    expect(bypass).not.toContain('insecure.example');
    expect(bypass).not.toContain('wrong.example');
  });
});
