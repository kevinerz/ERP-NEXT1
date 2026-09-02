<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/dashboard" text="" />
        </ion-buttons>
        <ion-title>Pengaturan</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="refreshAll">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">

      <!-- PROFIL TEKNISI -->
      <div class="profile-card">
        <div class="avatar">{{ initials }}</div>
        <div class="profile-info">
          <div class="profile-name">{{ auth.user?.nama_lengkap }}</div>
          <div class="profile-jabatan">{{ auth.user?.jabatan || 'Teknisi' }}</div>
          <div class="profile-dept">{{ auth.user?.departemen || '' }}</div>
        </div>
      </div>

      <!-- GPS STATUS REALTIME -->
      <div class="section-label">Status GPS</div>
      <div class="gps-card">
        <div class="gps-status-row">
          <div class="gps-status-left">
            <div class="gps-dot-wrap">
              <div class="gps-dot-big" :class="{ active: gpsOk, error: gpsError }" />
            </div>
            <div>
              <div class="gps-status-title">{{ gpsStatus }}</div>
              <div v-if="lastCoords" class="gps-coords">{{ lastCoords }}</div>
              <div v-if="lastSent" class="gps-lastsent">Terakhir terkirim: {{ lastSent }}</div>
            </div>
          </div>
          <ion-button size="small" fill="outline" color="success" @click="sendGpsNow" :disabled="gpsLoading">
            <ion-spinner v-if="gpsLoading" name="crescent" style="width:14px;height:14px" />
            <span v-else>Kirim Sekarang</span>
          </ion-button>
        </div>
      </div>

      <!-- IZIN APLIKASI -->
      <div class="section-label">Izin Aplikasi</div>
      <div class="perm-list">

        <!-- Lokasi GPS -->
        <div class="perm-item">
          <div class="perm-icon-wrap loc">
            <ion-icon :icon="locationOutline" />
          </div>
          <div class="perm-body">
            <div class="perm-name">Lokasi (GPS)</div>
            <div class="perm-desc">Tracking posisi teknisi saat bertugas</div>
          </div>
          <div class="perm-right">
            <span class="perm-badge" :class="badgeClass(perms.location)">{{ permLabel(perms.location) }}</span>
            <ion-button size="small" fill="clear" :color="perms.location === 'granted' ? 'medium' : 'primary'" @click="requestPerm('location')">
              {{ perms.location === 'granted' ? '✓' : 'Izinkan' }}
            </ion-button>
          </div>
        </div>

        <!-- Kamera -->
        <div class="perm-item">
          <div class="perm-icon-wrap cam">
            <ion-icon :icon="cameraOutline" />
          </div>
          <div class="perm-body">
            <div class="perm-name">Kamera</div>
            <div class="perm-desc">Foto kondisi sebelum & sesudah pekerjaan</div>
          </div>
          <div class="perm-right">
            <span class="perm-badge" :class="badgeClass(perms.camera)">{{ permLabel(perms.camera) }}</span>
            <ion-button size="small" fill="clear" :color="perms.camera === 'granted' ? 'medium' : 'primary'" @click="requestPerm('camera')">
              {{ perms.camera === 'granted' ? '✓' : 'Izinkan' }}
            </ion-button>
          </div>
        </div>

        <!-- Foto / Gallery -->
        <div class="perm-item">
          <div class="perm-icon-wrap photo">
            <ion-icon :icon="imagesOutline" />
          </div>
          <div class="perm-body">
            <div class="perm-name">Galeri Foto</div>
            <div class="perm-desc">Menyimpan dan membaca foto dari album</div>
          </div>
          <div class="perm-right">
            <span class="perm-badge" :class="badgeClass(perms.photos)">{{ permLabel(perms.photos) }}</span>
            <ion-button size="small" fill="clear" :color="perms.photos === 'granted' ? 'medium' : 'primary'" @click="requestPerm('photos')">
              {{ perms.photos === 'granted' ? '✓' : 'Izinkan' }}
            </ion-button>
          </div>
        </div>

        <!-- Notifikasi -->
        <div class="perm-item">
          <div class="perm-icon-wrap notif">
            <ion-icon :icon="notificationsOutline" />
          </div>
          <div class="perm-body">
            <div class="perm-name">Notifikasi</div>
            <div class="perm-desc">Pemberitahuan tiket baru yang di-assign</div>
          </div>
          <div class="perm-right">
            <span class="perm-badge" :class="badgeClass(perms.notifications)">{{ permLabel(perms.notifications) }}</span>
            <ion-button size="small" fill="clear" :color="perms.notifications === 'granted' ? 'medium' : 'primary'" @click="requestPerm('notifications')">
              {{ perms.notifications === 'granted' ? '✓' : 'Izinkan' }}
            </ion-button>
          </div>
        </div>

        <!-- Dering / Audio -->
        <div class="perm-item">
          <div class="perm-icon-wrap audio">
            <ion-icon :icon="volumeHighOutline" />
          </div>
          <div class="perm-body">
            <div class="perm-name">Dering & Audio</div>
            <div class="perm-desc">Suara dering untuk fitur telepon & chat</div>
          </div>
          <div class="perm-right">
            <span class="perm-badge badge-ok">Aktif</span>
            <span style="font-size:18px;padding:4px 8px;color:#16a34a">✓</span>
          </div>
        </div>

      </div>

      <!-- BANNER BANTUAN jika ada yang ditolak -->
      <div v-if="anyDenied" class="denied-banner">
        <ion-icon :icon="informationCircleOutline" />
        <div>
          <div class="denied-title">Ada izin yang ditolak</div>
          <div class="denied-desc">Buka <strong>Pengaturan HP → Aplikasi → myNEXTtech → Izin</strong> untuk mengaktifkan secara manual.</div>
        </div>
        <ion-button size="small" fill="solid" color="warning" @click="openDeviceSettings">
          Buka Pengaturan
        </ion-button>
      </div>

      <!-- INFO APLIKASI -->
      <div class="section-label">Informasi Aplikasi</div>
      <div class="info-card">
        <div class="info-row"><span class="info-key">Aplikasi</span><span class="info-val">myNEXTtech</span></div>
        <div class="info-row"><span class="info-key">Versi</span><span class="info-val">1.0.0</span></div>
        <div class="info-row"><span class="info-key">Server</span><span class="info-val">{{ apiBase }}</span></div>
        <div class="info-row"><span class="info-key">Platform</span><span class="info-val">{{ platform }}</span></div>
        <div class="info-row"><span class="info-key">User ID</span><span class="info-val">{{ auth.user?.id_user }}</span></div>
      </div>

      <!-- TOMBOL KELUAR -->
      <div class="logout-wrap">
        <ion-button expand="block" color="danger" fill="outline" @click="doLogout">
          <ion-icon slot="start" :icon="logOutOutline" /> Keluar dari Akun
        </ion-button>
      </div>

      <div style="height:32px" />
    </ion-content>

    <!-- Toast -->
    <ion-toast
      :is-open="toast.open"
      :message="toast.msg"
      :color="toast.color"
      :duration="2600"
      position="top"
      @didDismiss="toast.open = false"
    />

    <!-- Alert jika denied -->
    <ion-alert
      :is-open="showDeniedAlert"
      header="Izin Ditolak"
      :message="deniedAlertMsg"
      :buttons="[{ text: 'Mengerti', role: 'cancel' }]"
      @didDismiss="showDeniedAlert = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonButton, IonContent, IonIcon, IonSpinner, IonToast, IonAlert,
} from '@ionic/vue'
import {
  refreshOutline, locationOutline, cameraOutline, imagesOutline,
  notificationsOutline, informationCircleOutline, logOutOutline, volumeHighOutline,
} from 'ionicons/icons'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { Camera } from '@capacitor/camera'
import { PushNotifications } from '@capacitor/push-notifications'

