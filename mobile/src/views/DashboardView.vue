<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar color="primary">
        <ion-title>
          <div class="header-brand">
            <span class="hb-logo">N1</span>
            <div class="hb-text">
              <span class="hb-app">my-NEXTtech</span>
              <span class="hb-user">{{ auth.user?.nama_lengkap }}</span>
            </div>
          </div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="$router.push('/settings')">
            <ion-icon slot="icon-only" :icon="settingsOutline" />
          </ion-button>
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

      <!-- Hero Stats -->
      <div class="hero-stats">
        <div class="hero-bg" />

        <!-- Duty Toggle -->
        <div class="duty-row">
          <div class="duty-info">
            <ion-icon :icon="onDuty ? radioButtonOnOutline : radioButtonOffOutline" :class="onDuty ? 'duty-on' : 'duty-off'" />
            <span class="duty-label">{{ onDuty ? 'Sedang Bertugas' : 'Tidak Bertugas' }}</span>
          </div>
          <ion-toggle v-model="onDuty" @ionChange="onDutyChanged" color="success" class="duty-toggle" />
        </div>

        <!-- Stat Cards -->
        <div class="stat-row">
          <div class="stat-card">
            <div class="stat-num">{{ totalAktif }}</div>
            <div class="stat-lbl">Total Aktif</div>
            <ion-icon :icon="ticketOutline" class="stat-icon" />
          </div>
          <div class="stat-card warn">
            <div class="stat-num">{{ totalOpen }}</div>
            <div class="stat-lbl">Menunggu</div>
            <ion-icon :icon="timeOutline" class="stat-icon" />
          </div>
          <div class="stat-card info">
            <div class="stat-num">{{ totalInProgress }}</div>
            <div class="stat-lbl">Dikerjakan</div>
            <ion-icon :icon="constructOutline" class="stat-icon" />
          </div>
        </div>

        <!-- GPS Status -->
        <div class="gps-row" :class="{ active: gpsActive }">
          <ion-icon :icon="navigateOutline" class="gps-icon" />
          <span>GPS {{ gpsActive ? 'aktif — lokasi terkirim' : 'tidak aktif' }}</span>
          <span v-if="lastGpsTime" class="gps-time">{{ lastGpsTime }}</span>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="section-block">
        <div class="section-hdr">Menu Cepat</div>
        <div class="quick-grid">
          <button class="quick-btn" router-link="/tickets" @click="$router.push('/tickets')">
            <div class="qb-icon green">
              <ion-icon :icon="listOutline" />
            </div>
            <span>Tiket Saya</span>
          </button>
          <button class="quick-btn" @click="$router.push('/tickets?status=Open')">
            <div class="qb-icon orange">
              <ion-icon :icon="alertCircleOutline" />
            </div>
            <span>Open</span>
          </button>
          <button class="quick-btn" @click="$router.push('/tickets?status=In_Progress')">
            <div class="qb-icon blue">
              <ion-icon :icon="constructOutline" />
            </div>
            <span>Dikerjakan</span>
          </button>
          <button class="quick-btn" @click="sendGpsNow">
            <div class="qb-icon teal">
              <ion-icon :icon="navigateOutline" />
            </div>
            <span>Kirim GPS</span>
          </button>
        </div>
      </div>

      <!-- Active Tickets -->
      <div class="section-block">
        <div class="section-hdr-row">
          <span class="section-hdr">Tiket Aktif</span>
          <button class="see-all" @click="$router.push('/tickets')">Lihat Semua →</button>
        </div>

        <div v-if="ticketsStore.loading" class="center-spin">
          <ion-spinner name="crescent" color="primary" />
        </div>

        <div v-else-if="ticketsStore.tickets.length === 0" class="empty-state">
          <ion-icon :icon="checkmarkCircleOutline" />
          <p>Tidak ada tiket aktif</p>
        </div>

        <div v-else class="ticket-stack">
          <div
            v-for="ticket in ticketsStore.tickets.slice(0, 5)"
            :key="ticket.id_ticket"
            class="tcard"
            @click="$router.push(`/tickets/${ticket.id_ticket}`)"
          >
            <div class="tcard-left" :class="ticket.prioritas.toLowerCase()" />
            <div class="tcard-body">
              <div class="tcard-top">
                <span class="tcard-num">{{ ticket.nomor_tiket }}</span>
                <span class="tcard-status" :class="'s-' + ticket.status_tiket.replace('_','')">
                  {{ ticket.status_tiket.replace('_', ' ') }}
                </span>
              </div>
              <div class="tcard-title">{{ ticket.judul_tiket }}</div>
              <div class="tcard-sub">{{ ticket.site?.nama_site }} · {{ ticket.site?.nama_pelanggan }}</div>
            </div>
            <ion-icon :icon="chevronForwardOutline" class="tcard-chevron" />
          </div>
        </div>
      </div>

      <div style="height: 20px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonRefresher, IonRefresherContent, IonToggle, IonSpinner,
} from '@ionic/vue'
import {
  logOutOutline, radioButtonOnOutline, radioButtonOffOutline,
  ticketOutline, timeOutline, constructOutline, navigateOutline,
  listOutline, alertCircleOutline, checkmarkCircleOutline, chevronForwardOutline,
  settingsOutline,
} from 'ionicons/icons'
import { useAuthStore } from '../stores/auth'
import { useTicketsStore } from '../stores/tickets'
import { stopGps, setupGps, sendLocationNow } from '../plugins/gps'

const router = useRouter()
const auth = useAuthStore()
const ticketsStore = useTicketsStore()
const onDuty = ref(true)
const gpsActive = ref(false)
const lastGpsTime = ref('')

onMounted(async () => {
  await ticketsStore.fetchTickets()
})

