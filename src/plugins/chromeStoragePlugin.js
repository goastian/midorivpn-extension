// src/plugins/chromeStoragePlugin.js

export function chromeStoragePlugin({ store }) {

    const storageKey = `${store.$id}`;

    chrome.storage.local.get([storageKey], (result) => {
        if (result[storageKey]) {
            store.$patch(result[storageKey]);
        }
    });

    store.$subscribe((_mutation, state) => {
        const rawState = JSON.parse(JSON.stringify(state));
        chrome.storage.local.set({ [storageKey]: rawState });
    });
}