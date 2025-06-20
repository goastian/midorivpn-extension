import { defineStore } from 'pinia';

const useNotificationStore = defineStore('notification', {
    state: () => ({
        notification: {},
        show: false,
        full: false,
    }),

    actions: {
        add(notification, duration = true, full = false) {
            this.notification = { ...notification };

            if (notification.duration !== 0 && duration) {
                setTimeout(() => {
                    this.remove();
                }, notification.duration || 4000);
            }
            this.show = true;
            this.full = full;
        },

        remove() {
            this.show = false;
            this.full = false;
        },
    },

    getters: {
        persistFields() {
            return [''];
        },
    },
})

export default useNotificationStore