import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError, api } from '../lib/api';

const localStore: Record<string, unknown> = {};
(globalThis as any).chrome = {
    storage: {
        local: {
            get: vi.fn((keys: string[], callback: (value: Record<string, unknown>) => void) => {
                const selected: Record<string, unknown> = {};
                for (const key of keys) if (key in localStore) selected[key] = localStore[key];
                callback(selected);
            }),
            set: vi.fn((_data: Record<string, unknown>, callback?: () => void) => callback?.()),
            remove: vi.fn((_keys: string[], callback?: () => void) => callback?.()),
        },
        session: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => undefined),
        },
    },
};

describe('API errors', () => {
    beforeEach(() => {
        for (const key of Object.keys(localStore)) delete localStore[key];
        vi.restoreAllMocks();
    });

    it('preserves the stable backend code and status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ok: false,
            error: 'The service is temporarily unavailable',
            code: 'service_unavailable',
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        })));

        const failure = api.get('/api/v1/control/proxy-credentials');
        await expect(failure).rejects.toBeInstanceOf(APIError);
        await expect(failure).rejects.toMatchObject({
            status: 503,
            code: 'service_unavailable',
            message: 'The service is temporarily unavailable',
        });
    });
});
