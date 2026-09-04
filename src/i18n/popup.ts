const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
    origin_revoked: 'This browser is no longer authorized. Ask an administrator to restore access.',
    invalid_callback: 'The sign-in response could not be verified. Please try again.',
    service_unavailable: 'The sign-in service is temporarily unavailable. Please try again.',
};

export function authErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object' || !('code' in error)) return '';
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? AUTH_ERROR_MESSAGES[code] || '' : '';
}

export { AUTH_ERROR_MESSAGES };
