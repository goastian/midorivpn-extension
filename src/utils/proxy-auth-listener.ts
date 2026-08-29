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
