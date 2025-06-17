import { defineStore } from "pinia";

const useStore = defineStore('store', {
    state: () => ({
        state: false,
    }),

    actions: {
        async changeState() {
            this.state = !this.state;
        }
    },

    getters: {
        persistFields() {
            return ['state'];
        },
    },
})

export default useStore;