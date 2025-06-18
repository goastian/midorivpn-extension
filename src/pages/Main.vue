<template>
  <div class="container column">
    <div class="header">
      <div class="row items-center ga-sm">
        <img src="/icons/logo.png" class="logo" />
        <h1 class="title">{{ app_name }}</h1>
      </div>
      <Options />
    </div>
    <div class="center">
      <v-switch />
    </div>
    <div class="main column ga-md">
      <div class="column ga-sm">
        <span class="subtitle">Select Server</span>
        <v-select />
      </div>
      <div class="main-footer column ga-sm">
        <div class="row ga-sm">
          <span>💎</span>
          <div class="column ga-sm">
            <h3 class="primary-text">VPN Premium</h3>
            <span class="description">Get unlimited data, more servers, and faster speeds.</span>
          </div>
        </div>
        <button class="btn update" @click="openLink">Upgrade to Premium</button>
      </div>
    </div>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
export default {
  inject: ['app_name'],
  components: {
    VSelect: defineAsyncComponent(() => import('../components/Select.vue')),
    VSwitch: defineAsyncComponent(() => import('../components/Switch.vue')),
    Options: defineAsyncComponent(() => import('../components/Options.vue')),
  },

  methods: {
    openLink() {
      chrome.tabs.create({ url: `${process.env.PASSPORT_SERVER}/plans` }, function () {
        window.close(); // Cierra el popup de la extensión
      });
    }
  }
}
</script>

<style scoped>
.container {
  width: 330px;
  height: 460px;
  background-color: #F1F5F9;
  background-image: radial-gradient(circle, #e5e7eb 1px, transparent 1px);
  background-size: 20px 20px;
  padding: .4rem;
  box-shadow: none;
  color: #202020;
  font-family: 'Inter', sans-serif;
}

.header {
  background-color: white;
  display: flex;
  justify-content: space-between;
  padding: .4rem .8rem;
  border-radius: .4rem;
  height: 10%;
}

.title {
  font-size: 1.4rem;
}

.logo {
  width: 180px;
}

.center {
  width: 100%;
  height: 30%;
  position: relative;
}

.btn {
  border: none;
  background-color: transparent;
  cursor: pointer;
}

.text-md {
  font-size: 1.7rem;
}

.main {
  background-color: white;
  height: 60%;
  border-radius: .87rem;
  padding: 1rem;
  padding-top: 60px;
}

.subtitle {
  font-size: .9rem;
}

.main-footer {
  box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 5px 0px, rgba(0, 0, 0, 0.1) 0px 0px 1px 0px;
  padding: 1rem;
  border-radius: .5rem;
}

.primary-text {
  font-size: .9rem;
}

.description {
  font-size: .8rem;
}

.btn.update {
  background-color: #49B9FF;
  color: white;
  padding: .4rem 0;
  border-radius: .4rem;
}
</style>