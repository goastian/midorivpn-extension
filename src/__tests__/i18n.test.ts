import { describe, expect, it } from 'vitest';

import { AUTH_ERROR_MESSAGES, authErrorMessage } from '../i18n/popup';
import { WELCOME_MESSAGES, resolveWelcomeLocale } from '../i18n/welcome';

describe('extension i18n modules', () => {
    it('keeps English and Spanish welcome keys in parity', () => {
        expect(Object.keys(WELCOME_MESSAGES.en).sort()).toEqual(
            Object.keys(WELCOME_MESSAGES.es).sort(),
        );
    });

    it('selects supported browser languages with a safe Spanish fallback', () => {
        expect(resolveWelcomeLocale('en-US')).toBe('en');
        expect(resolveWelcomeLocale('es-DO')).toBe('es');
        expect(resolveWelcomeLocale('de-DE')).toBe('es');
        expect(resolveWelcomeLocale(undefined)).toBe('es');
    });

    it('renders only reviewed authentication error codes', () => {
        expect(authErrorMessage({ code: 'origin_revoked' })).toBe(
            AUTH_ERROR_MESSAGES.origin_revoked,
        );
        expect(authErrorMessage({ code: 'unreviewed' })).toBe('');
        expect(authErrorMessage(null)).toBe('');
    });
});
