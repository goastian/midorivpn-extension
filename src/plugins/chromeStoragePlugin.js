// src/plugins/chromeStoragePlugin.js

export function chromeStoragePlugin({ store }) {

    const storageKey = `${store.$id}`;
    // Leer persistFields desde el getter
    const persistFields = store.persistFields || null;

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