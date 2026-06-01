// src/plugins/chromeStoragePlugin.js

export function chromeStoragePlugin({ store }) {

    const storageKey = `${store.$id}`;
    // Read persistFields from the getter; an empty array means "do not persist".
    const persistFields = Array.isArray(store.persistFields)
        ? store.persistFields.filter((k) => typeof k === 'string' && k.length > 0)
        : null;

    if (persistFields && persistFields.length === 0) {
        return;
    }

    chrome.storage.local.get([storageKey], (result) => {
        if (result[storageKey]) {
            store.$patch(result[storageKey]);
        }
    });

    store.$subscribe((_mutation, state) => {
        let rawState = JSON.parse(JSON.stringify(state));

        if (persistFields) {
            rawState = persistFields.reduce((acc, key) => {
                if (key in rawState) acc[key] = rawState[key];
                return acc;
            }, {});
        }

        chrome.storage.local.set({ [storageKey]: rawState });
    });
}