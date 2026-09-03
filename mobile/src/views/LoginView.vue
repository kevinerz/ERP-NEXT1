<template>
  <ion-page>
    <ion-content class="login-content">
      <div class="login-wrapper">

        <!-- Brand -->
        <div class="brand-block">
          <div class="logo-ring">
            <!-- NEXT1 logo: N shape + arrow, hijau tua -->
            <svg viewBox="0 0 100 100" width="72" height="72">
              <!-- N left stroke (curved) -->
              <path d="M18 78 C14 60 16 40 22 22 C26 14 32 10 36 14 C40 18 44 30 46 42"
                    stroke="#166534" stroke-width="14" stroke-linecap="round" fill="none"/>
              <!-- N right stroke -->
              <path d="M46 42 C50 56 54 68 58 74 C62 80 68 80 72 74 C76 68 78 56 78 42"
                    stroke="rgba(255,255,255,0.9)" stroke-width="14" stroke-linecap="round" fill="none"/>
              <!-- Arrow up-right (dark segment) -->
              <path d="M58 74 L78 30" stroke="#166534" stroke-width="14" stroke-linecap="round" fill="none"/>
              <!-- Arrowhead -->
              <polygon points="78,30 64,28 76,18" fill="#166534"/>
            </svg>
          </div>
          <div class="brand-text">
            <div class="brand-name">my-NEXTtech</div>
            <div class="brand-tagline">NEXT<span class="brand-one">ONE</span> Field App</div>
          </div>
        </div>

        <!-- Card -->
        <div class="login-card">
          <div class="card-header">
            <h2>Masuk ke Akun</h2>
            <p>{{ isVendor ? 'Login vendor dengan username & PIN' : 'Gunakan kredensial teknisi Anda' }}</p>
          </div>

          <!-- Toggle Internal / Vendor -->
          <div class="type-toggle">
            <button class="type-btn" :class="{ active: !isVendor }" @click="isVendor = false; password = ''">
              Teknisi Internal
            </button>
            <button class="type-btn" :class="{ active: isVendor }" @click="isVendor = true; password = ''">
              Vendor / Pihak 3
            </button>
          </div>

          <div class="field-group">
            <div class="field-label">Username</div>
            <div class="field-wrap" :class="{ focused: userFocus }">
              <ion-icon :icon="personOutline" class="field-icon" />
              <ion-input
                v-model="username"
                placeholder="username"
                autocomplete="username"
                :disabled="loading"
                @ionFocus="userFocus = true"
                @ionBlur="userFocus = false"
                class="field-input"
              />
            </div>
          </div>

          <div class="field-group">
            <div class="field-label">{{ isVendor ? 'PIN' : 'Password' }}</div>
            <div class="field-wrap" :class="{ focused: passFocus }">
              <ion-icon :icon="lockClosedOutline" class="field-icon" />
              <ion-input
                v-model="password"
                type="password"
                :placeholder="isVendor ? '4-10 digit PIN' : 'password'"
                :autocomplete="isVendor ? 'off' : 'current-password'"
                :disabled="loading"
                @ionFocus="passFocus = true"
                @ionBlur="passFocus = false"
                @keyup.enter="doLogin"
                class="field-input"
              />
            </div>
          </div>

          <div class="error-box" v-if="errorMsg">
            <ion-icon :icon="alertCircleOutline" />
            {{ errorMsg }}
          </div>

          <button
            class="login-btn"
            :class="{ loading }"
            :disabled="loading || !username || !password"
            @click="doLogin"
          >
            <ion-spinner v-if="loading" name="crescent" style="color:#fff;width:20px;height:20px" />
            <span v-else>
              <ion-icon :icon="logInOutline" />
              Masuk
            </span>
          </button>
        </div>

        <div class="footer-text">PT NEXT1 Indonesia &copy; {{ new Date().getFullYear() }}</div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonPage, IonContent, IonInput, IonIcon, IonSpinner } from '@ionic/vue'
import { personOutline, lockClosedOutline, alertCircleOutline, logInOutline } from 'ionicons/icons'
import { useAuthStore } from '../stores/auth'
import { setupPushNotifications } from '../plugins/pushNotifications'
import { setupGps } from '../plugins/gps'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const userFocus = ref(false)
const passFocus = ref(false)
const isVendor = ref(false)

async function doLogin() {
  if (!username.value || !password.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    if (isVendor.value) {
      await auth.vendorLogin(username.value, password.value)
      router.replace('/instalasi')
    } else {
      await auth.login(username.value, password.value)
      await setupPushNotifications()
      setupGps()
      router.replace('/dashboard')
    }
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.message || 'Login gagal. Periksa username dan PIN/password.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-content {
  --background: linear-gradient(160deg, #14532d 0%, #16a34a 45%, #059669 100%);
}

.login-wrapper {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px 32px;
}

/* Brand */
.brand-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32px;
}

.logo-ring {
  width: 90px; height: 90px;
  background: rgba(255,255,255,0.12);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 0 0 8px rgba(255,255,255,0.07);
}

.brand-text { text-align: center; }
.brand-name {
  font-size: 26px; font-weight: 800; color: #fff;
  letter-spacing: 0.5px; line-height: 1;
}
.brand-tagline {
  font-size: 13px; color: rgba(255,255,255,0.75);
  margin-top: 4px; letter-spacing: 2px; text-transform: uppercase;
}
.brand-one { color: #4ade80; font-weight: 700; }

/* Card */
.login-card {
  width: 100%; max-width: 380px;
  background: #fff;
  border-radius: 24px;
  padding: 28px 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}

.card-header { margin-bottom: 24px; }
.card-header h2 { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 4px; }
.card-header p  { font-size: 13px; color: #6b7280; margin: 0; }

/* Fields */
.field-group { margin-bottom: 16px; }
.field-label { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }

.field-wrap {
  display: flex; align-items: center;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 0 12px;
  transition: border-color 0.2s;
  background: #f9fafb;
}
.field-wrap.focused { border-color: #16a34a; background: #fff; }
.field-icon { color: #9ca3af; font-size: 18px; flex-shrink: 0; margin-right: 8px; }
.field-wrap.focused .field-icon { color: #16a34a; }
.field-input { flex: 1; --color: #111827; --placeholder-color: #9ca3af; font-size: 15px; }

/* Type toggle */
.type-toggle {
  display: flex; border: 1.5px solid #e5e7eb; border-radius: 10px;
  overflow: hidden; margin-bottom: 20px;
}
.type-btn {
  flex: 1; padding: 9px 6px; border: none; background: #f9fafb;
  font-size: 13px; font-weight: 500; color: #6b7280; cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.type-btn.active { background: #16a34a; color: #fff; font-weight: 700; }

/* Error */
.error-box {
  display: flex; align-items: center; gap: 6px;
  background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 10px; padding: 10px 12px;
  color: #dc2626; font-size: 13px;
  margin-bottom: 16px;
}
.error-box ion-icon { font-size: 16px; flex-shrink: 0; }

/* Button */
.login-btn {
  width: 100%; height: 50px;
  background: linear-gradient(135deg, #16a34a 0%, #059669 100%);
  color: #fff; border: none; border-radius: 12px;
  font-size: 16px; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 4px 16px rgba(22,163,74,0.4);
  transition: opacity 0.2s, transform 0.1s;
}
.login-btn:active { transform: scale(0.98); }
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.login-btn ion-icon { font-size: 18px; }

.footer-text {
  color: rgba(255,255,255,0.45);
  font-size: 11px; margin-top: 28px;
}
</style>
