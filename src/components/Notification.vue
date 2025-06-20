<template>
  <div :class="{ 'full' : notification.full}">
    <div class="column notification ga-sm" :class="[notification?.notification.type, { 'show' : notification.show } ]">
      <div class="row">
        <div class="icon">
          <slot name="icon">
            <span v-if="notification?.notification.type === 'success'">✅</span>
            <span v-else-if="notification?.notification.type === 'error'">❌</span>
            <span v-else-if="notification?.notification.type === 'info'">ℹ️</span>
            <span v-else>🔔</span>
          </slot>
        </div>
        <h3>{{ notification?.notification.title }}</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="content">
        <p>{{ notification?.notification.description }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import useNotificationStore from '../stores/useNotificationStore.js';

export default {
    name: "Notification",

    data() {
      return {
        notification: useNotificationStore(),
      }
    },
};
</script>

<style scoped>
.full {
  position: absolute;
  background-color: rgba(0, 0, 0, .3);
  height: 100%;
  width: 100%;
  top: 0;
}

.notification {
  position: absolute;
  width: 100%;
  height: 0;
  top: 0;
  background-color: white;
  border-radius: 0 0 1rem 1rem;
  box-shadow: 0 0 10px rgba(0,0,0,0.1);
  transition: opacity 0.3s ease;
  overflow: hidden;
  transition: 1s height, .7s padding;
}

.notification.show {
  height: 125px;
  padding: 1rem;
}

.notification.error {
  border-left: 5px solid #f44336;
  background-color: #fdecea;
}

.notification.info {
  border-left: 5px solid #2196f3;
  background-color: #e8f0fe;
}

.icon {
  font-size: 18px;
  margin-right: 12px;
}

.content h3 {
  margin: 0 0 4px 0;
  font-weight: 600;
  font-size: 16px;
}

.content p {
  margin: 0;
  font-size: 14px;
  color: #555;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 13px;
  background: transparent;
  border: none;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: #888;
}

.close-btn:hover {
  color: #333;
}
</style>