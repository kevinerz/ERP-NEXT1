import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useSettingsStore } from '@/stores/settings'
import { vFocusTrap } from '@/directives/focusTrap'
import { pasangLindungiModal } from '@/composables/lindungiModal'
import { vBaris } from '@/directives/baris'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
pasangLindungiModal(router)
app.directive('focus-trap', vFocusTrap)
app.directive('baris', vBaris)

app.mount('#app')

// Load company settings once after mount
useSettingsStore().fetch()
