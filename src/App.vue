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
import useVpnStore from './stores/useVpnStore';
import Token from './utils/token.ts';
import Home from './pages/Home.vue';
import Main from './pages/Main.vue';
import Notification from './components/Notification.vue';
import log from './utils/logger.js';
export default {

  components: {
    Home,
    Main,
    Notification,
  },

  provide() {
    return {
      app_name: process.env.APP_NAME,
    }
  },
  data() {
    return {
      isLoggedIn: false,
      initError: false,
      vpn: useVpnStore(),
      notifications: useNotificationStore(),
    }
  },

  async created() {
    try {
      const token = new Token();
      const accessToken = await token.getDecryptedToken();

      if (accessToken) {
        this.isLoggedIn = true;
        await this.vpn.loadServers();
      }
    } catch (err) {
      log.error('app', 'init error:', err);
      this.isLoggedIn = false;
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
