<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tickets" />
        </ion-buttons>
        <ion-title>{{ ticket?.nomor_tiket ?? 'Detail Tiket' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding" v-if="ticket">
      <!-- Status & Priority Badges -->
      <div class="badge-row">
        <ion-chip :color="priorityColor(ticket.prioritas)" class="big-chip">
          <ion-icon :name="priorityIcon(ticket.prioritas)" />
          {{ ticket.prioritas }}
        </ion-chip>
        <ion-chip :color="statusColor(ticket.status_tiket)" class="big-chip">
          {{ ticket.status_tiket.replace('_', ' ') }}
        </ion-chip>
        <ion-chip v-if="ticket.sla_breached" color="danger" class="big-chip">
          <ion-icon name="alert-circle" /> SLA Breach
        </ion-chip>
      </div>

      <!-- SLA Status -->
      <ion-card :color="ticket.sla_breached ? 'danger' : 'success'" class="sla-card">
        <ion-card-content>
          <div class="sla-content">
            <ion-icon
              :name="ticket.sla_breached ? 'close-circle' : 'checkmark-circle'"
              class="sla-icon"
            />
            <div>
              <div class="sla-label">Status SLA</div>
              <div class="sla-value">{{ ticket.sla_breached ? 'SLA Dilanggar' : 'SLA Terpenuhi' }}</div>
              <div class="sla-due" v-if="ticket.sla_due">
                Target: {{ formatDate(ticket.sla_due) }}
              </div>
            </div>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- Ticket Info -->
      <ion-card>
        <ion-card-header>
          <ion-card-subtitle>Informasi Tiket</ion-card-subtitle>
          <ion-card-title>{{ ticket.judul_tiket }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p v-if="ticket.deskripsi_masalah" class="desc-text">{{ ticket.deskripsi_masalah }}</p>
          <p v-else class="desc-empty">Tidak ada deskripsi masalah.</p>
        </ion-card-content>
      </ion-card>

      <!-- Site Info -->
      <ion-card>
        <ion-card-header>
          <ion-card-subtitle>Informasi Site</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item class="info-item">
              <ion-icon slot="start" name="business-outline" />
              <ion-label>
                <p class="info-label">Pelanggan</p>
                <h3>{{ ticket.site?.pelanggan?.nama_pelanggan }}</h3>
              </ion-label>
            </ion-item>
            <ion-item class="info-item">
              <ion-icon slot="start" name="location-outline" />
              <ion-label>
                <p class="info-label">Site</p>
                <h3>{{ ticket.site?.nama_site }} ({{ ticket.site?.kode_site }})</h3>
              </ion-label>
            </ion-item>
            <ion-item class="info-item">
              <ion-icon slot="start" name="wifi-outline" />
              <ion-label>
                <p class="info-label">Layanan</p>
                <h3>{{ ticket.site?.layanan?.nama_layanan }}</h3>
              </ion-label>
            </ion-item>
            <ion-item class="info-item">
              <ion-icon slot="start" name="map-outline" />
              <ion-label>
                <p class="info-label">Alamat</p>
                <h3 class="wrap-text">{{ ticket.site?.alamat_lengkap }}</h3>
              </ion-label>
            </ion-item>
            <ion-item
              v-if="ticket.site?.koordinat_gps"
              class="info-item"
              button
              :href="`https://maps.google.com/?q=${ticket.site.koordinat_gps}`"
              target="_blank"
            >
              <ion-icon slot="start" name="navigate-outline" color="primary" />
              <ion-label color="primary">
                <p class="info-label">Koordinat GPS</p>
                <h3>{{ ticket.site.koordinat_gps }}</h3>
              </ion-label>
              <ion-icon slot="end" name="open-outline" color="primary" />
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Timeline -->
      <ion-card>
        <ion-card-header>
          <ion-card-subtitle>Timeline</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <div class="timeline-item">
            <ion-icon name="time-outline" color="primary" />
            <div>
              <p class="tl-label">Dibuka</p>
              <p class="tl-value">{{ formatDate(ticket.tgl_open) }}</p>
            </div>
          </div>
          <div class="timeline-item" v-if="ticket.sla_due">
            <ion-icon name="hourglass-outline" :color="ticket.sla_breached ? 'danger' : 'warning'" />
            <div>
              <p class="tl-label">SLA Due</p>
              <p class="tl-value" :class="{ 'text-danger': ticket.sla_breached }">
                {{ formatDate(ticket.sla_due) }}
                <span v-if="!ticket.tgl_resolved && ticket.sla_due">
                  ({{ slaCountdown(ticket.sla_due, ticket.sla_breached) }})
                </span>
              </p>
            </div>
          </div>
          <div class="timeline-item" v-if="ticket.tgl_resolved">
            <ion-icon name="checkmark-circle-outline" color="success" />
            <div>
              <p class="tl-label">Diselesaikan</p>
              <p class="tl-value">{{ formatDate(ticket.tgl_resolved) }}</p>
            </div>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- Log History -->
      <ion-card v-if="ticket.logs?.length">
        <ion-card-header>
          <ion-card-subtitle>Riwayat Aktivitas</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <div v-for="log in ticket.logs.slice(0, 5)" :key="log.id_log" class="log-item">
            <div class="log-meta">
              <span v-if="log.status_dari && log.status_ke" class="log-transition">
                {{ log.status_dari }} → {{ log.status_ke }}
              </span>
              <span class="log-time">{{ formatDate(log.created_at) }}</span>
            </div>
            <p class="log-catatan">{{ log.catatan }}</p>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>

    <!-- Loading -->
    <ion-content v-else-if="loading" class="ion-padding center-content">
      <ion-spinner name="crescent" color="primary" />
    </ion-content>

    <!-- Action Buttons -->
    <ion-footer v-if="ticket && canAct">
      <ion-toolbar>
        <div class="action-buttons">
          <!-- Accept (Open -> In_Progress) -->
          <ion-button
            v-if="ticket.status_tiket === 'Open'"
            expand="block"
            color="primary"
            @click="confirmAccept"
            :disabled="actionLoading"
          >
            <ion-spinner v-if="actionLoading" name="crescent" />
            <span v-else>Terima Tiket</span>
          </ion-button>

          <!-- Resolve (In_Progress -> Resolved) -->
          <ion-button
            v-if="ticket.status_tiket === 'In_Progress'"
            expand="block"
            color="success"
            @click="openResolveModal"
            :disabled="actionLoading"
          >
            <ion-spinner v-if="actionLoading" name="crescent" />
            <span v-else>Selesaikan Tiket</span>
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>

    <!-- Completed notice -->
    <ion-footer v-if="ticket && !canAct">
      <ion-toolbar>
        <div class="done-notice">
          <ion-icon name="checkmark-circle" color="success" />
          <span>Tiket sudah selesai</span>
        </div>
      </ion-toolbar>
    </ion-footer>

    <!-- Resolve Modal -->
    <ion-modal :is-open="resolveModalOpen" @didDismiss="resolveModalOpen = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>Catatan Resolusi</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="resolveModalOpen = false">Batal</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-textarea
          v-model="catatanResolusi"
          placeholder="Tuliskan catatan penyelesaian masalah..."
          :rows="6"
          label="Catatan Resolusi"
          label-placement="stacked"
        />
        <ion-button
          expand="block"
          color="success"
          class="ion-margin-top"
          :disabled="!catatanResolusi || actionLoading"
          @click="submitResolve"
        >
          <ion-spinner v-if="actionLoading" name="crescent" />
          <span v-else>Konfirmasi Selesai</span>
        </ion-button>
      </ion-content>
    </ion-modal>

    <!-- Accept Alert -->
    <ion-alert
      :is-open="acceptAlertOpen"
      header="Terima Tiket"
      :message="`Terima dan mulai kerjakan tiket ${ticket?.nomor_tiket}?`"
      :buttons="acceptAlertButtons"
      @didDismiss="acceptAlertOpen = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton,
  IonContent, IonFooter, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle,
  IonList, IonItem, IonLabel, IonIcon, IonChip, IonBadge, IonSpinner,
  IonModal, IonTextarea, IonAlert,
} from '@ionic/vue'
import api from '../services/api'
import { useTicketsStore } from '../stores/tickets'

const route = useRoute()
const ticketsStore = useTicketsStore()

const ticket = ref<any>(null)
const loading = ref(false)
const actionLoading = ref(false)
const resolveModalOpen = ref(false)
const acceptAlertOpen = ref(false)
const catatanResolusi = ref('')

const canAct = computed(() =>
  ticket.value?.status_tiket === 'Open' || ticket.value?.status_tiket === 'In_Progress'
)

const acceptAlertButtons = [
  { text: 'Batal', role: 'cancel' },
  { text: 'Ya, Terima', handler: doAccept },
]

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await api.get(`/mobile/tickets/${route.params.id}`)
    ticket.value = data
  } finally {
    loading.value = false
  }
})

