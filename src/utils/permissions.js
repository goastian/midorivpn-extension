import { isFirefox } from './vars.js';

// 'alarms' and 'storage' are required permissions in the manifest (always granted),
// so they must NOT be included in optional permission requests.
const COMMON_API_PERMISSIONS = ['proxy', 'tabs', 'webRequest', 'webNavigation'];
const BROWSER_SPECIFIC_PERMISSIONS = isFirefox
    ? ['webRequestBlocking']
    : ['webRequestAuthProvider', 'offscreen'];

const REQUIRED_VPN_PERMISSION = {
    permissions: [...COMMON_API_PERMISSIONS, ...BROWSER_SPECIFIC_PERMISSIONS],
    origins: ['<all_urls>'],
};
const OPEN_DEBOUNCE_MS = 2000;

let openPermissionsPagePromise = null;
let lastOpenPermissionsPageAt = 0;

const callbackResult = (fn) => new Promise((resolve) => {
    try {
        fn((result) => resolve(result));
    } catch (_) {
        resolve(false);
    }
});

export const hasRequiredVpnPermissions = async () => {
    if (!chrome.permissions?.contains) return false;

    const containsAllUrls = await callbackResult((done) => {
        chrome.permissions.contains(REQUIRED_VPN_PERMISSION, (granted) => {
            if (chrome.runtime?.lastError) {
                done(false);
                return;
            }
            done(Boolean(granted));
        });
    });
    if (containsAllUrls) return true;

    if (!chrome.permissions?.getAll) return false;

    const allPermissions = await callbackResult((done) => chrome.permissions.getAll(done));
    const hasAllUrls = Array.isArray(allPermissions?.origins) && allPermissions.origins.includes('<all_urls>');
    const hasApiPerms = Array.isArray(allPermissions?.permissions) &&
        REQUIRED_VPN_PERMISSION.permissions.every((p) => allPermissions.permissions.includes(p));
    return hasAllUrls && hasApiPerms;
};

export const requestRequiredVpnPermissions = async () => {
    if (!chrome.permissions?.request) return false;

    // Keep permissions.request as the first async browser permission call from
    // click handlers. Firefox can reject the prompt if an awaited preflight
    // consumes the user gesture before request() runs.
    return callbackResult((done) => {
        chrome.permissions.request(REQUIRED_VPN_PERMISSION, (granted) => {
            if (chrome.runtime?.lastError) {
                console.warn('[MidoriVPN] permissions request failed:', chrome.runtime.lastError.message);
                done(false);
                return;
            }
            done(Boolean(granted));
        });
    });
};

const focusTab = async (tab) => {
    if (!tab) return false;
    if (tab.id) {
        await callbackResult((done) => chrome.tabs.update(tab.id, { active: true }, done));
    }
    if (tab.windowId && chrome.windows?.update) {
        await callbackResult((done) => chrome.windows.update(tab.windowId, { focused: true }, done));
    }
    return true;
};

const findPermissionsPageTab = async (url) => {
    const tabs = await callbackResult((done) => chrome.tabs.query({}, done));
    if (!Array.isArray(tabs)) return null;
    return tabs.find((tab) => tab.url === url || tab.pendingUrl === url) || null;
};

const doOpenPermissionsPage = async () => {
    if (!chrome.tabs?.create) return;

    const url = chrome.runtime.getURL('welcome.html');

    try {
        const existing = await findPermissionsPageTab(url);
        if (existing) {
            await focusTab(existing);
            return;
        }
    } catch (_) {
        // Fall through and open a fresh onboarding tab.
    }

    await callbackResult((done) => chrome.tabs.create({ url, active: true }, done));
};

export const openPermissionsPage = async () => {
    if (openPermissionsPagePromise) return openPermissionsPagePromise;

    const now = Date.now();
    if (now - lastOpenPermissionsPageAt < OPEN_DEBOUNCE_MS) {
        return;
    }

    openPermissionsPagePromise = doOpenPermissionsPage()
        .finally(() => {
            lastOpenPermissionsPageAt = Date.now();
            openPermissionsPagePromise = null;
        });

    return openPermissionsPagePromise;
};

export { REQUIRED_VPN_PERMISSION };
