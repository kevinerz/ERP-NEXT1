<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>
          <div class="header-title">
            <span class="app-name">my-NEXTtech</span>
            <span class="welcome">Selamat datang, {{ auth.user?.nama_lengkap }}</span>
          </div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button @click="doLogout">
            <ion-icon slot="icon-only" name="log-out-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="doRefresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <!-- On-Duty Toggle -->
      <div class="duty-bar">
        <span>Status Tugas</span>
        <ion-toggle v-model="onDuty" @ionChange="onDutyChanged" color="success">
          {{ onDuty ? 'Aktif' : 'Tidak Aktif' }}
        </ion-toggle>
      </div>

      <!-- Summary Cards -->
      <div class="summary-grid ion-padding-horizontal">
        <ion-card class="summary-card" color="primary">
          <ion-card-content>
            <div class="stat-number">{{ totalAktif }}</div>
            <div class="stat-label">Total Tiket Saya</div>
          </ion-card-content>
        </ion-card>

        <ion-card class="summary-card" color="warning">
          <ion-card-content>
            <div class="stat-number">{{ totalOpen }}</div>
            <div class="stat-label">Menunggu</div>
          </ion-card-content>
        </ion-card>

        <ion-card class="summary-card" color="success">
          <ion-card-content>
            <div class="stat-number">{{ totalInProgress }}</div>
            <div class="stat-label">Dikerjakan</div>
          </ion-card-content>
        </ion-card>
      </div>

      <!-- Active Ticket List -->
      <div class="section-header ion-padding-horizontal">
        <h2>Tiket Aktif</h2>
        <ion-button fill="clear" size="small" router-link="/tickets">Lihat Semua</ion-button>
      </div>

      <div v-if="ticketsStore.loading" class="center-spinner">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <div v-else-if="ticketsStore.tickets.length === 0" class="empty-state">
        <ion-icon name="checkmark-circle-outline" />
        <p>Tidak ada tiket aktif</p>
      </div>

      <ion-list v-else class="ticket-list">
        <ion-item
          v-for="ticket in ticketsStore.tickets"
          :key="ticket.id_ticket"
          button
          :router-link="`/tickets/${ticket.id_ticket}`"
          detail
          class="ticket-item"
        >
          <div slot="start" class="priority-indicator" :class="ticket.prioritas.toLowerCase()" />
          <ion-label>
            <div class="ticket-header">
              <ion-chip :color="priorityColor(ticket.prioritas)" class="priority-chip" size="small">
                {{ ticket.prioritas }}
              </ion-chip>
              <span class="ticket-number">{{ ticket.nomor_tiket }}</span>
            </div>
            <h2 class="ticket-title">{{ ticket.judul_tiket }}</h2>
            <p class="ticket-site">{{ ticket.site?.nama_site }} &mdash; {{ ticket.site?.nama_pelanggan }}</p>
            <div class="ticket-footer">
              <ion-badge :color="statusColor(ticket.status_tiket)">{{ ticket.status_tiket }}</ion-badge>
              <span class="ticket-time">{{ timeAgo(ticket.tgl_open) }}</span>
            </div>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonRefresher, IonRefresherContent, IonToggle, IonCard, IonCardContent,
  IonList, IonItem, IonLabel, IonChip, IonBadge, IonSpinner,
} from '@ionic/vue'
import { useAuthStore } from '../stores/auth'
import { useTicketsStore } from '../stores/tickets'
import { stopGps, setupGps } from '../plugins/gps'

const router = useRouter()
const auth = useAuthStore()
const ticketsStore = useTicketsStore()
const onDuty = ref(true)

onMounted(() => ticketsStore.fetchTickets())

const totalAktif = computed(() => ticketsStore.tickets.length)
const totalOpen = computed(() => ticketsStore.tickets.filter(t => t.status_tiket === 'Open').length)
const totalInProgress = computed(() => ticketsStore.tickets.filter(t => t.status_tiket === 'In_Progress').length)

function priorityColor(p: string) {
  const map: Record<string, string> = { Critical: 'danger', High: 'warning', Medium: 'primary', Low: 'medium' }
  return map[p] ?? 'medium'
}

function statusColor(s: string) {
  const map: Record<string, string> = { Open: 'warning', In_Progress: 'primary', Resolved: 'success', Closed: 'medium' }
  return map[s] ?? 'medium'
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return `${Math.floor(diff / 60000)} mnt lalu`
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

async function doRefresh(event: any) {
  await ticketsStore.fetchTickets()
  event.target.complete()
}

function onDutyChanged() {
  if (onDuty.value) setupGps()
  else stopGps()
}

function doLogout() {
  stopGps()
  auth.logout()
  router.replace('/login')
}
</script>

<style scoped>
.header-title {
  display: flex;
  flex-direction: column;
}
.app-name { font-size: 16px; font-weight: 700; }
.welcome { font-size: 11px; opacity: 0.8; }

.duty-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--ion-color-light);
  font-size: 14px;
  font-weight: 500;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding-top: 12px;
}

.summary-card {
  margin: 0;
  text-align: center;
  border-radius: 12px;
}
.summary-card ion-card-content { padding: 12px 4px; }
.stat-number { font-size: 28px; font-weight: 700; }
.stat-label { font-size: 11px; opacity: 0.9; margin-top: 2px; }

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
}
.section-header h2 { font-size: 16px; font-weight: 600; margin: 0; }

.center-spinner {
  display: flex;
  justify-content: center;
  padding: 32px;
}

.empty-state {
  text-align: center;
  padding: 40px 16px;
  color: var(--ion-color-medium);
}
.empty-state ion-icon { font-size: 48px; }

.ticket-list { padding: 0 8px; }

.ticket-item { --border-radius: 10px; margin-bottom: 8px; }

.priority-indicator {
  width: 4px;
  height: 48px;
  border-radius: 4px;
  margin-right: 4px;
}
.priority-indicator.critical { background: var(--ion-color-danger); }
.priority-indicator.high     { background: var(--ion-color-warning); }
.priority-indicator.medium   { background: var(--ion-color-primary); }
.priority-indicator.low      { background: var(--ion-color-medium); }

.ticket-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.priority-chip { height: 18px; font-size: 10px; }
.ticket-number { font-size: 11px; color: var(--ion-color-medium); }
.ticket-title { font-size: 14px; font-weight: 600; margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ticket-site { font-size: 12px; color: var(--ion-color-medium); margin: 2px 0; }
.ticket-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.ticket-time { font-size: 11px; color: var(--ion-color-medium); }
</style>
