const REQUIRED_VPN_PERMISSION = { origins: ['<all_urls>'] };

const callbackResult = (fn) => new Promise((resolve) => {
    try {
        fn((result) => resolve(result));
    } catch (_) {
        resolve(false);
    }
});

export const hasRequiredVpnPermissions = async () => {
    if (!chrome.permissions?.contains) return false;

    return callbackResult((done) => {
        chrome.permissions.contains(REQUIRED_VPN_PERMISSION, (granted) => {
            if (chrome.runtime?.lastError) {
                done(false);
                return;
            }
            done(Boolean(granted));
        });
    });
};

export const requestRequiredVpnPermissions = async () => {
    if (await hasRequiredVpnPermissions()) return true;
    if (!chrome.permissions?.request) return false;

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

export const openPermissionsPage = async () => {
    if (!chrome.tabs?.create) return;

    const url = chrome.runtime.getURL('welcome.html');

    try {
        const tabs = await callbackResult((done) => chrome.tabs.query({ url }, done));
        if (Array.isArray(tabs) && tabs.length > 0) {
            const tab = tabs[0];
            if (tab.id) {
                await callbackResult((done) => chrome.tabs.update(tab.id, { active: true }, done));
            }
            if (tab.windowId && chrome.windows?.update) {
                await callbackResult((done) => chrome.windows.update(tab.windowId, { focused: true }, done));
            }
            return;
        }
    } catch (_) {
        // Fall through and open a fresh onboarding tab.
    }

    await callbackResult((done) => chrome.tabs.create({ url, active: true }, done));
};

export { REQUIRED_VPN_PERMISSION };
