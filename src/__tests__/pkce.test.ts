import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};

function storageArea(store: Record<string, unknown>) {
  return {
    get: vi.fn(async (requested: string | string[] | null) => {
      if (requested === null) return { ...store };
      const keys = Array.isArray(requested) ? requested : [requested];
      return Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]]));
    }),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(store, values); }),
    remove: vi.fn(async (requested: string | string[]) => {
      for (const key of Array.isArray(requested) ? requested : [requested]) delete store[key];
    }),
  };
}

const chromeMock = {
  storage: {
    session: storageArea(sessionStore),
    local: storageArea(localStore),
  },
};
vi.stubGlobal('chrome', chromeMock);

import {
  consumePkceTransaction,
  loadPkceTransaction,
  MAX_PKCE_TRANSACTIONS,
  PKCE_KEY_PREFIX,
  PKCE_TTL_MS,
  storePkceTransaction,
} from '../lib/pkce';

const verifierA = 'a'.repeat(64);
const verifierB = 'b'.repeat(64);

beforeEach(() => {
  for (const store of [sessionStore, localStore]) {
    for (const key of Object.keys(store)) delete store[key];
  }
  vi.clearAllMocks();
});

describe('PKCE transaction storage', () => {
  it('keeps simultaneous OAuth transactions independent', async () => {
    await Promise.all([
      storePkceTransaction('state-a', verifierA, 1000),
      storePkceTransaction('state-b', verifierB, 1000),
    ]);

    await expect(loadPkceTransaction('state-a', 2000)).resolves.toBe(verifierA);
    await expect(loadPkceTransaction('state-b', 2000)).resolves.toBe(verifierB);
  });

  it('consumes only the callback transaction that completed', async () => {
    await storePkceTransaction('state-a', verifierA, 1000);
    await storePkceTransaction('state-b', verifierB, 1000);
    await consumePkceTransaction('state-a');

    await expect(loadPkceTransaction('state-a', 2000)).resolves.toBeNull();
    await expect(loadPkceTransaction('state-b', 2000)).resolves.toBe(verifierB);
  });

  it('removes expired verifier material fail-closed', async () => {
    const key = `${PKCE_KEY_PREFIX}expired`;
    sessionStore[key] = { verifier: verifierA, created_at: 1000 };
    localStore[key] = { verifier: verifierA, created_at: 1000 };

    await expect(loadPkceTransaction('expired', 1001 + PKCE_TTL_MS)).resolves.toBeNull();
    expect(sessionStore[key]).toBeUndefined();
    expect(localStore[key]).toBeUndefined();
  });

  it('bounds abandoned OAuth transactions deterministically', async () => {
    for (let index = 0; index < MAX_PKCE_TRANSACTIONS + 2; index += 1) {
      await storePkceTransaction(`state-${index}`, verifierA, 1000 + index);
    }
    const transactionKeys = Object.keys(localStore)
      .filter((key) => key.startsWith(PKCE_KEY_PREFIX));
    expect(transactionKeys).toHaveLength(MAX_PKCE_TRANSACTIONS);
    expect(transactionKeys).not.toContain(`${PKCE_KEY_PREFIX}state-0`);
    expect(transactionKeys).not.toContain(`${PKCE_KEY_PREFIX}state-1`);
  });
});