const totalAktif     = computed(() => ticketsStore.tickets.length)
const totalOpen      = computed(() => ticketsStore.tickets.filter(t => t.status_tiket === 'Open').length)
const totalInProgress = computed(() => ticketsStore.tickets.filter(t => t.status_tiket === 'In_Progress').length)

function onDutyChanged() {
  if (onDuty.value) { setupGps(onGpsSuccess); gpsActive.value = true }
  else { stopGps(); gpsActive.value = false; lastGpsTime.value = '' }
}

function onGpsSuccess() {
  gpsActive.value = true
  const now = new Date()
  lastGpsTime.value = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
}

async function sendGpsNow() {
  const ok = await sendLocationNow()
  if (ok) onGpsSuccess()
}

async function doRefresh(event: any) {
  await ticketsStore.fetchTickets()
  event.target.complete()
}

function doLogout() {
  stopGps()
  auth.logout()
  router.replace('/login')
}
</script>

<style scoped>
/* ── Header ── */
.header-brand { display: flex; align-items: center; gap: 10px; }
.hb-logo {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 900; color: #fff; flex-shrink: 0;
}
.hb-text { display: flex; flex-direction: column; }
.hb-app  { font-size: 15px; font-weight: 700; color: #fff; line-height: 1; }
.hb-user { font-size: 11px; color: rgba(255,255,255,0.8); }

/* ── Hero ── */
.hero-stats {
  position: relative;
  padding: 16px 16px 20px;
  overflow: hidden;
}
.hero-bg {
  position: absolute; inset: 0;
  background: linear-gradient(160deg, #14532d 0%, #16a34a 60%, #059669 100%);
  z-index: 0;
}

/* Duty */
.duty-row {
  position: relative; z-index: 1;
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(255,255,255,0.12); border-radius: 12px;
  padding: 10px 14px; margin-bottom: 14px;
}
.duty-info { display: flex; align-items: center; gap: 8px; }
.duty-on  { color: #4ade80; font-size: 18px; }
.duty-off { color: rgba(255,255,255,0.5); font-size: 18px; }
.duty-label { font-size: 14px; font-weight: 600; color: #fff; }
.duty-toggle { --handle-background: #fff; }

/* Stat Cards */
.stat-row {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  margin-bottom: 12px;
}
.stat-card {
  background: rgba(255,255,255,0.15);
  border-radius: 14px; padding: 14px 10px;
  text-align: center; position: relative; overflow: hidden;
}
.stat-card.warn { background: rgba(245,158,11,0.3); }
.stat-card.info { background: rgba(59,130,246,0.3); }
.stat-num  { font-size: 30px; font-weight: 800; color: #fff; line-height: 1; }
.stat-lbl  { font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 2px; }
.stat-icon { position: absolute; bottom: 6px; right: 8px; font-size: 20px; color: rgba(255,255,255,0.2); }

/* GPS row */
.gps-row {
  position: relative; z-index: 1;
  display: flex; align-items: center; gap: 8px;
  background: rgba(0,0,0,0.2); border-radius: 10px;
  padding: 8px 12px; font-size: 12px; color: rgba(255,255,255,0.7);
}
.gps-row.active { background: rgba(74,222,128,0.15); color: #4ade80; }
.gps-icon { font-size: 16px; }
.gps-time { margin-left: auto; font-weight: 600; }

/* ── Sections ── */
.section-block { margin: 12px 12px 0; }
.section-hdr { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; }
.section-hdr-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.see-all { background: none; border: none; color: #16a34a; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; }

/* Quick Grid */
.quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.quick-btn {
  background: none; border: none; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 0;
}
.quick-btn span { font-size: 11px; font-weight: 600; color: #374151; }
.qb-icon {
  width: 52px; height: 52px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: #fff;
}
.qb-icon.green { background: linear-gradient(135deg, #16a34a, #059669); }
.qb-icon.orange { background: linear-gradient(135deg, #f97316, #ea580c); }
.qb-icon.blue   { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.qb-icon.teal   { background: linear-gradient(135deg, #0d9488, #0891b2); }

/* Ticket Stack */
.ticket-stack { display: flex; flex-direction: column; gap: 8px; }
.tcard {
  display: flex; align-items: center;
  background: #fff; border-radius: 14px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.07);
  overflow: hidden; cursor: pointer;
  transition: transform 0.1s;
}
.tcard:active { transform: scale(0.98); }
.tcard-left {
  width: 5px; align-self: stretch; flex-shrink: 0;
}
.tcard-left.critical { background: #ef4444; }
.tcard-left.high     { background: #f59e0b; }
.tcard-left.medium   { background: #16a34a; }
.tcard-left.low      { background: #9ca3af; }
.tcard-body { flex: 1; padding: 12px 10px; min-width: 0; }
.tcard-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tcard-num { font-size: 11px; color: #9ca3af; font-weight: 500; }
.tcard-status {
  font-size: 10px; font-weight: 700; padding: 2px 7px;
  border-radius: 20px;
}
.tcard-status.sOpen        { background: #fef3c7; color: #92400e; }
.tcard-status.sIn_Progress { background: #dbeafe; color: #1e40af; }
.tcard-status.sResolved    { background: #dcfce7; color: #14532d; }
.tcard-title { font-size: 14px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tcard-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tcard-chevron { font-size: 16px; color: #d1d5db; margin-right: 10px; flex-shrink: 0; }

.center-spin { display: flex; justify-content: center; padding: 32px; }
.empty-state { text-align: center; padding: 32px 16px; color: #9ca3af; }
.empty-state ion-icon { font-size: 40px; }
.empty-state p { margin: 8px 0 0; font-size: 14px; }
</style>
