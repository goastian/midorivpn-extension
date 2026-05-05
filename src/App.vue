<template>
  <div class="containerApp">
    <Home v-if="!isLoggedIn" />
    <Main v-else />
    <Notification
      @close="removeNotification"
    />
  </div>
</template>

<script>
import useNotificationStore from "./stores/useNotificationStore.js";
import { defineAsyncComponent } from 'vue';
import useVpnStore from './stores/useVpnStore';
import Token from './utils/token.ts';
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
    const token = new Token();
    const accessToken = await token.getDecryptedToken();

    if (accessToken) {
      this.isLoggedIn = true;
      await this.vpn.loadServers();
    }
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
  width: 330px;
  height: 460px;
  overflow: hidden;
}
</style>
