<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tickets" text="" />
        </ion-buttons>
        <ion-title>{{ ticket?.nomor_tiket ?? 'Detail Tiket' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="load">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
          <ion-button fill="clear" @click="openSuratTugas">
            <ion-icon slot="icon-only" :icon="documentOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <!-- LOADING -->
    <ion-content v-if="loading" class="center-content">
      <ion-spinner name="crescent" color="primary" style="transform:scale(2)" />
    </ion-content>

    <ion-content v-else-if="ticket" :fullscreen="true">

      <!-- ── HERO ── -->
      <div class="hero" :class="'p-' + ticket.prioritas.toLowerCase()">
        <div class="hero-badges">
          <span class="badge-p"><ion-icon :icon="priorityIcon(ticket.prioritas)" /> {{ ticket.prioritas }}</span>
          <span class="badge-s" :class="'s-' + ticket.status_tiket.replace('_','')">{{ ticket.status_tiket.replace('_',' ') }}</span>
          <span v-if="ticket.sla_breached" class="badge-breach"><ion-icon :icon="alertCircle" /> Breach</span>
        </div>
        <h1 class="hero-judul">{{ ticket.judul_tiket }}</h1>
        <p class="hero-nomor">{{ ticket.nomor_tiket }}</p>
        <div class="hero-sla">
          <ion-icon :icon="ticket.sla_breached ? closeCircle : checkmarkCircle" />
          {{ ticket.sla_breached ? 'SLA Dilanggar' : 'SLA Terpenuhi' }}
          <span v-if="ticket.sla_due" class="sla-cd">· {{ slaCountdown(ticket.sla_due, ticket.sla_breached) }}</span>
        </div>
      </div>

      <!-- ── WORKFLOW STEPPER ── -->
      <div class="workflow-card">
        <div class="wf-title">Alur Pengerjaan</div>
        <div class="stepper">
          <div v-for="(step, i) in steps" :key="step.key" class="step-item">
            <div class="step-connector" v-if="i > 0" :class="{ done: stepDone(steps[i-1].key) }" />
            <div class="step-circle" :class="{ done: stepDone(step.key), active: stepActive(step.key) }">
              <ion-icon :icon="stepDone(step.key) ? checkmarkCircle : step.icon" />
            </div>
            <div class="step-label" :class="{ active: stepActive(step.key) || stepDone(step.key) }">{{ step.label }}</div>
          </div>
        </div>
      </div>

      <!-- ── ACTION PANEL ── -->
      <div class="action-card">
        <!-- Step 1: Terima -->
        <template v-if="ticket.status_tiket === 'Open'">
          <div class="action-title"><ion-icon :icon="handRightOutline" /> Terima Tiket</div>
          <p class="action-desc">Konfirmasi bahwa Anda menerima penugasan ini.</p>
          <ion-button expand="block" class="act-btn" color="primary" :disabled="actionLoading" @click="doAccept">
            <ion-icon slot="start" :icon="checkmarkCircleOutline" /><ion-spinner v-if="actionLoading" name="crescent" /><span v-else>Terima Tiket</span>
          </ion-button>
        </template>

        <!-- Step 2: Berangkat -->
        <template v-else-if="ticket.status_tiket === 'In_Progress' && !ticket.tgl_berangkat">
          <div class="action-title"><ion-icon :icon="navigateOutline" /> Berangkat ke Lokasi</div>
          <p class="action-desc">GPS akan merekam perjalanan Anda secara real-time.</p>
          <ion-button expand="block" class="act-btn" color="warning" :disabled="actionLoading" @click="doBerangkat">
            <ion-icon slot="start" :icon="carOutline" /><ion-spinner v-if="actionLoading" name="crescent" /><span v-else>Mulai Berangkat</span>
          </ion-button>
        </template>

        <!-- Step 3: Sampai + Foto Before -->
        <template v-else-if="ticket.tgl_berangkat && !ticket.tgl_sampai">
          <div class="gps-live-bar">
            <div class="gps-dot" /><span>GPS aktif · merekam perjalanan</span>
          </div>
          <div class="action-title"><ion-icon :icon="locationOutline" /> Tiba di Lokasi</div>
          <p class="action-desc">Tekan saat sudah tiba, lalu ambil foto kondisi awal.</p>
          <ion-button expand="block" class="act-btn" color="success" :disabled="actionLoading" @click="doSampai">
            <ion-icon slot="start" :icon="pinOutline" /><ion-spinner v-if="actionLoading" name="crescent" /><span v-else>Saya Sudah Sampai</span>
          </ion-button>
        </template>

        <!-- Step 4: Foto Before (sudah sampai, belum ada foto before) -->
        <template v-else-if="ticket.tgl_sampai && !hasFoto('before')">
          <div class="action-title"><ion-icon :icon="cameraOutline" /> Foto Kondisi Awal</div>
          <p class="action-desc">Ambil foto kondisi perangkat/jaringan sebelum diperbaiki.</p>
          <ion-button expand="block" class="act-btn" color="secondary" @click="takePhoto('before')">
            <ion-icon slot="start" :icon="cameraOutline" /> Ambil Foto Before
          </ion-button>
        </template>

        <!-- Step 5: Pengerjaan + Foto Proses -->
        <template v-else-if="ticket.tgl_sampai && hasFoto('before') && ticket.status_tiket === 'In_Progress'">
          <div class="action-title"><ion-icon :icon="constructOutline" /> Sedang Pengerjaan</div>
          <div class="foto-section">
            <div class="foto-row">
              <div v-for="f in fotosOf('proses')" :key="f.id_foto" class="foto-thumb">
                <img :src="fotoUrl(f.filename, ticket.id_ticket)" @click="previewFoto(f)" />
                <span class="foto-caption">{{ f.caption || 'Proses' }}</span>
              </div>
              <button class="foto-add" @click="takePhoto('proses')">
                <ion-icon :icon="addOutline" /><span>Tambah</span>
              </button>
            </div>
          </div>
          <ion-button expand="block" class="act-btn resolve-btn" @click="openResolveModal">
            <ion-icon slot="start" :icon="checkmarkDoneCircleOutline" /> Selesaikan Tiket
          </ion-button>
        </template>

        <!-- Done -->
        <template v-else-if="ticket.status_tiket === 'Resolved' || ticket.status_tiket === 'Closed'">
          <div class="done-block">
            <ion-icon :icon="checkmarkCircle" class="done-icon" />
            <div class="done-text">Tiket Selesai</div>
            <div class="done-sub">{{ formatDate(ticket.tgl_resolved) }}</div>
          </div>
        </template>
      </div>

      <!-- ── FOTO GALLERY ── -->
      <div class="section-card" v-if="allFotos.length">
        <div class="section-title"><ion-icon :icon="imagesOutline" /> Dokumentasi Foto</div>
        <div class="gallery-stages">
          <div v-for="stage in ['before','proses','after']" :key="stage">
            <div v-if="fotosOf(stage).length" class="gallery-group">
              <div class="gallery-label">{{ stageLabel(stage) }}</div>
              <div class="gallery-row">
                <div v-for="f in fotosOf(stage)" :key="f.id_foto" class="gallery-thumb" @click="previewFoto(f)">
                  <img :src="fotoUrl(f.filename, ticket.id_ticket)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── SITE INFO ── -->
      <div class="section-card">
        <div class="section-title"><ion-icon :icon="locationOutline" /> Informasi Site</div>
        <div class="info-rows">
          <div class="info-row"><ion-icon :icon="businessOutline" /><div><div class="lbl">Pelanggan</div><div class="val">{{ ticket.site?.pelanggan?.nama_pelanggan || '—' }}</div></div></div>
          <div class="info-row"><ion-icon :icon="wifiOutline" /><div><div class="lbl">Site</div><div class="val">{{ ticket.site?.nama_site }} <span class="val-sub">({{ ticket.site?.kode_site }})</span></div></div></div>
          <div class="info-row"><ion-icon :icon="pulseOutline" /><div><div class="lbl">Layanan</div><div class="val">{{ ticket.site?.layanan?.nama_layanan || '—' }}</div></div></div>
          <div class="info-row"><ion-icon :icon="mapOutline" /><div><div class="lbl">Alamat</div><div class="val">{{ ticket.site?.alamat_lengkap || '—' }}</div></div></div>
          <a v-if="ticket.site?.koordinat_gps" class="info-row maps-link" :href="`https://maps.google.com/?q=${ticket.site.koordinat_gps}`" target="_blank">
            <ion-icon :icon="navigateOutline" color="primary" />
            <div><div class="lbl">Buka Maps</div><div class="val primary">{{ ticket.site.koordinat_gps }}</div></div>
            <ion-icon :icon="openOutline" style="margin-left:auto;color:#16a34a" />
          </a>
        </div>
      </div>

      <!-- ── TIMELINE ── -->
      <div class="section-card">
        <div class="section-title"><ion-icon :icon="timeOutline" /> Timeline</div>
        <div class="tl">
          <div class="tl-row" v-if="ticket.tgl_open"><div class="tl-dot open"/><div class="tl-line"/><div><div class="tl-lbl">Dibuka</div><div class="tl-val">{{ formatDate(ticket.tgl_open) }}</div></div></div>
          <div class="tl-row" v-if="ticket.tgl_berangkat"><div class="tl-dot go"/><div class="tl-line"/><div><div class="tl-lbl">Berangkat</div><div class="tl-val">{{ formatDate(ticket.tgl_berangkat) }}</div></div></div>
          <div class="tl-row" v-if="ticket.tgl_sampai"><div class="tl-dot arrive"/><div class="tl-line"/><div><div class="tl-lbl">Tiba di Lokasi</div><div class="tl-val">{{ formatDate(ticket.tgl_sampai) }}</div></div></div>
          <div class="tl-row" v-if="ticket.sla_due"><div class="tl-dot" :class="ticket.sla_breached?'breach':'sla'"/><div class="tl-line"/><div><div class="tl-lbl">Target SLA</div><div class="tl-val" :class="{danger:ticket.sla_breached}">{{ formatDate(ticket.sla_due) }}</div></div></div>
          <div class="tl-row" v-if="ticket.tgl_resolved"><div class="tl-dot done"/><div><div class="tl-lbl">Selesai</div><div class="tl-val">{{ formatDate(ticket.tgl_resolved) }}</div></div></div>
        </div>
      </div>

      <!-- ── LOGS ── -->
      <div class="section-card" v-if="ticket.logs?.length">
        <div class="section-title"><ion-icon :icon="listOutline" /> Riwayat</div>
        <div class="log-list">
          <div v-for="log in ticket.logs.slice(0,6)" :key="log.id_log" class="log-item">
            <div class="log-hdr">
              <span v-if="log.status_dari&&log.status_ke" class="log-tr">{{ log.status_dari }} → {{ log.status_ke }}</span>
              <span class="log-time">{{ formatDate(log.created_at) }}</span>
            </div>
            <p class="log-cat">{{ log.catatan }}</p>
          </div>
        </div>
      </div>

      <div style="height:20px" />
    </ion-content>

    <!-- ══ RESOLVE MODAL ══ -->
    <ion-modal :is-open="resolveModalOpen" @didDismiss="resolveModalOpen=false" :initial-breakpoint="0.75" :breakpoints="[0,0.75,1]">
      <ion-header><ion-toolbar><ion-title>Selesaikan Tiket</ion-title><ion-buttons slot="end"><ion-button @click="resolveModalOpen=false"><ion-icon :icon="closeOutline"/></ion-button></ion-buttons></ion-toolbar></ion-header>
      <ion-content class="ion-padding">
        <div class="resolve-step" v-if="!hasFoto('after')">
          <div class="resolve-hint"><ion-icon :icon="cameraOutline" /> Ambil foto kondisi akhir setelah selesai</div>
          <ion-button expand="block" color="primary" @click="takePhoto('after')">
            <ion-icon slot="start" :icon="cameraOutline" /> Foto After (Wajib)
          </ion-button>
        </div>
        <div v-else>
          <div class="foto-preview-after">
            <img v-for="f in fotosOf('after')" :key="f.id_foto" :src="fotoUrl(f.filename, ticket.id_ticket)" class="after-thumb" />
          </div>
          <ion-textarea v-model="catatanResolusi" placeholder="Catatan penyelesaian masalah..." :rows="4" label="Catatan Resolusi" label-placement="stacked" fill="outline" class="ion-margin-bottom" />
          <ion-button expand="block" color="success" :disabled="!catatanResolusi||actionLoading" @click="submitResolve">
            <ion-icon slot="start" :icon="checkmarkDoneCircleOutline" /><ion-spinner v-if="actionLoading" name="crescent" /><span v-else>Konfirmasi Selesai</span>
          </ion-button>
        </div>
      </ion-content>
    </ion-modal>

    <!-- ══ SURAT TUGAS MODAL ══ -->
    <ion-modal :is-open="suratTugasOpen" @didDismiss="suratTugasOpen=false">
      <ion-header><ion-toolbar color="primary"><ion-title>Surat Tugas</ion-title><ion-buttons slot="end"><ion-button @click="suratTugasOpen=false"><ion-icon :icon="closeOutline"/></ion-button></ion-buttons></ion-toolbar></ion-header>
      <ion-content>
        <div class="surat" v-if="ticket">
          <div class="surat-header">
            <div class="surat-logo">
              <svg viewBox="0 0 60 60" width="48" height="48">
                <path d="M10 50 C8 38 10 22 14 10 C17 4 21 2 24 5 C27 8 29 18 30 26" stroke="#166534" stroke-width="9" stroke-linecap="round" fill="none"/>
                <path d="M30 26 C32 34 35 42 37 46 C39 50 43 50 46 46 C49 42 50 34 50 26" stroke="#15803d" stroke-width="9" stroke-linecap="round" fill="none"/>
                <path d="M37 46 L50 18" stroke="#166534" stroke-width="9" stroke-linecap="round" fill="none"/>
                <polygon points="50,18 40,17 49,10" fill="#166534"/>
              </svg>
              <div class="surat-co">
                <div class="surat-co-name">PT NEXT<span style="color:#16a34a">ONE</span> INDONESIA</div>
                <div class="surat-co-sub">Network Solutions Provider</div>
              </div>
            </div>
            <div class="surat-title-block">
              <div class="surat-title">SURAT TUGAS</div>
              <div class="surat-no">No: ST/{{ ticket.nomor_tiket }}</div>
            </div>
          </div>
          <div class="surat-divider"/>
          <div class="surat-body">
            <table class="surat-table">
              <tr><td class="st-key">Ditugaskan Kepada</td><td>:</td><td class="st-val fw">{{ ticket.teknisi?.nama_lengkap }}</td></tr>
              <tr><td class="st-key">Jabatan</td><td>:</td><td class="st-val">{{ ticket.teknisi?.jabatan }}</td></tr>
              <tr><td class="st-key">No. HP</td><td>:</td><td class="st-val">{{ ticket.teknisi?.no_hp }}</td></tr>
            </table>
            <div class="surat-section-title">DETAIL PENUGASAN</div>
            <table class="surat-table">
              <tr><td class="st-key">No. Tiket</td><td>:</td><td class="st-val fw">{{ ticket.nomor_tiket }}</td></tr>
              <tr><td class="st-key">Judul</td><td>:</td><td class="st-val">{{ ticket.judul_tiket }}</td></tr>
              <tr><td class="st-key">Prioritas</td><td>:</td><td class="st-val">{{ ticket.prioritas }}</td></tr>
              <tr><td class="st-key">Pelanggan</td><td>:</td><td class="st-val">{{ ticket.site?.pelanggan?.nama_pelanggan }}</td></tr>
              <tr><td class="st-key">Site</td><td>:</td><td class="st-val">{{ ticket.site?.nama_site }} ({{ ticket.site?.kode_site }})</td></tr>
              <tr><td class="st-key">Alamat</td><td>:</td><td class="st-val">{{ ticket.site?.alamat_lengkap }}</td></tr>
              <tr><td class="st-key">Layanan</td><td>:</td><td class="st-val">{{ ticket.site?.layanan?.nama_layanan }}</td></tr>
              <tr><td class="st-key">Tanggal Tugas</td><td>:</td><td class="st-val">{{ formatDate(ticket.tgl_open) }}</td></tr>
              <tr v-if="ticket.tgl_berangkat"><td class="st-key">Berangkat</td><td>:</td><td class="st-val">{{ formatDate(ticket.tgl_berangkat) }}</td></tr>
              <tr v-if="ticket.tgl_sampai"><td class="st-key">Tiba di Lokasi</td><td>:</td><td class="st-val">{{ formatDate(ticket.tgl_sampai) }}</td></tr>
              <tr v-if="ticket.tgl_resolved"><td class="st-key">Diselesaikan</td><td>:</td><td class="st-val">{{ formatDate(ticket.tgl_resolved) }}</td></tr>
            </table>
            <div class="surat-section-title">DESKRIPSI MASALAH</div>
            <p class="surat-desc">{{ ticket.deskripsi_masalah || '—' }}</p>
            <div class="surat-sign">
              <div class="sign-box"><div class="sign-line"/><div class="sign-lbl">Teknisi Pelaksana</div><div class="sign-name">{{ ticket.teknisi?.nama_lengkap }}</div></div>
              <div class="sign-box"><div class="sign-line"/><div class="sign-lbl">Pelanggan / PIC</div><div class="sign-name">( _____________________ )</div></div>
            </div>
          </div>
        </div>
      </ion-content>
    </ion-modal>

    <!-- ══ FOTO PREVIEW MODAL ══ -->
    <ion-modal :is-open="!!previewFotoData" @didDismiss="previewFotoData=null">
      <ion-header><ion-toolbar><ion-title>{{ previewFotoData?.caption || stageLabel(previewFotoData?.stage) }}</ion-title><ion-buttons slot="end"><ion-button @click="previewFotoData=null"><ion-icon :icon="closeOutline"/></ion-button></ion-buttons></ion-toolbar></ion-header>
      <ion-content class="center-content" v-if="previewFotoData">
        <img :src="fotoUrl(previewFotoData.filename, ticket?.id_ticket)" style="width:100%;max-height:80vh;object-fit:contain" />
      </ion-content>
    </ion-modal>

    <!-- Accept Alert -->
    <ion-alert :is-open="acceptAlertOpen" header="Terima Tiket" :message="`Terima tiket ${ticket?.nomor_tiket}?`" :buttons="acceptAlertButtons" @didDismiss="acceptAlertOpen=false" />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton,
  IonContent, IonSpinner, IonIcon, IonModal, IonTextarea, IonAlert,
} from '@ionic/vue'
import {
  refreshOutline, documentOutline, checkmarkCircle, closeCircle, alertCircle,
  checkmarkCircleOutline, checkmarkDoneCircleOutline, closeOutline,
  navigateOutline, locationOutline, businessOutline, wifiOutline, pulseOutline,
  mapOutline, openOutline, timeOutline, listOutline, constructOutline,
  cameraOutline, imagesOutline, addOutline, handRightOutline, carOutline, pinOutline,
  flameOutline, arrowUpCircleOutline, removeCircleOutline, arrowDownCircleOutline,
} from 'ionicons/icons'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import api from '../services/api'
import { useTicketsStore } from '../stores/tickets'

const route = useRoute()
const ticketsStore = useTicketsStore()
const ticket = ref<any>(null)
const allFotos = ref<any[]>([])
const loading = ref(false)
const actionLoading = ref(false)
const resolveModalOpen = ref(false)
const acceptAlertOpen = ref(false)
const suratTugasOpen = ref(false)
const catatanResolusi = ref('')
const previewFotoData = ref<any>(null)

const BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://1erp.nextone.id'

const steps = [
  { key: 'open',       label: 'Diterima',   icon: checkmarkCircleOutline },
  { key: 'berangkat',  label: 'Berangkat',  icon: carOutline },
  { key: 'sampai',     label: 'Tiba',        icon: pinOutline },
  { key: 'before',     label: 'Foto Before', icon: cameraOutline },
  { key: 'pengerjaan', label: 'Pengerjaan',  icon: constructOutline },
  { key: 'after',      label: 'Foto After',  icon: imagesOutline },
  { key: 'selesai',    label: 'Selesai',     icon: checkmarkCircle },
]

function stepDone(key: string): boolean {
  if (!ticket.value) return false
  const t = ticket.value
  const done = ['Resolved','Closed'].includes(t.status_tiket)
  switch (key) {
    case 'open':       return t.status_tiket !== 'Open'
    case 'berangkat':  return !!t.tgl_berangkat
    case 'sampai':     return !!t.tgl_sampai
    case 'before':     return hasFoto('before')
    case 'pengerjaan': return hasFoto('after') || done
    case 'after':      return hasFoto('after')
    case 'selesai':    return done
  }
  return false
}

function stepActive(key: string): boolean {
  if (!ticket.value) return false
  const t = ticket.value
  switch (key) {
    case 'open':       return t.status_tiket === 'Open'
    case 'berangkat':  return t.status_tiket === 'In_Progress' && !t.tgl_berangkat
    case 'sampai':     return !!t.tgl_berangkat && !t.tgl_sampai
    case 'before':     return !!t.tgl_sampai && !hasFoto('before')
    case 'pengerjaan': return !!t.tgl_sampai && hasFoto('before') && !hasFoto('after')
    case 'after':      return resolveModalOpen.value
    case 'selesai':    return false
  }
  return false
}

function hasFoto(stage: string) { return allFotos.value.some(f => f.stage === stage) }
function fotosOf(stage: string) { return allFotos.value.filter(f => f.stage === stage) }
function fotoUrl(filename: string, id: number) { return `${BASE_URL}/uploads/tickets/${id}/${filename}` }
function stageLabel(s: string) { return s === 'before' ? 'Sebelum' : s === 'proses' ? 'Proses' : s === 'after' ? 'Sesudah' : s }

const acceptAlertButtons = [
  { text: 'Batal', role: 'cancel' },
  { text: 'Ya, Terima', handler: doAccept },
]

async function load() {
  loading.value = true
  try {
    const [tr, fr] = await Promise.all([
      api.get(`/mobile/tickets/${route.params.id}`),
      api.get(`/mobile/tickets/${route.params.id}/fotos`),
    ])
    ticket.value = tr.data.data ?? tr.data
    allFotos.value = fr.data.data ?? fr.data
  } catch { /* silent */ } finally { loading.value = false }
}

onMounted(load)

async function doAccept() {
  actionLoading.value = true
  try {
    await ticketsStore.acceptTicket(ticket.value.id_ticket)
    await load()
  } finally { actionLoading.value = false }
}

async function doBerangkat() {
  actionLoading.value = true
  try {
    await api.post(`/mobile/tickets/${ticket.value.id_ticket}/berangkat`)
    await load()
  } finally { actionLoading.value = false }
}

async function doSampai() {
  actionLoading.value = true
  try {
    await api.post(`/mobile/tickets/${ticket.value.id_ticket}/sampai`)
    await load()
  } finally { actionLoading.value = false }
}

async function takePhoto(stage: string) {
  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
    })
    if (!photo.base64String) return
    const base64 = `data:image/jpeg;base64,${photo.base64String}`
    await api.post(`/mobile/tickets/${ticket.value.id_ticket}/foto`, { stage, base64 })
    await Promise.all([load(), loadFotos()])
  } catch { /* user cancelled */ }
}

