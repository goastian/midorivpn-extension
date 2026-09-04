interface StoredBadgeState {
    store?: { state?: boolean };
    server?: { active?: { country_code?: string } };
}

function badge(): void {
    chrome.storage.local.get(['store'], (rawStorage) => {
        const storage = rawStorage as StoredBadgeState;
        if (storage.store?.state) {
            void enableBadge();
        } else {
            disableBadge();
        }
    });
}

export const enableBadge = async (): Promise<void> => {
    chrome.storage.local.get(['server'], (rawStorage) => {
        const storage = rawStorage as StoredBadgeState;
        if (storage.server?.active) {
            void chrome.action.setBadgeText({
                text: storage.server.active.country_code || 'ON',
            });
        }
    });
    await chrome.action.setBadgeBackgroundColor({ color: 'green' });
};

export const disableBadge = (): void => {
    void chrome.action.setBadgeText({ text: '' });
};

export default badge;
