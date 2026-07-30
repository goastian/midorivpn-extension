import { describe, expect, it } from 'vitest';
import {
  getMidoriPrivacyStatus,
  isTrustedMidoriPrivacyRequest,
} from '../utils/privacy-status';

const request = {
  action: 'get-midori-vpn-status',
  source: 'midori-protection',
};

describe('Midori Privacy status bridge', () => {
  it('accepts the Firefox Midori Privacy identity', () => {
    expect(isTrustedMidoriPrivacyRequest(request, {
      id: 'midori-protection@astian.org',
    })).toBe(true);
  });

  it('rejects unknown senders and malformed requests', () => {
    expect(isTrustedMidoriPrivacyRequest(request, {
      id: 'unknown@example.org',
    })).toBe(false);
    expect(isTrustedMidoriPrivacyRequest({ ...request, source: 'other' }, {
      id: 'midori-protection@astian.org',
    })).toBe(false);
  });

  it('derives the public state from the proxy toggle', () => {
    expect(getMidoriPrivacyStatus({ store: { state: true } }, 42)).toEqual({
      state: 'connected',
      updatedAt: 42,
    });
    expect(getMidoriPrivacyStatus({ store: { state: false } }, 42)).toEqual({
      state: 'off',
      updatedAt: 42,
    });
  });
});