async function loadFotos() {
  const r = await api.get(`/mobile/tickets/${ticket.value.id_ticket}/fotos`)
  allFotos.value = r.data.data ?? r.data
}

function openResolveModal() { catatanResolusi.value = ''; resolveModalOpen.value = true }

async function submitResolve() {
  if (!catatanResolusi.value) return
  actionLoading.value = true
  try {
    await ticketsStore.resolveTicket(ticket.value.id_ticket, catatanResolusi.value)
    resolveModalOpen.value = false
    await load()
  } finally { actionLoading.value = false }
}

function openSuratTugas() { suratTugasOpen.value = true }
function previewFoto(f: any) { previewFotoData.value = f }

function priorityIcon(p: string) {
  return { Critical: flameOutline, High: arrowUpCircleOutline, Medium: removeCircleOutline, Low: arrowDownCircleOutline }[p] ?? removeCircleOutline
}

function formatDate(d: string) {
  if (!d) return '-'
  return new Intl.DateTimeFormat('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(d))
}

function slaCountdown(due: string, breached: boolean) {
  if (breached) return 'Lewat'
  const diff = new Date(due).getTime() - Date.now()
  if (diff <= 0) return 'Lewat'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h >= 24 ? `${Math.floor(h/24)}h ${h%24}j lagi` : `${h}j ${m}m lagi`
}
</script>

<style scoped>
/* HERO */
.hero { padding: 20px 16px 16px; color: #fff; border-bottom-left-radius: 20px; border-bottom-right-radius: 20px; }
.hero.p-critical { background: linear-gradient(135deg,#7f1d1d,#991b1b); }
.hero.p-high     { background: linear-gradient(135deg,#78350f,#92400e); }
.hero.p-medium   { background: linear-gradient(135deg,#14532d,#16a34a); }
.hero.p-low      { background: linear-gradient(135deg,#1e3a2f,#166534); }

.hero-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.badge-p, .badge-s, .badge-breach {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700;
}
.badge-p { background: rgba(255,255,255,0.2); }
.badge-s.sOpen        { background: #f97316; }
.badge-s.sIn_Progress { background: #3b82f6; }
.badge-s.sResolved    { background: #22c55e; }
.badge-s.sClosed      { background: #6b7280; }
.badge-breach { background: #ef4444; }
.hero-judul { font-size: 20px; font-weight: 800; margin: 4px 0 2px; }
.hero-nomor { font-size: 12px; opacity: 0.7; margin: 0 0 10px; }
.hero-sla { display: flex; align-items: center; gap: 6px; font-size: 13px; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 10px; }
.sla-cd { opacity: 0.8; margin-left: 4px; }

/* WORKFLOW */
.workflow-card { margin: 12px 12px 0; background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.07); }
.wf-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 14px; }

.stepper { display: flex; justify-content: space-between; align-items: flex-start; position: relative; }
.step-item { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative; }
.step-connector {
  position: absolute; top: 14px; right: 50%; left: -50%;
  height: 2px; background: #e5e7eb; z-index: 0;
}
.step-connector.done { background: #16a34a; }
.step-circle {
  width: 28px; height: 28px; border-radius: 50%;
  background: #f3f4f6; border: 2px solid #e5e7eb;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #9ca3af; z-index: 1; position: relative;
}
.step-circle.done   { background: #16a34a; border-color: #16a34a; color: #fff; }
.step-circle.active { background: #fff; border-color: #16a34a; color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.15); }
.step-label { font-size: 9px; text-align: center; color: #9ca3af; margin-top: 4px; line-height: 1.2; }
.step-label.active { color: #16a34a; font-weight: 700; }

/* ACTION CARD */
.action-card { margin: 10px 12px 0; background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.07); }
.action-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 6px; }
.action-desc { font-size: 13px; color: #6b7280; margin: 0 0 14px; }
.act-btn { --border-radius: 12px; height: 48px; font-size: 15px; font-weight: 700; }
.resolve-btn { --background: #16a34a; }

.gps-live-bar {
  display: flex; align-items: center; gap: 8px;
  background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 10px; padding: 8px 12px; margin-bottom: 12px;
  font-size: 12px; font-weight: 600; color: #15803d;
}
.gps-dot {
  width: 10px; height: 10px; border-radius: 50%; background: #16a34a;
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.4); }
  50% { box-shadow: 0 0 0 6px rgba(22,163,74,0); }
}

.done-block { text-align: center; padding: 20px 0; }
.done-icon { font-size: 52px; color: #16a34a; }
.done-text { font-size: 18px; font-weight: 700; color: #15803d; margin: 8px 0 4px; }
.done-sub { font-size: 13px; color: #6b7280; }

/* FOTO */
.foto-section { margin-bottom: 12px; }
.foto-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.foto-thumb { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.foto-thumb img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; border: 2px solid #e5e7eb; }
.foto-caption { font-size: 9px; color: #6b7280; }
.foto-add {
  width: 72px; height: 72px; border-radius: 10px; border: 2px dashed #d1d5db;
  background: #f9fafb; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 3px; cursor: pointer; color: #6b7280; font-size: 10px;
}
.foto-add ion-icon { font-size: 22px; color: #16a34a; }

/* SECTION CARDS */
.section-card { margin: 10px 12px 0; background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.07); }
.section-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 14px; }

/* GALLERY */
.gallery-group { margin-bottom: 12px; }
.gallery-label { font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px; }
.gallery-row { display: flex; gap: 6px; flex-wrap: wrap; }
.gallery-thumb img { width: 80px; height: 80px; object-fit: cover; border-radius: 10px; border: 2px solid #e5e7eb; cursor: pointer; }

/* INFO ROWS */
.info-rows { display: flex; flex-direction: column; gap: 12px; }
.info-row { display: flex; align-items: flex-start; gap: 10px; text-decoration: none; color: inherit; }
.info-row ion-icon { font-size: 18px; color: #16a34a; margin-top: 1px; flex-shrink: 0; }
.lbl { font-size: 11px; color: #9ca3af; margin: 0 0 1px; }
.val { font-size: 14px; font-weight: 500; }
.val-sub { font-size: 12px; color: #6b7280; }
.val.primary { color: #16a34a; }
.maps-link { border-top: 1px solid #f3f4f6; padding-top: 12px; }

/* TIMELINE */
.tl { display: flex; flex-direction: column; gap: 0; }
.tl-row { display: flex; align-items: flex-start; gap: 10px; padding-bottom: 14px; }
.tl-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; border: 2px solid; }
.tl-dot.open   { border-color: #f97316; background: #fed7aa; }
.tl-dot.go     { border-color: #f59e0b; background: #fef3c7; }
.tl-dot.arrive { border-color: #3b82f6; background: #dbeafe; }
.tl-dot.sla    { border-color: #f59e0b; background: #fef3c7; }
.tl-dot.breach { border-color: #ef4444; background: #fee2e2; }
.tl-dot.done   { border-color: #22c55e; background: #dcfce7; }
.tl-line { display: none; }
.tl-lbl { font-size: 11px; color: #9ca3af; margin: 0; }
.tl-val { font-size: 13px; font-weight: 500; margin: 1px 0 0; }
.tl-val.danger { color: #ef4444; }

/* LOGS */
.log-list { display: flex; flex-direction: column; gap: 10px; }
.log-item { border-left: 3px solid #16a34a; padding-left: 10px; }
.log-hdr { display: flex; justify-content: space-between; margin-bottom: 3px; }
.log-tr { font-size: 11px; font-weight: 700; color: #16a34a; }
.log-time { font-size: 11px; color: #9ca3af; }
.log-cat { font-size: 13px; margin: 0; color: #374151; }

/* SURAT TUGAS */
.surat { padding: 20px; min-height: 100%; }
.surat-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.surat-logo { display: flex; align-items: center; gap: 10px; }
.surat-co-name { font-size: 14px; font-weight: 800; color: #14532d; }
.surat-co-sub { font-size: 10px; color: #6b7280; }
.surat-title-block { text-align: right; }
.surat-title { font-size: 16px; font-weight: 800; color: #14532d; letter-spacing: 1px; }
.surat-no { font-size: 11px; color: #6b7280; }
.surat-divider { height: 2px; background: linear-gradient(90deg,#16a34a,#059669); border-radius: 2px; margin: 12px 0; }
.surat-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #16a34a; margin: 14px 0 8px; }
.surat-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.surat-table td { padding: 3px 4px; vertical-align: top; }
.st-key { color: #6b7280; width: 110px; }
.st-val { color: #111827; }
.st-val.fw { font-weight: 700; }
.surat-desc { font-size: 13px; color: #374151; line-height: 1.6; margin: 0; }
.surat-sign { display: flex; gap: 20px; margin-top: 32px; }
.sign-box { flex: 1; text-align: center; }
.sign-line { height: 60px; border-bottom: 1px solid #374151; margin-bottom: 6px; }
.sign-lbl { font-size: 11px; color: #6b7280; }
.sign-name { font-size: 12px; font-weight: 600; margin-top: 2px; }

/* RESOLVE MODAL */
.resolve-hint { display: flex; align-items: center; gap: 8px; background: #f0fdf4; border-radius: 10px; padding: 12px; font-size: 13px; color: #15803d; font-weight: 600; margin-bottom: 14px; }
.foto-preview-after { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.after-thumb { width: 80px; height: 80px; object-fit: cover; border-radius: 10px; }

.center-content { display: flex; align-items: center; justify-content: center; }
</style>
