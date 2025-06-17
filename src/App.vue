<template>
  <Home v-if="!isLoggedIn" />
  <div v-else>
    <Main />
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import useVpnStore from './stores/useVpnStore';
export default {
  data() {
    return {
      isLoggedIn: false,
      vpn: useVpnStore(),
    }
  },

  components: {
    Home: defineAsyncComponent(() => import('./pages/Home.vue')),
    Main: defineAsyncComponent(() => import('./pages/Main.vue')),
  },

  async created() {
    chrome.storage.local.get('encryptedToken', async (storage) => {
      if(storage.encryptedToken){
        this.isLoggedIn = !!storage.encryptedToken;
        await this.vpn.createDevice();
      }
    });
  },

  provide() {
    return {
      app_name: process.env.APP_NAME,
    }
  },
}

</script>

<style scoped></style>
