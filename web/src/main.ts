import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useSettingsStore } from '@/stores/settings'
import { vFocusTrap } from '@/directives/focusTrap'
import { pasangLindungiModal } from '@/composables/lindungiModal'
import { vBaris } from '@/directives/baris'
import { laporGalat } from '@/composables/useDialog'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
pasangLindungiModal(router)
app.directive('focus-trap', vFocusTrap)
app.directive('baris', vBaris)

// Jaring pengaman: error yang tidak ditangani halaman mana pun tetap terlihat oleh pengguna
// (sebelumnya hilang diam-diam — tombol terasa "tidak berfungsi").
app.config.errorHandler = (err, inst, info) => laporGalat(err, true, `${(inst as any)?.$options?.name || (inst as any)?.$options?.__name || 'komponen'} · ${info}`)
window.addEventListener('unhandledrejection', (e) => laporGalat(e.reason))

app.mount('#app')
// Layar pembuka (index.html) dilepas setelah halaman pertama siap, dengan pudar halus
router.isReady().finally(() => {
  const el = document.getElementById('pembuka')
  if (!el) return
  el.classList.add('pergi')
  setTimeout(() => el.remove(), 320)
})

// Load company settings once after mount
useSettingsStore().fetch()
