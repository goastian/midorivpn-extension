import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
const { parseProbeOrigins } = createRequire(import.meta.url)('../../config/probe-origins.js');

it('allows explicit regional HTTPS origins without broadening connect-src', () => {
    expect(parseProbeOrigins('https://de.example.test, https://de.example.test/,https://regional.example.test:8443')).toEqual(['https://de.example.test', 'https://regional.example.test:8443']);
    expect(parseProbeOrigins()).toEqual([]);
    for (const invalid of ['http://edge.test', 'https://*.test', 'https://user:password@edge.test', 'https://edge.test/path', 'https://edge.test/?x=1', 'https://edge.test/#fragment', 'https:']) {
        expect(() => parseProbeOrigins(invalid)).toThrow();
    }
});
