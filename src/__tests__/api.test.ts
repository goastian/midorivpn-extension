import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError, api, getProxyScopedToken, invalidateProxyScopedToken } from '../lib/api';

const localStore: Record<string, unknown> = {};
(globalThis as any).chrome = {
    storage: {
        local: {
            get: vi.fn((keys: string[], callback: (value: Record<string, unknown>) => void) => {
                const selected: Record<string, unknown> = {};
                for (const key of keys) if (key in localStore) selected[key] = localStore[key];
                callback(selected);
            }),
            set: vi.fn((data: Record<string, unknown>, callback?: () => void) => {
                Object.assign(localStore, data);
                callback?.();
            }),
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
        invalidateProxyScopedToken();
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

    it('persists one installation identity and scopes the proxy credential to the selected server', async () => {
        const serverID = '11111111-1111-4111-8111-111111111111';
        localStore.server = { active: { id: serverID } };
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ok: true,
            data: {
                proxy_token: 'mvpn2.payload.signature',
                expires_in: 900,
                device_id: '22222222-2222-4222-8222-222222222222',
                proxy_endpoint: { server_id: serverID, host: 'proxy.test', port: 443, country_code: 'DO', location: 'Test' },
            },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(getProxyScopedToken()).resolves.toBe('mvpn2.payload.signature');
        await expect(getProxyScopedToken()).resolves.toBe('mvpn2.payload.signature');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = fetchMock.mock.calls[0][1] as RequestInit;
        const body = JSON.parse(String(request.body));
        expect(body).toMatchObject({
            server_id: serverID,
            device: { device_type: 'extension', reported_name: 'MidoriVPN Browser Extension' },
        });
        expect(body.device.client_instance_id).toMatch(/^[0-9a-f-]{36}$/i);
        expect(localStore.midori_proxy_device_identity_v1).toMatchObject({
            client_instance_id: body.device.client_instance_id,
            device_type: 'extension',
        });
    });
});