import { useAuthStore } from '../stores/auth'
import { sendLocationNow, stopGps } from '../plugins/gps'
import api from '../services/api'

const router = useRouter()
const auth = useAuthStore()

type PermState = 'granted' | 'denied' | 'prompt' | 'unavailable' | 'checking'

const perms = ref({
  location: 'checking' as PermState,
  camera: 'checking' as PermState,
  photos: 'checking' as PermState,
  notifications: 'checking' as PermState,
})

const gpsOk = ref(false)
const gpsError = ref(false)
const gpsLoading = ref(false)
const lastCoords = ref('')
const lastSent = ref('')
const gpsStatus = ref('Belum aktif')

const toast = ref({ open: false, msg: '', color: 'success' })
const showDeniedAlert = ref(false)
const deniedAlertMsg = ref('')

const platform = Capacitor.getPlatform()
const apiBase = import.meta.env.VITE_API_URL || 'https://1erp.nextone.id/api'

const initials = computed(() => {
  const n = auth.user?.nama_lengkap || ''
  return n.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')
})

const anyDenied = computed(() =>
  Object.values(perms.value).some(v => v === 'denied')
)

function permLabel(s: PermState) {
  return { granted: 'Diizinkan', denied: 'Ditolak', prompt: 'Belum Diset', unavailable: 'N/A', checking: '...' }[s] ?? s
}
function badgeClass(s: PermState) {
  return { granted: 'badge-ok', denied: 'badge-deny', prompt: 'badge-prompt', unavailable: 'badge-na', checking: 'badge-prompt' }[s] ?? ''
}

