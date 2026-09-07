import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useSettingsStore } from '@/stores/settings'
import { vFocusTrap } from '@/directives/focusTrap'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.directive('focus-trap', vFocusTrap)

app.mount('#app')

// Load company settings once after mount
useSettingsStore().fetch()
