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

  it('requires verified proxy routing before reporting protection', () => {
    expect(getMidoriPrivacyStatus({ store: { state: true } }, true, 42)).toEqual({
      state: 'configured',
      updatedAt: 42,
    });
    expect(getMidoriPrivacyStatus({ store: { state: true } }, false, 42)).toEqual({
      state: 'off',
      updatedAt: 42,
    });
    expect(getMidoriPrivacyStatus({ store: { state: false } }, true, 42)).toEqual({
      state: 'off',
      updatedAt: 42,
    });
  });
});
