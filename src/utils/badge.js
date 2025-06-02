function badge() {
    chrome.storage.local.get(['store'], (storage) => {
        console.log(storage)
        if(storage.store.state) {
            enableBadge();
        } else {
            disableBadge();
        }
    })
}

export const enableBadge = () => {
    chrome.action.setBadgeText({ text: "US" });
    chrome.action.setBadgeBackgroundColor({ color: "green" });

};

export const disableBadge = () => {
    chrome.action.setBadgeText({ text: "" });
};

export default badge;