async function checkAllPermissions() {
  if (!Capacitor.isNativePlatform()) {
    perms.value = { location: 'unavailable', camera: 'unavailable', photos: 'unavailable', notifications: 'unavailable' }
    return
  }

  // Location
  try {
    const r = await Geolocation.checkPermissions()
    const ls = r.location === 'granted' || r.coarseLocation === 'granted' ? 'granted' : r.location
    perms.value.location = (ls as PermState)
  } catch { perms.value.location = 'unavailable' }

  // Camera & Photos
  try {
    const r = await Camera.checkPermissions()
    perms.value.camera = r.camera as PermState
    perms.value.photos = (r.photos as PermState) ?? 'unavailable'
  } catch { perms.value.camera = 'unavailable'; perms.value.photos = 'unavailable' }

  // Push Notifications
  try {
    const r = await PushNotifications.checkPermissions()
    perms.value.notifications = r.receive as PermState
  } catch { perms.value.notifications = 'unavailable' }
}

async function requestPerm(type: 'location' | 'camera' | 'photos' | 'notifications') {
  if (!Capacitor.isNativePlatform()) {
    showToast('Fitur ini hanya tersedia di perangkat Android/iOS', 'warning')
    return
  }

  try {
    if (type === 'location') {
      const r = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] })
      const ok = r.location === 'granted' || r.coarseLocation === 'granted'
      perms.value.location = ok ? 'granted' : 'denied'
      if (!ok) showDenied('Lokasi (GPS)')
      else showToast('Izin lokasi berhasil diberikan')
    }
    else if (type === 'camera') {
      const r = await Camera.requestPermissions({ permissions: ['camera'] })
      perms.value.camera = r.camera as PermState
      if (r.camera !== 'granted') showDenied('Kamera')
      else showToast('Izin kamera berhasil diberikan')
    }
    else if (type === 'photos') {
      const r = await Camera.requestPermissions({ permissions: ['photos'] })
      perms.value.photos = (r.photos ?? 'denied') as PermState
      if (r.photos !== 'granted') showDenied('Galeri Foto')
      else showToast('Izin galeri berhasil diberikan')
    }
    else if (type === 'notifications') {
      const r = await PushNotifications.requestPermissions()
      perms.value.notifications = r.receive as PermState
      if (r.receive !== 'granted') showDenied('Notifikasi')
      else {
        showToast('Izin notifikasi berhasil diberikan')
        await PushNotifications.register()
      }
    }
  } catch (e: any) {
    showToast('Gagal meminta izin: ' + (e?.message || 'Unknown'), 'danger')
    await checkAllPermissions()
  }
}

function showDenied(name: string) {
  deniedAlertMsg.value = `Izin "${name}" ditolak. Untuk mengaktifkan, buka:\n\nPengaturan HP → Aplikasi → myNEXTtech → Izin → Aktifkan "${name}"`
  showDeniedAlert.value = true
}

function openDeviceSettings() {
  deniedAlertMsg.value = 'Buka Pengaturan HP → Aplikasi → myNEXTtech → Izin, lalu aktifkan izin yang diperlukan.'
  showDeniedAlert.value = true
}

async function sendGpsNow() {
  if (!Capacitor.isNativePlatform()) {
    showToast('GPS hanya tersedia di perangkat Android/iOS', 'warning')
    return
  }
  gpsLoading.value = true
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })
    const { latitude, longitude, accuracy } = pos.coords
    lastCoords.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)} ±${Math.round(accuracy)}m`

    await api.post('/mobile/lokasi', {
      latitude,
      longitude,
      akurasi: Math.round(accuracy),
    })
    const now = new Date()
    lastSent.value = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`
    gpsOk.value = true
    gpsError.value = false
    gpsStatus.value = 'GPS aktif'
    showToast(`Lokasi terkirim: ${lastCoords.value}`, 'success')
  } catch (e: any) {
    gpsOk.value = false
    gpsError.value = true
    gpsStatus.value = 'GPS gagal'
    const msg = e?.message?.includes('User denied') ? 'Izin GPS ditolak' :
                e?.message?.includes('timeout') ? 'Timeout, coba di tempat terbuka' :
                'Gagal mendapat lokasi'
    showToast(msg, 'danger')
  } finally {
    gpsLoading.value = false
  }
}

