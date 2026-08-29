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
type WebRequestAPI = { onAuthRequired?: AuthEvent };

export function selectProxyWebRequestAPI(
  browserTarget: string,
  nativeChromium: WebRequestAPI | undefined,
  webExtensionPolyfill: WebRequestAPI | undefined,
): WebRequestAPI | undefined {
  if (browserTarget === 'chrome') return nativeChromium;
  return webExtensionPolyfill || nativeChromium;
}

type ProxyAuthDetails = { isProxy?: boolean; requestId?: string };
type ProxyAuthDependencies = {
  getToken: () => Promise<string | null>;
  invalidateToken: () => void;
  onUnavailable?: () => void | Promise<void>;
  now?: () => number;
};

const AUTH_ATTEMPT_TTL_MS = 60_000;

export function createProxyAuthenticationHandler(dependencies: ProxyAuthDependencies): AuthHandler {
  type Attempt = { startedAt: number; response: Promise<AuthResponse>; submitted: boolean };
  const attempts = new Map<string, Attempt>();
  const now = dependencies.now || Date.now;

  return async (rawDetails: unknown): Promise<AuthResponse> => {
    const details = (rawDetails || {}) as ProxyAuthDetails;
    if (!details.isProxy) return {};

    const currentTime = now();
    for (const [requestId, attempt] of attempts) {
      if (currentTime - attempt.startedAt >= AUTH_ATTEMPT_TTL_MS) attempts.delete(requestId);
    }

    const requestId = details.requestId || '';
    const existing = requestId ? attempts.get(requestId) : undefined;
    if (existing) {
      // Chromium may deliver the same event more than once while an async
      // callback is still waiting. Share that response. Only a later challenge
      // after credentials were submitted means the proxy rejected them.
      if (!existing.submitted) return existing.response;
      attempts.delete(requestId);
      dependencies.invalidateToken();
      return { cancel: true };
    }

    const attempt: Attempt = {
      startedAt: currentTime,
      response: Promise.resolve({ cancel: true }),
      submitted: false,
    };
    attempt.response = (async (): Promise<AuthResponse> => {
      try {
        const token = await dependencies.getToken();
        if (!token) {
          if (requestId) attempts.delete(requestId);
          await dependencies.onUnavailable?.();
          return { cancel: true };
        }
        if (requestId) attempt.submitted = true;
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
    })();
    if (requestId) attempts.set(requestId, attempt);
    return attempt.response;
  };
}

export function registerProxyAuthentication(
  webRequest: WebRequestAPI | undefined,
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
