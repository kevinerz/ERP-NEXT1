<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/dashboard" />
        </ion-buttons>
        <ion-title>Tiket Saya</ion-title>
      </ion-toolbar>

      <!-- Segment -->
      <ion-toolbar>
        <ion-segment v-model="selectedSegment" @ionChange="onSegmentChange">
          <ion-segment-button value="">Semua</ion-segment-button>
          <ion-segment-button value="Open">Open</ion-segment-button>
          <ion-segment-button value="In_Progress">Dikerjakan</ion-segment-button>
          <ion-segment-button value="Resolved">Selesai</ion-segment-button>
        </ion-segment>
      </ion-toolbar>

      <!-- Search -->
      <ion-toolbar>
        <ion-searchbar
          v-model="searchQuery"
          placeholder="Cari tiket / site..."
          :debounce="200"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="doRefresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="ticketsStore.loading" class="center-spinner">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <div v-else-if="filtered.length === 0" class="empty-state">
        <ion-icon name="ticket-outline" />
        <p>Tidak ada tiket ditemukan</p>
      </div>

      <ion-list v-else>
        <ion-item
          v-for="ticket in filtered"
          :key="ticket.id_ticket"
          button
          :router-link="`/tickets/${ticket.id_ticket}`"
          detail
          class="ticket-item"
        >
          <div slot="start" class="priority-bar" :class="ticket.prioritas.toLowerCase()" />
          <ion-label>
            <div class="ticket-header">
              <ion-chip :color="priorityColor(ticket.prioritas)" size="small" class="chip">
                {{ ticket.prioritas }}
              </ion-chip>
              <span class="nomor">{{ ticket.nomor_tiket }}</span>
            </div>
            <h2>{{ ticket.judul_tiket }}</h2>
            <p>{{ ticket.site?.nama_site }} &mdash; {{ ticket.site?.nama_pelanggan }}</p>
            <div class="footer-row">
              <ion-badge :color="statusColor(ticket.status_tiket)">{{ ticket.status_tiket }}</ion-badge>
              <span class="time-ago">{{ timeAgo(ticket.tgl_open) }}</span>
            </div>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonRefresher, IonRefresherContent, IonSegment, IonSegmentButton,
  IonSearchbar, IonList, IonItem, IonLabel, IonChip, IonBadge, IonSpinner, IonIcon,
} from '@ionic/vue'
import { useTicketsStore } from '../stores/tickets'

const ticketsStore = useTicketsStore()
const selectedSegment = ref('')
const searchQuery = ref('')

onMounted(() => ticketsStore.fetchTickets())

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

function onSegmentChange() {
  ticketsStore.fetchTickets(selectedSegment.value || undefined)
}

function priorityColor(p: string) {
  const m: Record<string, string> = { Critical: 'danger', High: 'warning', Medium: 'primary', Low: 'medium' }
  return m[p] ?? 'medium'
}

function statusColor(s: string) {
  const m: Record<string, string> = { Open: 'warning', In_Progress: 'primary', Resolved: 'success', Closed: 'medium' }
  return m[s] ?? 'medium'
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
</script>

<style scoped>
.center-spinner { display: flex; justify-content: center; padding: 32px; }
.empty-state { text-align: center; padding: 48px 16px; color: var(--ion-color-medium); }
.empty-state ion-icon { font-size: 48px; }

.ticket-item { --border-radius: 10px; margin: 4px 8px; }

.priority-bar {
  width: 4px; height: 52px; border-radius: 4px; margin-right: 4px;
}
.priority-bar.critical { background: var(--ion-color-danger); }
.priority-bar.high     { background: var(--ion-color-warning); }
.priority-bar.medium   { background: var(--ion-color-primary); }
.priority-bar.low      { background: var(--ion-color-medium); }

.ticket-header { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.chip { height: 18px; font-size: 10px; }
.nomor { font-size: 11px; color: var(--ion-color-medium); }
.footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.time-ago { font-size: 11px; color: var(--ion-color-medium); }
</style>
