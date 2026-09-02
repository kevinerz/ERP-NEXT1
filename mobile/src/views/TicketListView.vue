<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/dashboard" text="" />
        </ion-buttons>
        <ion-title>Tiket Saya</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="doRefreshManual">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="doRefresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <!-- Filter Tabs -->
      <div class="filter-bar">
        <button
          v-for="tab in tabs" :key="tab.value"
          class="tab-btn"
          :class="{ active: selectedSegment === tab.value }"
          @click="setTab(tab.value)"
        >
          <span class="tab-count" v-if="tab.count !== undefined">{{ tab.count }}</span>
          {{ tab.label }}
        </button>
      </div>

      <!-- Search -->
      <div class="search-wrap">
        <ion-icon :icon="searchOutline" class="search-icon" />
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="Cari tiket, site, pelanggan..."
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
          <ion-icon :icon="closeOutline" />
        </button>
      </div>

      <!-- Loading -->
      <div v-if="ticketsStore.loading" class="center-spinner">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <!-- Empty -->
      <div v-else-if="filtered.length === 0" class="empty-state">
        <div class="empty-icon-wrap">
          <ion-icon :icon="ticketOutline" />
        </div>
        <p class="empty-title">Tidak ada tiket</p>
        <p class="empty-sub">{{ searchQuery ? 'Coba kata kunci lain' : 'Belum ada tiket yang di-assign' }}</p>
      </div>

      <!-- Ticket Cards -->
      <div v-else class="card-list">
        <div
          v-for="ticket in filtered"
          :key="ticket.id_ticket"
          class="tcard"
          @click="$router.push(`/tickets/${ticket.id_ticket}`)"
        >
          <!-- Priority stripe -->
          <div class="tcard-stripe" :class="ticket.prioritas.toLowerCase()" />

          <div class="tcard-main">
            <div class="tcard-row1">
              <span class="tcard-nomor">{{ ticket.nomor_tiket }}</span>
              <span class="tcard-status" :class="'s-' + ticket.status_tiket.replace('_','')">
                {{ ticket.status_tiket.replace('_', ' ') }}
              </span>
            </div>
            <div class="tcard-judul">{{ ticket.judul_tiket }}</div>
            <div class="tcard-site">
              <ion-icon :icon="locationOutline" class="site-icon" />
              {{ ticket.site?.nama_site }} · {{ ticket.site?.nama_pelanggan }}
            </div>
            <div class="tcard-row3">
              <span class="tcard-priority" :class="ticket.prioritas.toLowerCase()">
                <ion-icon :icon="priorityIcon(ticket.prioritas)" />
                {{ ticket.prioritas }}
              </span>
              <span class="tcard-time">
                <ion-icon :icon="timeOutline" />
                {{ timeAgo(ticket.tgl_open) }}
              </span>
            </div>
          </div>

          <ion-icon :icon="chevronForwardOutline" class="tcard-arrow" />
        </div>
      </div>

      <div style="height:16px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton,
  IonContent, IonRefresher, IonRefresherContent, IonSpinner, IonIcon,
} from '@ionic/vue'
import {
  refreshOutline, searchOutline, closeOutline, ticketOutline,
  locationOutline, timeOutline, chevronForwardOutline,
  flameOutline, arrowUpCircleOutline, removeCircleOutline, arrowDownCircleOutline,
} from 'ionicons/icons'
import { useTicketsStore } from '../stores/tickets'

const ticketsStore = useTicketsStore()
const selectedSegment = ref('')
const searchQuery = ref('')

onMounted(() => ticketsStore.fetchTickets())

const tabs = computed(() => [
  { label: 'Semua',     value: '',           count: ticketsStore.tickets.length },
  { label: 'Open',      value: 'Open',       count: ticketsStore.tickets.filter(t => t.status_tiket === 'Open').length },
  { label: 'Dikerjakan',value: 'In_Progress',count: ticketsStore.tickets.filter(t => t.status_tiket === 'In_Progress').length },
  { label: 'Selesai',   value: 'Resolved',   count: undefined },
])

const filtered = computed(() => {
  let list = ticketsStore.tickets
  if (selectedSegment.value) list = list.filter(t => t.status_tiket === selectedSegment.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(t =>
      t.judul_tiket.toLowerCase().includes(q) ||
      t.nomor_tiket.toLowerCase().includes(q) ||
      t.site?.nama_site?.toLowerCase().includes(q) ||
      t.site?.nama_pelanggan?.toLowerCase().includes(q)
    )
  }
  return list
})

function setTab(v: string) {
  selectedSegment.value = v
  ticketsStore.fetchTickets(v || undefined)
}

