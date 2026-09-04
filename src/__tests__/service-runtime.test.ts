import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
    api: { get: vi.fn() },
}));

import { api } from '../lib/api';
import { ServerManager } from '../service/servers';
import { UserManager } from '../service/user';

const apiGet = vi.mocked(api.get);

describe('background service adapters', () => {
    beforeEach(() => {
        apiGet.mockReset();
    });

    it('filters unhealthy transports and reuses a non-empty server cache', async () => {
        apiGet.mockResolvedValue([
            {
                id: 'proxy-ready',
                transports: [{
                    protocol: 'proxy',
                    host: 'vpn.example',
                    port: 443,
                    enabled: true,
                    health_status: 'healthy',
                }],
            },
            {
                id: 'wireguard-only',
                transports: [{
                    protocol: 'wireguard',
                    host: 'vpn.example',
                    port: 51820,
                    enabled: true,
                    health_status: 'healthy',
                }],
            },
        ]);
        const manager = new ServerManager();

        const first = await manager.loadServers();
        const second = await manager.loadServers();

        expect(first.servers?.map((server) => server.id)).toEqual(['proxy-ready']);
        expect(first.meta).toMatchObject({ total: 2, eligibleProxy: 1, filteredOut: 1 });
        expect(second.meta.source).toBe('cache');
        expect(apiGet).toHaveBeenCalledTimes(1);
    });

    it('does not retain an empty server response for the full cache TTL', async () => {
        apiGet.mockResolvedValue([]);
        const manager = new ServerManager();

        await manager.loadServers();
        await manager.loadServers();

        expect(apiGet).toHaveBeenCalledTimes(2);
    });

    it('normalizes and caches the current user payload', async () => {
        apiGet.mockResolvedValue({ data: { id: 'user-1', email: 'user@example.test' } });
        const manager = new UserManager();

        const first = await manager.loadUser();
        const second = await manager.loadUser();

        expect(first).toEqual({ id: 'user-1', email: 'user@example.test' });
        expect(second).toEqual(first);
        expect(apiGet).toHaveBeenCalledTimes(1);
    });
});
