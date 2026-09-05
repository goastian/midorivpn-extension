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

    it('validates the dedicated failover candidate contract', async () => {
        apiGet.mockResolvedValue([{
            id: 'server-1',
            name: 'Principal',
            location: 'Santo Domingo',
            country_code: 'DO',
            protocol: 'proxy',
            probe_url: 'https://vpn.example/.well-known/midorivpn/edge-health',
            endpoint: 'proxy.example',
            port: 443,
            priority: 10,
        }]);
        const manager = new ServerManager();

        await expect(manager.loadProxyCandidates()).resolves.toEqual([
            expect.objectContaining({ id: 'server-1', endpoint: 'proxy.example', port: 443 }),
        ]);
        expect(apiGet).toHaveBeenCalledWith('/api/v1/control/servers/candidates?protocol=proxy');
    });

    it('rejects malformed or non-HTTPS failover probes fail-closed', async () => {
        apiGet.mockResolvedValue([{
            id: 'server-1', name: 'Principal', protocol: 'proxy',
            probe_url: 'http://vpn.example/.well-known/midorivpn/edge-health',
            endpoint: 'proxy.example', port: 443, priority: 10,
        }]);
        const manager = new ServerManager();
        await expect(manager.loadProxyCandidates()).rejects.toThrow('Invalid proxy candidate');
    });

    it('rejects a candidate endpoint that is a URL instead of a host', async () => {
        apiGet.mockResolvedValue([{
            id: 'server-1', name: 'Principal', protocol: 'proxy',
            probe_url: 'https://vpn.example/.well-known/midorivpn/edge-health',
            endpoint: 'https://proxy.example/path', port: 443, priority: 10,
        }]);
        await expect(new ServerManager().loadProxyCandidates()).rejects.toThrow('Invalid proxy candidate');
    });

    it('keeps a manual server pinned and requires its explicit probe URL', async () => {
        apiGet.mockResolvedValue([{
            id: 'manual', name: 'Manual', probe_url: 'https://vpn.example/.well-known/midorivpn/edge-health',
            transports: [{ protocol: 'proxy', host: 'proxy.example', port: 443, enabled: true, health_status: 'healthy' }],
        }]);
        const manager = new ServerManager();
        await expect(manager.getManualCandidate('manual')).resolves.toMatchObject({
            id: 'manual', endpoint: 'proxy.example', port: 443,
        });
        await expect(manager.getManualCandidate('different')).resolves.toBeNull();
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
