// Chromium does not accept a Promise from an onAuthRequired listener. Its
// Manifest V3 path must use asyncBlocking and complete through the callback.
// Firefox/Midori support the WebExtension Promise contract with blocking.
type AuthResponse = { cancel?: boolean; authCredentials?: { username: string; password: string } };
type AuthHandler = (details: unknown) => AuthResponse | Promise<AuthResponse>;
type AuthEvent = {
  addListener: (
    listener: (...args: any[]) => AuthResponse | Promise<AuthResponse> | void,
    filter: { urls: string[] },
    extraInfoSpec: string[],
  ) => void;
};

type ProxyAuthDetails = { isProxy?: boolean; requestId?: string };
type ProxyAuthDependencies = {
  getToken: () => Promise<string | null>;
  invalidateToken: () => void;
  onUnavailable?: () => void | Promise<void>;
  now?: () => number;
};

const AUTH_ATTEMPT_TTL_MS = 60_000;

export function createProxyAuthenticationHandler(dependencies: ProxyAuthDependencies): AuthHandler {
  const attempts = new Map<string, number>();
  const now = dependencies.now || Date.now;

  return async (rawDetails: unknown): Promise<AuthResponse> => {
    const details = (rawDetails || {}) as ProxyAuthDetails;
    if (!details.isProxy) return {};

    const currentTime = now();
    for (const [requestId, attemptedAt] of attempts) {
      if (currentTime - attemptedAt >= AUTH_ATTEMPT_TTL_MS) attempts.delete(requestId);
    }

    const requestId = details.requestId || '';
    if (requestId && attempts.has(requestId)) {
      attempts.delete(requestId);
      dependencies.invalidateToken();
      return { cancel: true };
    }
    if (requestId) attempts.set(requestId, currentTime);

    try {
      const token = await dependencies.getToken();
      if (!token) {
        if (requestId) attempts.delete(requestId);
        await dependencies.onUnavailable?.();
        return { cancel: true };
      }
      return {
        authCredentials: {
          username: 'midorivpn',
          password: token,
        },
      };
    } catch {
      if (requestId) attempts.delete(requestId);
      await dependencies.onUnavailable?.();
      return { cancel: true };
    }
  };
}

export function registerProxyAuthentication(
  webRequest: { onAuthRequired?: AuthEvent } | undefined,
  handler: AuthHandler,
  browserTarget: string,
): boolean {
  const event = webRequest?.onAuthRequired;
  if (!event?.addListener) return false;

  const filter = { urls: ['<all_urls>'] };
  if (browserTarget === 'chrome') {
    const chromiumHandler = (details: unknown, callback: (response: AuthResponse) => void) => {
      Promise.resolve(handler(details)).then(
        (response) => callback(response || {}),
        () => callback({ cancel: true }),
      );
    };
    event.addListener(chromiumHandler, filter, ['asyncBlocking']);
    return true;
  }

  event.addListener(handler, filter, ['blocking']);
  return true;
}
