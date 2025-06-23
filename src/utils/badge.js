import serverManager from '../service/servers.js';
function badge() {
    chrome.storage.local.get(['store'], (storage) => {
        if (storage.store?.state) {
            enableBadge();
        } else {
            disableBadge();
        }
    })
}

export const enableBadge = async () => {
    chrome.storage.local.get(['server'], (storage) => {
        if (storage?.server.active) {
            chrome.action.setBadgeText({ text: storage.server.active.data.country_code });
        }
    });
    chrome.action.setBadgeBackgroundColor({ color: "green" });
};

export const disableBadge = () => {
    chrome.action.setBadgeText({ text: "" });
};

export default badge;