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
export default {
  data() {
    return {
      isLoggedIn: false,
      initError: false,
      vpn: useVpnStore(),
      notifications: useNotificationStore(),
    }
  },

  components: {
    Home,
    Main,
    Notification,
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
      console.error('[MidoriVPN] App init error:', err);
      this.isLoggedIn = false;
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
