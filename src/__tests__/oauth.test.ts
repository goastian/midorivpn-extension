import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../utils/authentification', () => ({
    API_URL: 'https://api.example.com',
    REDIRECT_URI: 'https://app.example.com/extension/callback',
}));

const { saveTokens } = vi.hoisted(() => ({ saveTokens: vi.fn() }));
vi.mock('../lib/api', () => ({ saveTokens }));

const sessionStore: Record<string, any> = {};
const chromeMock = {
    storage: {
        session: {
            get: vi.fn(async (keys: string[]) => {
                const out: Record<string, any> = {};
                for (const k of keys) if (k in sessionStore) out[k] = sessionStore[k];
                return out;
            }),
            remove: vi.fn(async (keys: string[]) => {
                for (const k of keys) delete sessionStore[k];
            }),
        },
    },
};
(globalThis as any).chrome = chromeMock;

import { exchangeCode } from '../lib/oauth';

const REDIRECT = 'https://app.example.com/extension/callback';

beforeEach(() => {
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    saveTokens.mockReset();
    chromeMock.storage.session.get.mockClear();
    chromeMock.storage.session.remove.mockClear();
    vi.restoreAllMocks();
});

describe('exchangeCode', () => {
    it('rejects when callback origin does not match REDIRECT_URI', async () => {
        sessionStore.pkce_state = 's';
        const ok = await exchangeCode('https://evil.example.com/extension/callback?code=c&state=s');
        expect(ok).toBe(false);
    });

    it('rejects when callback path does not match REDIRECT_URI', async () => {
        sessionStore.pkce_state = 's';
        const ok = await exchangeCode('https://app.example.com/other?code=c&state=s');
        expect(ok).toBe(false);
    });

    it('rejects when state mismatches stored PKCE state', async () => {
        sessionStore.pkce_state = 'expected';
        const ok = await exchangeCode(`${REDIRECT}?code=c&state=different`);
        expect(ok).toBe(false);
    });

    it('rejects when no code is present', async () => {
        sessionStore.pkce_state = 's';
        const ok = await exchangeCode(`${REDIRECT}?state=s`);
        expect(ok).toBe(false);
    });

    it('rejects malformed URLs', async () => {
        const ok = await exchangeCode('::::not a url');
        expect(ok).toBe(false);
    });

    it('persists tokens on successful exchange and clears PKCE state', async () => {
        sessionStore.pkce_state = 's';
        sessionStore.pkce_verifier = 'v';
        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ data: { access_token: 'a', refresh_token: 'r', expires_in: 60 } }),
            headers: { get: () => null },
        } as any));
        (globalThis as any).fetch = fetchMock;

        const ok = await exchangeCode(`${REDIRECT}?code=c&state=s`);
        expect(ok).toBe(true);
        expect(saveTokens).toHaveBeenCalledWith('a', 'r', 60);
        expect(chromeMock.storage.session.remove).toHaveBeenCalledWith(['pkce_state', 'pkce_verifier']);
    });
});
