<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { onMounted } from 'vue'
import { setupPushNotifications } from './plugins/pushNotifications'
import { setupGps } from './plugins/gps'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()

onMounted(async () => {
  auth.loadFromStorage()
  if (auth.isLoggedIn) {
    await setupPushNotifications()
    setupGps()
  }
})
</script>
