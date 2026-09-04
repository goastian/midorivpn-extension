// @ts-expect-error legacy logger pending the bounded ENG-04 migration
import log from './logger.js';

const COMMON_API_PERMISSIONS = ['proxy', 'tabs', 'webRequest', 'webNavigation'];
const BROWSER_SPECIFIC_PERMISSIONS = process.env.BROWSER === 'firefox'
  ? ['webRequestBlocking']
  : ['webRequestAuthProvider'];

const REQUIRED_VPN_PERMISSION = {
  permissions: [...COMMON_API_PERMISSIONS, ...BROWSER_SPECIFIC_PERMISSIONS],
  origins: ['<all_urls>'],
} as chrome.permissions.Permissions;
const OPEN_DEBOUNCE_MS = 2000;

let openPermissionsPagePromise: Promise<void> | null = null;
let lastOpenPermissionsPageAt = 0;

const callbackResult = <T>(fn: (done: (result: T) => void) => void): Promise<T | false> =>
  new Promise((resolve) => {
    try {
      fn((result) => resolve(result));
    } catch {
      resolve(false);
    }
  });

function includesRequiredOrigin(origins: string[] | undefined): boolean {
  return Array.isArray(origins) &&
    (origins.includes('<all_urls>') || origins.includes('*://*/*'));
}

function includesRequiredAPIs(permissions: string[] | undefined): boolean {
  return Array.isArray(permissions) &&
    (REQUIRED_VPN_PERMISSION.permissions || []).every((permission) => permissions.includes(permission));
}

export function wasRequiredVpnPermissionRemoved(
  removed: { permissions?: string[]; origins?: string[] } | undefined,
): boolean {
  if (!removed) return false;
  return Boolean(
    removed.origins?.some((origin) => origin === '<all_urls>' || origin === '*://*/*') ||
    removed.permissions?.some((permission) =>
      (REQUIRED_VPN_PERMISSION.permissions || []).includes(permission as chrome.runtime.ManifestPermission)),
  );
}

export const hasRequiredVpnPermissions = async (): Promise<boolean> => {
  if (!chrome?.permissions?.contains) {
    const browserAPI = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser;
    const hasProxyAPI = Boolean(browserAPI?.proxy || chrome?.proxy);
    const hasWebRequestAPI = Boolean(browserAPI?.webRequest || chrome?.webRequest);
    return hasProxyAPI && hasWebRequestAPI;
  }

  try {
    const contains = await callbackResult<boolean>((done) => {
      chrome.permissions.contains(REQUIRED_VPN_PERMISSION, (granted) => {
        if (chrome.runtime?.lastError) {
          done(false);
          return;
        }
        done(Boolean(granted));
      });
    });
    if (contains === true) return true;

    if (chrome.permissions?.getAll) {
      const granted = await callbackResult<chrome.permissions.Permissions>((done) =>
        chrome.permissions.getAll(done));
      if (granted && typeof granted === 'object') {
        return includesRequiredOrigin(granted.origins) && includesRequiredAPIs(granted.permissions);
      }
    }
  } catch {
    return false;
  }

  // If the permissions API exists, API object presence is not proof that the
  // user still granted access. Treat an indeterminate response as revoked.
  return false;
};

export const requestRequiredVpnPermissions = async (): Promise<boolean> => {
  if (!chrome.permissions?.request) return false;

  // Keep request() as the first async browser call in the click handler so
  // Firefox retains the user gesture for its permission prompt.
  const granted = await callbackResult<boolean>((done) => {
    chrome.permissions.request(REQUIRED_VPN_PERMISSION, (result) => {
      if (chrome.runtime?.lastError) {
        log.warn('permissions', 'request failed:', chrome.runtime.lastError.message);
        done(false);
        return;
      }
      done(Boolean(result));
    });
  });
  return granted === true;
};

const focusTab = async (tab: chrome.tabs.Tab): Promise<boolean> => {
  if (!tab) return false;
  if (tab.id !== undefined) {
    await callbackResult((done) => chrome.tabs.update(tab.id!, { active: true }, done));
  }
  if (tab.windowId !== undefined && chrome.windows?.update) {
    await callbackResult((done) => chrome.windows.update(tab.windowId!, { focused: true }, done));
  }
  return true;
};

const findPermissionsPageTab = async (url: string): Promise<chrome.tabs.Tab | null> => {
  const tabs = await callbackResult<chrome.tabs.Tab[]>((done) => chrome.tabs.query({}, done));
  if (!Array.isArray(tabs)) return null;
  return tabs.find((tab) => tab.url === url || tab.pendingUrl === url) || null;
};

const doOpenPermissionsPage = async (): Promise<void> => {
  if (!chrome.tabs?.create) return;
  const url = chrome.runtime.getURL('welcome.html');

  try {
    const existing = await findPermissionsPageTab(url);
    if (existing) {
      await focusTab(existing);
      return;
    }
  } catch {
    // Fall through and open a fresh onboarding tab.
  }

  await callbackResult((done) => chrome.tabs.create({ url, active: true }, done));
};

export const openPermissionsPage = async (): Promise<void> => {
  if (openPermissionsPagePromise) return openPermissionsPagePromise;

  if (Date.now() - lastOpenPermissionsPageAt < OPEN_DEBOUNCE_MS) return;

  openPermissionsPagePromise = doOpenPermissionsPage()
    .finally(() => {
      lastOpenPermissionsPageAt = Date.now();
      openPermissionsPagePromise = null;
    });
  return openPermissionsPagePromise;
};

export { REQUIRED_VPN_PERMISSION };