function confirmAccept() { acceptAlertOpen.value = true }
function openResolveModal() { catatanResolusi.value = ''; resolveModalOpen.value = true }

async function doAccept() {
  if (!ticket.value) return
  actionLoading.value = true
  try {
    const updated = await ticketsStore.acceptTicket(ticket.value.id_ticket)
    ticket.value = { ...ticket.value, ...updated }
  } finally {
    actionLoading.value = false
  }
}

async function submitResolve() {
  if (!ticket.value || !catatanResolusi.value) return
  actionLoading.value = true
  try {
    const updated = await ticketsStore.resolveTicket(ticket.value.id_ticket, catatanResolusi.value)
    ticket.value = { ...ticket.value, ...updated }
    resolveModalOpen.value = false
  } finally {
    actionLoading.value = false
  }
}

function priorityColor(p: string) {
  const m: Record<string, string> = { Critical: 'danger', High: 'warning', Medium: 'primary', Low: 'medium' }
  return m[p] ?? 'medium'
}

function statusColor(s: string) {
  const m: Record<string, string> = { Open: 'warning', In_Progress: 'primary', Resolved: 'success', Closed: 'medium' }
  return m[s] ?? 'medium'
}

function priorityIcon(p: string) {
  const m: Record<string, string> = { Critical: 'flame', High: 'arrow-up-circle', Medium: 'remove-circle', Low: 'arrow-down-circle' }
  return m[p] ?? 'help-circle'
}

