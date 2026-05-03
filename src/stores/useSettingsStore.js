import { defineStore } from 'pinia';

const useSettingsStore = defineStore('settings', {
    state: () => ({
        meshEnabled: true,
    }),

    getters: {
        persistFields() {
            return ['meshEnabled'];
        },
    },

    actions: {
        setMeshEnabled(value) {
            this.meshEnabled = !!value;
        },
    },
});

export default useSettingsStore;
