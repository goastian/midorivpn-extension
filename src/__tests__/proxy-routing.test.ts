import { describe, it, expect } from 'vitest';
import { resolveProxyServer, buildBypassDomains } from '../utils/proxy-routing';

describe('resolveProxyServer', () => {
    it('returns null when active server is missing', () => {
        expect(resolveProxyServer(null)).toBeNull();
        expect(resolveProxyServer(undefined)).toBeNull();
    });

    it('returns null when supports_proxy is false', () => {
        expect(resolveProxyServer({ endpoint: '1.2.3.4', supports_proxy: false })).toBeNull();
    });

    it('strips port suffix from endpoint and uses proxy_port', () => {
        expect(resolveProxyServer({ endpoint: '1.2.3.4:51820', proxy_port: 8888 }))
            .toEqual({ host: '1.2.3.4', port: 8888 });
    });

    it('falls back to host when endpoint is missing', () => {
        expect(resolveProxyServer({ host: 'vpn.example.com' }))
            .toEqual({ host: 'vpn.example.com', port: 8888 });
    });

    it('returns null for invalid port', () => {
        expect(resolveProxyServer({ endpoint: '1.2.3.4', proxy_port: 'NaN' as any })).toBeNull();
        expect(resolveProxyServer({ endpoint: '1.2.3.4', proxy_port: -1 })).toBeNull();
    });

    it('returns null when both endpoint and host are empty', () => {
        expect(resolveProxyServer({ endpoint: '', host: '' })).toBeNull();
    });

    it('coerces string ports to numbers', () => {
        expect(resolveProxyServer({ endpoint: 'h.example', proxy_port: '3128' }))
            .toEqual({ host: 'h.example', port: 3128 });
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
