import { describe, it, expect } from 'vitest';
import { parseRetryAfterMs } from '../utils/http';

describe('parseRetryAfterMs', () => {
    it('returns 0 for null/empty', () => {
        expect(parseRetryAfterMs(null)).toBe(0);
        expect(parseRetryAfterMs('')).toBe(0);
    });

    it('converts numeric seconds to milliseconds', () => {
        expect(parseRetryAfterMs('5')).toBe(5000);
        expect(parseRetryAfterMs('0.5')).toBe(500);
    });

    it('returns 0 for non-positive numerics', () => {
        expect(parseRetryAfterMs('0')).toBe(0);
        expect(parseRetryAfterMs('-3')).toBe(0);
    });

    it('parses HTTP-date relative to now and clamps negatives to 0', () => {
        const past = new Date(Date.now() - 60_000).toUTCString();
        expect(parseRetryAfterMs(past)).toBe(0);
        const future = new Date(Date.now() + 10_000).toUTCString();
        const ms = parseRetryAfterMs(future);
        expect(ms).toBeGreaterThan(5_000);
        expect(ms).toBeLessThanOrEqual(10_000);
    });

    it('clamps to maxMs', () => {
        expect(parseRetryAfterMs('999', 2000)).toBe(2000);
    });

    it('returns 0 for garbage', () => {
        expect(parseRetryAfterMs('not-a-date')).toBe(0);
    });
});
