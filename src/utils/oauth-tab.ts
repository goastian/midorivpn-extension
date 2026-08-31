type BrowserTabs = {
  runtime?: {
    getURL?: (path: string) => string;
    lastError?: unknown;
  };
  tabs?: {
    update?: (tabId: number, properties: { url: string; active: boolean }, callback: () => void) => void;
  };
};

/** Reuse the OAuth callback tab to present the extension result. */
export function showExtensionAfterOAuth(tabId: unknown, browserApi: BrowserTabs): Promise<boolean> {
  if (!Number.isInteger(tabId) || (tabId as number) < 0) return Promise.resolve(false);
  if (!browserApi?.tabs?.update || !browserApi?.runtime?.getURL) return Promise.resolve(false);

  const url = browserApi.runtime.getURL('popup.html');
  return new Promise((resolve) => {
    try {
      browserApi.tabs!.update!(tabId as number, { url, active: true }, () => {
        resolve(!browserApi.runtime?.lastError);
      });
    } catch {
      resolve(false);
    }
  });
}
