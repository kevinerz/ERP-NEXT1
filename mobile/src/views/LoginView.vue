<template>
  <ion-page>
    <ion-content class="ion-padding login-content">
      <div class="login-container">
        <!-- Logo / Branding -->
        <div class="brand">
          <div class="brand-logo">
            <ion-icon name="wifi" class="logo-icon" />
          </div>
          <h1 class="brand-name">my-NEXTtech</h1>
          <p class="brand-tagline">Network Operation Center</p>
        </div>

        <!-- Login Form -->
        <ion-card class="login-card">
          <ion-card-content>
            <ion-list lines="none">
              <ion-item class="input-item">
                <ion-input
                  v-model="username"
                  label="Username"
                  label-placement="stacked"
                  placeholder="Masukkan username"
                  autocomplete="username"
                  :disabled="loading"
                />
              </ion-item>

              <ion-item class="input-item">
                <ion-input
                  v-model="password"
                  label="Password"
                  label-placement="stacked"
                  type="password"
                  placeholder="Masukkan password"
                  autocomplete="current-password"
                  :disabled="loading"
                  @keyup.enter="doLogin"
                />
              </ion-item>
            </ion-list>

            <ion-text color="danger" v-if="errorMsg">
              <p class="error-text">{{ errorMsg }}</p>
            </ion-text>

            <ion-button
              expand="block"
              class="login-button"
              :disabled="loading || !username || !password"
              @click="doLogin"
            >
              <ion-spinner v-if="loading" name="crescent" />
              <span v-else>Masuk</span>
            </ion-button>
          </ion-card-content>
        </ion-card>

        <p class="footer-text">PT NEXT1 Indonesia &copy; {{ new Date().getFullYear() }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonContent, IonCard, IonCardContent, IonList, IonItem,
  IonInput, IonButton, IonSpinner, IonText, IonIcon,
} from '@ionic/vue'
import { useAuthStore } from '../stores/auth'
import { setupPushNotifications } from '../plugins/pushNotifications'
import { setupGps } from '../plugins/gps'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function doLogin() {
  if (!username.value || !password.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    await auth.login(username.value, password.value)
    await setupPushNotifications()
    setupGps()
    router.replace('/dashboard')
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.message || 'Login gagal. Periksa username dan password.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-content {
  --background: #0f2540;
}

.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 32px 16px;
}

.brand {
  text-align: center;
  margin-bottom: 32px;
}

.brand-logo {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: #f97316;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.logo-icon {
  font-size: 40px;
  color: white;
}

.brand-name {
  font-size: 28px;
  font-weight: 700;
  color: white;
  margin: 0 0 4px;
}

.brand-tagline {
  font-size: 14px;
  color: rgba(255,255,255,0.7);
  margin: 0;
}

.login-card {
  width: 100%;
  max-width: 400px;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

.input-item {
  margin-bottom: 8px;
  --border-radius: 8px;
  --background: #f5f5f5;
}

.login-button {
  margin-top: 20px;
  --border-radius: 10px;
  height: 48px;
  font-weight: 600;
}

.error-text {
  font-size: 13px;
  padding: 0 4px;
  margin: 8px 0 0;
}

.footer-text {
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  margin-top: 32px;
  text-align: center;
}
</style>