function priorityIcon(p: string) {
  const m: Record<string, any> = { Critical: flameOutline, High: arrowUpCircleOutline, Medium: removeCircleOutline, Low: arrowDownCircleOutline }
  return m[p] ?? removeCircleOutline
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return `${Math.floor(diff / 60000)} mnt lalu`
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

async function doRefresh(event: any) {
  await ticketsStore.fetchTickets(selectedSegment.value || undefined)
  event.target.complete()
}

async function doRefreshManual() {
  await ticketsStore.fetchTickets(selectedSegment.value || undefined)
}
</script>

<style scoped>
/* Filter Tabs */
.filter-bar {
  display: flex; gap: 8px; padding: 12px 12px 0;
  overflow-x: auto; scrollbar-width: none;
}
.filter-bar::-webkit-scrollbar { display: none; }

.tab-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 20px; border: none;
  background: #f3f4f6; color: #6b7280;
  font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active { background: #16a34a; color: #fff; }
.tab-count {
  background: rgba(0,0,0,0.12); border-radius: 10px;
  padding: 1px 6px; font-size: 11px; font-weight: 700;
}
.tab-btn.active .tab-count { background: rgba(255,255,255,0.25); }

/* Search */
.search-wrap {
  display: flex; align-items: center; gap: 8px;
  margin: 10px 12px 8px;
  background: #f3f4f6; border-radius: 12px;
  padding: 0 12px; border: 2px solid transparent;
}
.search-icon { font-size: 18px; color: #9ca3af; flex-shrink: 0; }
.search-input {
  flex: 1; border: none; background: none; outline: none;
  font-size: 14px; color: #111827; padding: 10px 0;
}
.search-clear {
  background: none; border: none; color: #9ca3af; cursor: pointer;
  display: flex; align-items: center; padding: 0;
  font-size: 18px;
}

/* Loading / Empty */
.center-spinner { display: flex; justify-content: center; padding: 40px; }
.empty-state { text-align: center; padding: 48px 24px; }
.empty-icon-wrap {
  width: 72px; height: 72px; border-radius: 20px;
  background: #f0fdf4; display: flex; align-items: center; justify-content: center;
  margin: 0 auto 16px;
}
.empty-icon-wrap ion-icon { font-size: 36px; color: #16a34a; }
.empty-title { font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 4px; }
.empty-sub   { font-size: 13px; color: #9ca3af; margin: 0; }

/* Ticket Cards */
.card-list { display: flex; flex-direction: column; gap: 8px; padding: 4px 12px 0; }

.tcard {
  display: flex; align-items: stretch;
  background: #fff; border-radius: 16px;
  box-shadow: 0 1px 8px rgba(0,0,0,0.08);
  overflow: hidden; cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}
.tcard:active { transform: scale(0.985); box-shadow: 0 1px 4px rgba(0,0,0,0.06); }

.tcard-stripe { width: 5px; flex-shrink: 0; }
.tcard-stripe.critical { background: #ef4444; }
.tcard-stripe.high     { background: #f59e0b; }
.tcard-stripe.medium   { background: #16a34a; }
.tcard-stripe.low      { background: #9ca3af; }

.tcard-main { flex: 1; padding: 12px 8px 12px 12px; min-width: 0; }

.tcard-row1 { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
.tcard-nomor { font-size: 11px; color: #9ca3af; font-weight: 500; font-family: monospace; }

.tcard-status {
  font-size: 10px; font-weight: 700;
  padding: 2px 8px; border-radius: 20px;
}
.tcard-status.sOpen        { background: #fef3c7; color: #92400e; }
.tcard-status.sIn_Progress { background: #dbeafe; color: #1e40af; }
.tcard-status.sResolved    { background: #dcfce7; color: #14532d; }
.tcard-status.sClosed      { background: #f3f4f6; color: #6b7280; }

.tcard-judul {
  font-size: 15px; font-weight: 700; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 4px;
}

.tcard-site {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #6b7280;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 8px;
}
.site-icon { font-size: 12px; flex-shrink: 0; }

.tcard-row3 { display: flex; align-items: center; justify-content: space-between; }

.tcard-priority {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
}
.tcard-priority ion-icon { font-size: 12px; }
.tcard-priority.critical { background: #fef2f2; color: #dc2626; }
.tcard-priority.high     { background: #fffbeb; color: #d97706; }
.tcard-priority.medium   { background: #f0fdf4; color: #15803d; }
.tcard-priority.low      { background: #f9fafb; color: #6b7280; }

.tcard-time {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; color: #9ca3af;
}
.tcard-time ion-icon { font-size: 12px; }

.tcard-arrow { font-size: 18px; color: #d1d5db; align-self: center; margin-right: 10px; flex-shrink: 0; }
</style>
