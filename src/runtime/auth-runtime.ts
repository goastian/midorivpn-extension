export interface OAuthNavigationDetails {
  frameId: number;
  url?: string;
  tabId?: number;
}

interface OAuthRuntimeDependencies {
  redirectUri: string;
  exchangeCode: (url: string) => Promise<boolean>;
  synchronizeSession: () => Promise<void>;
  closeTab: (tabId: number) => Promise<void>;
  now?: () => number;
}

interface ProcessedCallback {
  completedAt: number;
  result: Promise<boolean>;
}

const CALLBACK_DEDUP_TTL_MS = 5 * 60 * 1000;
const MAX_TRACKED_CALLBACKS = 32;

function callbackIdentity(url: URL): string | null {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code) return null;
  return `${state}\u0000${code}`;
}

export function createOAuthRuntime(dependencies: OAuthRuntimeDependencies) {
  const processed = new Map<string, ProcessedCallback>();
  const expected = dependencies.redirectUri ? new URL(dependencies.redirectUri) : null;
  const now = dependencies.now || Date.now;

  const prune = () => {
    const cutoff = now() - CALLBACK_DEDUP_TTL_MS;
    for (const [key, entry] of processed) {
      if (entry.completedAt > 0 && entry.completedAt < cutoff) processed.delete(key);
    }
    while (processed.size > MAX_TRACKED_CALLBACKS) {
      const oldest = processed.keys().next().value as string | undefined;
      if (!oldest) break;
      processed.delete(oldest);
    }
  };

  const handleNavigation = async (details: OAuthNavigationDetails): Promise<boolean> => {
    if (details.frameId !== 0 || !details.url || !expected) return false;

    let callback: URL;
    try {
      callback = new URL(details.url);
    } catch {
      return false;
    }
    if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) return false;

    const identity = callbackIdentity(callback);
    if (!identity) return false;
    prune();

    let tracked = processed.get(identity);
    if (!tracked) {
      tracked = {
        completedAt: 0,
        result: (async () => {
          try {
            const success = await dependencies.exchangeCode(details.url!);
            if (success) await dependencies.synchronizeSession();
            return success;
          } catch {
            return false;
          }
        })().finally(() => {
          const entry = processed.get(identity);
          if (entry) entry.completedAt = now();
        }),
      };
      processed.set(identity, tracked);
    }

    const success = await tracked.result;
    if (details.tabId !== undefined) {
      try {
        await dependencies.closeTab(details.tabId);
      } catch {
        // The user or the duplicate listener may already have closed it.
      }
    }
    return success;
  };

  return { handleNavigation };
}

export { CALLBACK_DEDUP_TTL_MS };
