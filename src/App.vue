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
    await this.checkAuth();
  },

  mounted() {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      this._storageListener = (changes, area) => {
        if (area === 'local' && (changes.access_token || changes.store || changes.logged_in_at)) {
          this.checkAuth();
        }
      };
      chrome.storage.onChanged.addListener(this._storageListener);
    }
  },

  beforeUnmount() {
    if (this._storageListener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(this._storageListener);
    }
  },

  methods: {
    async checkAuth() {
      try {
        const token = new Token();
        const accessToken = await token.getDecryptedToken();

        if (accessToken) {
          this.isLoggedIn = true;
          await this.vpn.loadServers();
        } else {
          this.isLoggedIn = false;
        }
      } catch (err) {
        log.error('app', 'auth check error:', err);
        this.isLoggedIn = false;
      }
    },

    removeNotification() {
      this.notifications.remove();
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

@media screen and (min-width: 360px) and (pointer: coarse) {
  .containerApp {
    width: 100%;
    min-width: 0;
    height: 100vh;
    height: 100dvh;
  }
}
</style>
