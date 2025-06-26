import { createApp } from 'vue';
import { createPinia } from 'pinia';

import '@fontsource/inter/400.css';

import { chromeStoragePlugin } from './plugins/chromeStoragePlugin';
import App from './App.vue';
import './style.css';

const app = createApp(App);
const pinia = createPinia();

pinia.use(chromeStoragePlugin);
app.use(pinia);

app.mount('#App');
