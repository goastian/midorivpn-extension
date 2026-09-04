import { beforeEach, describe, expect, it, vi } from 'vitest';

const contains = vi.fn();
const getAll = vi.fn();
const chromeMock = {
  runtime: { lastError: undefined },
  permissions: { contains, getAll },
  proxy: {},
  webRequest: {},
};
vi.stubGlobal('chrome', chromeMock);

import {
  hasRequiredVpnPermissions,
  REQUIRED_VPN_PERMISSION,
  wasRequiredVpnPermissionRemoved,
} from '../utils/permissions';

beforeEach(() => {
  vi.clearAllMocks();
  contains.mockImplementation((_requested, done) => done(false));
  getAll.mockImplementation((done) => done({ permissions: [], origins: [] }));
});

describe('required browser permissions', () => {
  it('does not mistake API object presence for a revoked grant', async () => {
    await expect(hasRequiredVpnPermissions()).resolves.toBe(false);
  });

  it('requires both host access and every API permission in the fallback inventory', async () => {
    getAll.mockImplementation((done) => done({
      permissions: REQUIRED_VPN_PERMISSION.permissions,
      origins: ['<all_urls>'],
    }));
    await expect(hasRequiredVpnPermissions()).resolves.toBe(true);
  });

  it('detects host and API revocations', () => {
    expect(wasRequiredVpnPermissionRemoved({ origins: ['<all_urls>'] })).toBe(true);
    expect(wasRequiredVpnPermissionRemoved({ permissions: ['webRequest'] })).toBe(true);
    expect(wasRequiredVpnPermissionRemoved({ permissions: ['notifications'] })).toBe(false);
  });
});
