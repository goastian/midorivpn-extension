import { defineStore } from "pinia";

const useStore = defineStore('store', {
    state: () => ({
        state: false,
    }),

    actions: {
        async setState(value) {
            this.state = value === true;
        }
    },

    getters: {
        persistFields() {
            return ['state'];
        },
    },
})

export default useStore;