function formatDate(d: string) {
  if (!d) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
}

function slaCountdown(due: string, breached: boolean) {
  if (breached) return 'Sudah lewat'
  const diff = new Date(due).getTime() - Date.now()
  if (diff <= 0) return 'Sudah lewat'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `sisa ${h}j ${m}m`
}
</script>

<style scoped>
.badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.big-chip { font-size: 13px; height: 28px; }

.sla-card { margin-bottom: 12px; }
.sla-content { display: flex; align-items: center; gap: 16px; }
.sla-icon { font-size: 40px; }
.sla-label { font-size: 12px; opacity: 0.8; margin: 0; }
.sla-value { font-size: 18px; font-weight: 700; margin: 2px 0; }
.sla-due { font-size: 12px; opacity: 0.8; margin: 0; }

.desc-text { margin: 0; line-height: 1.6; }
.desc-empty { color: var(--ion-color-medium); font-style: italic; }

.info-item { --inner-padding-start: 0; --padding-start: 0; }
.info-label { font-size: 11px; color: var(--ion-color-medium); margin: 0; }
.wrap-text { white-space: normal; }

.timeline-item { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
.timeline-item ion-icon { font-size: 20px; margin-top: 2px; flex-shrink: 0; }
.tl-label { font-size: 11px; color: var(--ion-color-medium); margin: 0; }
.tl-value { font-size: 14px; font-weight: 500; margin: 2px 0 0; }
.text-danger { color: var(--ion-color-danger); }

.log-item { border-left: 2px solid var(--ion-color-light); padding-left: 12px; margin-bottom: 12px; }
.log-meta { display: flex; justify-content: space-between; align-items: center; }
.log-transition { font-size: 11px; font-weight: 600; color: var(--ion-color-primary); }
.log-time { font-size: 11px; color: var(--ion-color-medium); }
.log-catatan { font-size: 13px; margin: 4px 0 0; }

.center-content { display: flex; align-items: center; justify-content: center; }

.action-buttons { padding: 8px 16px; }

.done-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-weight: 600;
  color: var(--ion-color-success);
}
</style>
