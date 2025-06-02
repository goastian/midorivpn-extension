import { defineStore } from "pinia";

const useStore = defineStore('store', {
    state: () => ({
        state: false,
    }),

    actions: {
        changeState() {
            this.state = !this.state;
        }
    },

    getters: {

    },
})

export default useStore;