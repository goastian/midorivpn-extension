<template>
  <div class="containerApp">
    <Home v-if="!isLoggedIn" />
    <div v-else>
      <Main />
    </div>
    <Notification
      @close="removeNotification"
    />
  </div>
</template>

<script>
import useNotificationStore from "./stores/useNotificationStore.js";
import { defineAsyncComponent } from 'vue';
import useVpnStore from './stores/useVpnStore';
export default {
  data() {
    return {
      isLoggedIn: false,
      vpn: useVpnStore(),
      notifications: useNotificationStore(),
    }
  },

  components: {
    Home: defineAsyncComponent(() => import('./pages/Home.vue')),
    Main: defineAsyncComponent(() => import('./pages/Main.vue')),
    Notification: defineAsyncComponent(() => import('./components/Notification.vue')),
  },

  async created() {
    chrome.storage.local.get('encryptedToken', async (storage) => {
      if (storage.encryptedToken) {
        this.isLoggedIn = !!storage.encryptedToken;
        const men = await this.vpn.createDevice();
        await this.vpn.loadServers();
        if(men) {
          this.notifications.add({
            title: "Device",
            description: men
          }, false, true)
        }
      }
    });
  },

  provide() {
    return {
      app_name: process.env.APP_NAME,
    }
  },

  methods: {
    removeNotification() {
      this.notifications.remove()
    }
  }
}

</script>

<style scoped>
.containerApp {
  position: relative;
}
</style>