function showToast(msg: string, color: 'success' | 'danger' | 'warning' = 'success') {
  toast.value = { open: true, msg, color }
}

async function refreshAll() {
  await checkAllPermissions()
  showToast('Status izin diperbarui')
}

function doLogout() {
  stopGps()
  auth.logout()
  router.replace('/login')
}

onMounted(checkAllPermissions)
</script>

<style scoped>
/* PROFILE CARD */
.profile-card {
  display: flex; align-items: center; gap: 16px;
  background: linear-gradient(135deg, #14532d, #16a34a);
  padding: 24px 20px; color: #fff;
}
.avatar {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(255,255,255,0.25);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 800; flex-shrink: 0; letter-spacing: 1px;
}
.profile-name { font-size: 17px; font-weight: 800; margin-bottom: 2px; }
.profile-jabatan { font-size: 13px; opacity: 0.85; }
.profile-dept { font-size: 11px; opacity: 0.6; margin-top: 1px; }

/* SECTION LABEL */
.section-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: #6b7280;
  padding: 18px 16px 6px;
}

/* GPS CARD */
.gps-card {
  margin: 0 12px; background: #fff; border-radius: 14px;
  padding: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.07);
}
.gps-status-row { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.gps-status-left { display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 0; }
.gps-dot-wrap { padding-top: 3px; }
.gps-dot-big {
  width: 14px; height: 14px; border-radius: 50%;
  background: #d1d5db; flex-shrink: 0;
  transition: background 0.3s;
}
.gps-dot-big.active {
  background: #16a34a;
  animation: gpsPulse 1.5s infinite;
}
.gps-dot-big.error { background: #ef4444; }
@keyframes gpsPulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.4); }
  50% { box-shadow: 0 0 0 7px rgba(22,163,74,0); }
}
.gps-status-title { font-size: 14px; font-weight: 700; color: #111827; }
.gps-coords { font-size: 11px; color: #16a34a; font-family: monospace; margin-top: 2px; }
.gps-lastsent { font-size: 11px; color: #9ca3af; margin-top: 1px; }

/* PERMISSION LIST */
.perm-list {
  margin: 0 12px;
  background: #fff; border-radius: 14px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.07);
  overflow: hidden;
}
.perm-item {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #f3f4f6;
}
.perm-item:last-child { border-bottom: none; }

.perm-icon-wrap {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}
.perm-icon-wrap.loc   { background: #ecfdf5; color: #16a34a; }
.perm-icon-wrap.cam   { background: #eff6ff; color: #1d4ed8; }
.perm-icon-wrap.photo { background: #fdf4ff; color: #9333ea; }
.perm-icon-wrap.notif  { background: #fff7ed; color: #c2410c; }
.perm-icon-wrap.audio  { background: #f0fdf4; color: #059669; }

.perm-body { flex: 1; min-width: 0; }
.perm-name { font-size: 14px; font-weight: 600; color: #111827; }
.perm-desc { font-size: 11px; color: #9ca3af; margin-top: 1px; }

.perm-right {
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0;
}
.perm-badge {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
}
.badge-ok     { background: #dcfce7; color: #15803d; }
.badge-deny   { background: #fee2e2; color: #dc2626; }
.badge-prompt { background: #fef9c3; color: #a16207; }
.badge-na     { background: #f1f5f9; color: #64748b; }

/* DENIED BANNER */
.denied-banner {
  margin: 12px; background: #fffbeb; border: 1px solid #fde68a;
  border-radius: 12px; padding: 14px; display: flex; gap: 10px;
  align-items: flex-start;
}
.denied-banner ion-icon { font-size: 22px; color: #d97706; flex-shrink: 0; margin-top: 1px; }
.denied-title { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 3px; }
.denied-desc { font-size: 12px; color: #78350f; line-height: 1.5; }
.denied-banner ion-button { flex-shrink: 0; align-self: flex-start; --border-radius: 8px; }

/* APP INFO */
.info-card {
  margin: 0 12px; background: #fff; border-radius: 14px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.07); overflow: hidden;
}
.info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #f3f4f6;
}
.info-row:last-child { border-bottom: none; }
.info-key { font-size: 13px; color: #6b7280; }
.info-val { font-size: 13px; font-weight: 600; color: #111827; text-align: right; max-width: 60%; word-break: break-all; }

/* LOGOUT */
.logout-wrap { padding: 20px 12px 8px; }
</style>
