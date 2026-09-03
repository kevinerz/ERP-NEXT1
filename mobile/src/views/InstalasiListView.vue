<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar color="primary">
        <ion-title>
          <div class="header-brand">
            <span class="hb-logo">N1</span>
            <div class="hb-text">
              <span class="hb-app">Tugas Instalasi</span>
              <span class="hb-user">{{ auth.user?.nama_lengkap ?? auth.user?.username }}</span>
            </div>
          </div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="doLogout">
            <ion-icon slot="icon-only" :icon="logOutOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="doRefresh($event)">
        <ion-refresher-content pulling-icon="chevron-down-circle-outline" refreshing-spinner="crescent" />
      </ion-refresher>

      <div class="page-body">
        <!-- Loading -->
        <div v-if="store.loading" class="loading-wrap">
          <ion-spinner name="crescent" color="success" />
          <p>Memuat tugas...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="!store.list.length" class="empty-wrap">
          <ion-icon :icon="constructOutline" class="empty-icon" />
          <p>Belum ada tugas instalasi</p>
        </div>

        <!-- List -->
        <div v-else class="task-list">
          <div
            v-for="item in store.list"
            :key="item.id_instalasi"
            class="task-card"
            @click="$router.push('/instalasi/' + item.id_instalasi)"
          >
            <div class="task-header">
              <span class="task-nomor">{{ item.nomor_instalasi }}</span>
              <span class="task-badge" :class="statusClass(item.status_instalasi)">
                {{ statusLabel(item.status_instalasi) }}
              </span>
            </div>
            <div class="task-site">
              <ion-icon :icon="businessOutline" />
              {{ item.site?.nama_site }}
              <span class="task-pelanggan">— {{ item.site?.pelanggan?.nama_pelanggan }}</span>
            </div>
            <div v-if="item.layanan" class="task-layanan">
              <ion-icon :icon="wifiOutline" />
              {{ item.layanan.nama_layanan }}
            </div>
            <div v-if="item.tgl_jadwal" class="task-jadwal">
              <ion-icon :icon="calendarOutline" />
              Jadwal: {{ fmtDate(item.tgl_jadwal) }}
            </div>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue'
import { logOutOutline, constructOutline, businessOutline, wifiOutline, calendarOutline } from 'ionicons/icons'
import { useAuthStore } from '../stores/auth'
import { useInstalasiStore } from '../stores/instalasi'

const router = useRouter()
const auth = useAuthStore()
const store = useInstalasiStore()

onMounted(() => store.fetchVendorTugas())

async function doRefresh(ev: any) {
  await store.fetchVendorTugas()
  ev.target.complete()
}

function doLogout() {
  auth.logout()
  router.replace('/login')
}

function fmtDate(d?: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  Draft:        { label: 'Draft',       cls: 'gray' },
  Dijadwalkan:  { label: 'Dijadwalkan', cls: 'blue' },
  Dalam_Proses: { label: 'Dikerjakan',  cls: 'yellow' },
  Selesai:      { label: 'Selesai',     cls: 'green' },
  Dibatalkan:   { label: 'Dibatalkan',  cls: 'red' },
}
function statusLabel(s: string) { return STATUS_MAP[s]?.label ?? s }
function statusClass(s: string) { return STATUS_MAP[s]?.cls ?? 'gray' }
</script>

<style scoped>
.header-brand { display: flex; align-items: center; gap: 10px; }
.hb-logo { background: rgba(255,255,255,0.2); border-radius: 8px; padding: 4px 8px; font-weight: 900; font-size: 14px; }
.hb-text { display: flex; flex-direction: column; }
.hb-app { font-size: 14px; font-weight: 700; line-height: 1.2; }
.hb-user { font-size: 11px; opacity: 0.8; }

.page-body { padding: 16px; }

.loading-wrap, .empty-wrap {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 20px; gap: 12px; color: #9ca3af;
}
.empty-icon { font-size: 48px; }

.task-list { display: flex; flex-direction: column; gap: 12px; }

.task-card {
  background: #fff; border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  border: 1px solid #f3f4f6;
  cursor: pointer; transition: transform 0.1s;
}
.task-card:active { transform: scale(0.98); }

.task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.task-nomor { font-size: 13px; font-weight: 700; color: #111827; }

.task-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px;
}
.task-badge.gray   { background: #f3f4f6; color: #6b7280; }
.task-badge.blue   { background: #dbeafe; color: #1d4ed8; }
.task-badge.yellow { background: #fef9c3; color: #854d0e; }
.task-badge.green  { background: #dcfce7; color: #15803d; }
.task-badge.red    { background: #fee2e2; color: #b91c1c; }

.task-site, .task-layanan, .task-jadwal {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: #374151; margin-bottom: 4px;
}
.task-site ion-icon, .task-layanan ion-icon, .task-jadwal ion-icon {
  color: #9ca3af; font-size: 14px; flex-shrink: 0;
}
.task-pelanggan { color: #9ca3af; }
</style>
