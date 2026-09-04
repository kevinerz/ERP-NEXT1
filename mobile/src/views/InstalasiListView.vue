<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar color="primary">
        <ion-title>
          <div class="header-brand">
            <span class="hb-logo">N1</span>
            <div class="hb-text">
              <span class="hb-app">my-NEXTtech</span>
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

      <!-- Tabs -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: tab === 'instalasi' }" @click="tab = 'instalasi'">
          🔌 Instalasi
          <span v-if="store.list.length" class="tab-badge">{{ store.list.length }}</span>
        </button>
        <button class="tab-btn" :class="{ active: tab === 'gangguan' }" @click="tab = 'gangguan'">
          🔧 Gangguan
          <span v-if="store.tiketList.length" class="tab-badge">{{ store.tiketList.length }}</span>
        </button>
      </div>

      <div class="page-body">
        <div v-if="store.loading" class="loading-wrap">
          <ion-spinner name="crescent" color="success" />
          <p>Memuat...</p>
        </div>

        <!-- INSTALASI TAB -->
        <template v-else-if="tab === 'instalasi'">
          <div v-if="!store.list.length" class="empty-wrap">
            <ion-icon :icon="constructOutline" class="empty-icon" />
            <p>Belum ada tugas instalasi</p>
          </div>
          <div v-else class="task-list">
            <div
              v-for="item in store.list"
              :key="item.id_instalasi"
              class="task-card"
              @click="$router.push('/instalasi/' + item.id_instalasi)"
            >
              <div class="task-header">
                <span class="task-nomor">{{ item.nomor_instalasi }}</span>
                <span class="task-badge" :class="instStatusClass(item.status_instalasi)">
                  {{ instStatusLabel(item.status_instalasi) }}
                </span>
              </div>
              <div class="task-site">
                <ion-icon :icon="businessOutline" />
                {{ item.site?.nama_site }}
                <span class="task-sub">— {{ item.site?.pelanggan?.nama_pelanggan }}</span>
              </div>
              <div v-if="item.layanan" class="task-row">
                <ion-icon :icon="wifiOutline" />
                {{ item.layanan.nama_layanan }}
              </div>
              <div v-if="item.tgl_jadwal" class="task-row">
                <ion-icon :icon="calendarOutline" />
                Jadwal: {{ fmtDate(item.tgl_jadwal) }}
              </div>
            </div>
          </div>
        </template>

        <!-- GANGGUAN TAB -->
        <template v-else>
          <div v-if="!store.tiketList.length" class="empty-wrap">
            <ion-icon :icon="warningOutline" class="empty-icon" />
            <p>Belum ada tiket gangguan</p>
          </div>
          <div v-else class="task-list">
            <div
              v-for="item in store.tiketList"
              :key="item.id_ticket"
              class="task-card"
              @click="$router.push('/tiket/' + item.id_ticket)"
            >
              <div class="task-header">
                <span class="task-nomor">{{ item.nomor_tiket }}</span>
                <span class="task-badge" :class="tiketStatusClass(item.status_tiket)">
                  {{ item.status_tiket }}
                </span>
              </div>
              <div class="task-site">
                <ion-icon :icon="businessOutline" />
                {{ item.site?.nama_site }}
                <span class="task-sub">— {{ item.site?.pelanggan?.nama_pelanggan }}</span>
              </div>
              <div class="task-row judul">
                <ion-icon :icon="alertCircleOutline" />
                {{ item.judul_tiket }}
              </div>
              <div class="task-row">
                <ion-icon :icon="calendarOutline" />
                {{ fmtDate(item.tgl_open) }}
                <span class="prio" :class="item.prioritas.toLowerCase()">{{ item.prioritas }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue'
import {
  logOutOutline, constructOutline, businessOutline, wifiOutline,
  calendarOutline, warningOutline, alertCircleOutline,
} from 'ionicons/icons'
import { useAuthStore } from '../stores/auth'
import { useInstalasiStore } from '../stores/instalasi'

const router = useRouter()
const auth = useAuthStore()
const store = useInstalasiStore()
const tab = ref<'instalasi' | 'gangguan'>('instalasi')

onMounted(() => {
  store.fetchVendorTugas()
  store.fetchVendorTiket()
})

async function doRefresh(ev: any) {
  await Promise.all([store.fetchVendorTugas(), store.fetchVendorTiket()])
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

const INST_MAP: Record<string, { label: string; cls: string }> = {
  Draft:        { label: 'Draft',       cls: 'gray' },
  Dijadwalkan:  { label: 'Dijadwalkan', cls: 'blue' },
  Dalam_Proses: { label: 'Dikerjakan',  cls: 'yellow' },
  Selesai:      { label: 'Selesai',     cls: 'green' },
  Dibatalkan:   { label: 'Dibatalkan',  cls: 'red' },
}
function instStatusLabel(s: string) { return INST_MAP[s]?.label ?? s }
function instStatusClass(s: string) { return INST_MAP[s]?.cls ?? 'gray' }

const TIKET_STATUS: Record<string, string> = {
  Open: 'yellow', In_Progress: 'blue', Resolved: 'green', Closed: 'gray',
}
function tiketStatusClass(s: string) { return TIKET_STATUS[s] ?? 'gray' }
</script>

<style scoped>
.header-brand { display: flex; align-items: center; gap: 10px; }
.hb-logo { background: rgba(255,255,255,0.2); border-radius: 8px; padding: 4px 8px; font-weight: 900; font-size: 14px; }
.hb-text { display: flex; flex-direction: column; }
.hb-app { font-size: 14px; font-weight: 700; line-height: 1.2; }
.hb-user { font-size: 11px; opacity: 0.8; }

.tab-bar {
  display: flex; background: #fff;
  border-bottom: 2px solid #e5e7eb;
  position: sticky; top: 0; z-index: 10;
}
.tab-btn {
  flex: 1; padding: 12px 8px; border: none; background: none;
  font-size: 14px; font-weight: 600; color: #9ca3af; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -2px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: color 0.2s, border-color 0.2s;
}
.tab-btn.active { color: #16a34a; border-bottom-color: #16a34a; }
.tab-badge {
  background: #16a34a; color: #fff;
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px; min-width: 18px; text-align: center;
}

.page-body { padding: 16px; }

.loading-wrap, .empty-wrap {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 20px; gap: 12px; color: #9ca3af;
}
.empty-icon { font-size: 48px; }

.task-list { display: flex; flex-direction: column; gap: 12px; }

.task-card {
  background: #fff; border-radius: 14px; padding: 14px 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #f3f4f6;
  cursor: pointer; transition: transform 0.1s;
}
.task-card:active { transform: scale(0.98); }

.task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.task-nomor { font-size: 13px; font-weight: 700; color: #111827; }

.task-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px;
}
.task-badge.gray   { background: #f3f4f6; color: #6b7280; }
.task-badge.blue   { background: #dbeafe; color: #1d4ed8; }
.task-badge.yellow { background: #fef9c3; color: #854d0e; }
.task-badge.green  { background: #dcfce7; color: #15803d; }
.task-badge.red    { background: #fee2e2; color: #b91c1c; }

.task-site, .task-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: #374151; margin-bottom: 4px;
}
.task-site ion-icon, .task-row ion-icon { color: #9ca3af; font-size: 14px; flex-shrink: 0; }
.task-sub { color: #9ca3af; }
.task-row.judul { font-weight: 500; }

.prio {
  margin-left: auto; font-size: 11px; font-weight: 700;
  padding: 1px 7px; border-radius: 10px;
}
.prio.high, .prio.critical { background: #fee2e2; color: #b91c1c; }
.prio.medium { background: #fef9c3; color: #854d0e; }
.prio.low { background: #f3f4f6; color: #6b7280; }
</style>
