import { defineStore } from 'pinia';

const useSettingsStore = defineStore('settings', {
    state: () => ({}),
    getters: {
        persistFields() {
            return [];
        },
    },
    actions: {},
});

export default useSettingsStore;
