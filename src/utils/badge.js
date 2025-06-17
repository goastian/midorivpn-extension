function badge() {
    chrome.storage.local.get(['store'], (storage) => {
        if (storage.store?.state) {
            enableBadge();
        } else {
            disableBadge();
        }
    })
}

export const enableBadge = () => {
    chrome.runtime.sendMessage({ type: "loadServers" }, (response) => {
        if (response?.success) {
            chrome.action.setBadgeText({ text: response.data.active.data.country_code });
        }
    });
    chrome.action.setBadgeBackgroundColor({ color: "green" });
};

export const disableBadge = () => {
    chrome.action.setBadgeText({ text: "" });
};

export default badge;