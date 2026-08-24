import { describe, it, expect } from 'vitest';
import { resolveProxyServer, buildBypassDomains } from '../utils/proxy-routing';

describe('resolveProxyServer', () => {
    it('returns null when active server is missing', () => {
        expect(resolveProxyServer(null)).toBeNull();
        expect(resolveProxyServer(undefined)).toBeNull();
    });

    it('returns null without an explicitly healthy proxy transport', () => {
        expect(resolveProxyServer({ transports: [] })).toBeNull();
        expect(resolveProxyServer({ transports: [
            { protocol: 'proxy', host: 'vpn.example.com', port: 443, enabled: true, health_status: 'degraded' },
        ] })).toBeNull();
        expect(resolveProxyServer({ transports: [
            { protocol: 'proxy', host: 'vpn.example.com', port: 443, enabled: false, health_status: 'healthy' },
        ] })).toBeNull();
    });

    it('returns the normalized healthy proxy transport', () => {
        expect(resolveProxyServer({ transports: [
            { protocol: 'wireguard', host: 'vpn.example.com', port: 51820, enabled: true, health_status: 'healthy' },
            { protocol: 'proxy', host: 'vpn.example.com', port: 443, enabled: true, health_status: 'healthy' },
        ] }))
            .toEqual({ host: 'vpn.example.com', port: 443, scheme: 'https' });
    });

    it('returns null for invalid port', () => {
        expect(resolveProxyServer({ transports: [
            { protocol: 'proxy', host: 'vpn.example.com', port: 0, enabled: true, health_status: 'healthy' },
        ] })).toBeNull();
        expect(resolveProxyServer({ transports: [
            { protocol: 'proxy', host: 'vpn.example.com', port: 65536, enabled: true, health_status: 'healthy' },
        ] })).toBeNull();
    });

    it('keeps an IPv6 hostname from the normalized contract intact', () => {
        expect(resolveProxyServer({ transports: [
            { protocol: 'proxy', host: '2001:db8::10', port: 443, enabled: true, health_status: 'healthy' },
        ] })).toEqual({ host: '2001:db8::10', port: 443, scheme: 'https' });
    });
});

describe('buildBypassDomains', () => {
    it('always includes localhost and 127.0.0.1', () => {
        expect(buildBypassDomains()).toEqual(['localhost', '127.0.0.1']);
    });

    it('adds hostnames from valid URLs', () => {
        const out = buildBypassDomains({
            apiUrl: 'https://api.example.com/api',
            authentikIssuer: 'https://auth.example.com/application/o/x',
        });
        expect(out).toContain('api.example.com');
        expect(out).toContain('auth.example.com');
        expect(out).toContain('localhost');
    });

    it('ignores invalid URLs silently', () => {
        const out = buildBypassDomains({ apiUrl: 'not a url', authentikIssuer: '' });
        expect(out).toEqual(['localhost', '127.0.0.1']);
    });
});
