<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/instalasi" text="" />
        </ion-buttons>
        <ion-title>{{ item?.nomor_instalasi ?? 'Detail Instalasi' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="store.loading && !item" class="loading-wrap">
        <ion-spinner name="crescent" color="success" />
      </div>

      <template v-else-if="item">
        <!-- Status Header -->
        <div class="status-header">
          <span class="status-badge" :class="statusClass(item.status_instalasi)">
            {{ statusLabel(item.status_instalasi) }}
          </span>
          <div class="site-name">{{ item.site?.nama_site }}</div>
          <div class="pelanggan-name">{{ item.site?.pelanggan?.nama_pelanggan }}</div>
        </div>

        <!-- Info Section -->
        <div class="section-card">
          <div class="info-row" v-if="item.layanan">
            <span class="info-lbl">Layanan</span>
            <span class="info-val">{{ item.layanan.nama_layanan }}</span>
          </div>
          <div class="info-row" v-if="item.tgl_jadwal">
            <span class="info-lbl">Jadwal</span>
            <span class="info-val">{{ fmtDate(item.tgl_jadwal) }}</span>
          </div>
          <div class="info-row" v-if="item.site?.alamat">
            <span class="info-lbl">Alamat</span>
            <span class="info-val">{{ item.site.alamat }}</span>
          </div>
          <div class="info-row" v-if="item.catatan">
            <span class="info-lbl">Catatan</span>
            <span class="info-val">{{ item.catatan }}</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="action-row" v-if="canChangeStatus">
          <button class="action-btn primary" @click="showStatusModal = true">
            <ion-icon :icon="refreshOutline" /> Update Status
          </button>
        </div>

        <!-- Tabs -->
        <div class="tab-bar">
          <button class="tab-btn" :class="{ active: tab === 'log' }" @click="tab = 'log'">Log</button>
          <button class="tab-btn" :class="{ active: tab === 'foto' }" @click="tab = 'foto'">Foto</button>
          <button class="tab-btn" :class="{ active: tab === 'bast' }" @click="tab = 'bast'">BAST TTD</button>
        </div>

        <!-- LOG Tab -->
        <div v-if="tab === 'log'" class="tab-content">
          <div v-if="!item.logs?.length" class="empty-tab">Belum ada log</div>
          <div v-for="log in item.logs" :key="log.id_log" class="log-item">
            <div class="log-dot" />
            <div class="log-body">
              <div v-if="log.status_dari || log.status_ke" class="log-status">
                <span>{{ log.status_dari ?? '—' }}</span>
                <ion-icon :icon="arrowForwardOutline" />
                <span class="log-status-ke">{{ log.status_ke ?? '—' }}</span>
              </div>
              <div v-if="log.catatan" class="log-catatan">{{ log.catatan }}</div>
              <div class="log-time">{{ fmtDateTime(log.created_at) }}</div>
            </div>
          </div>

          <!-- Add catatan -->
          <div class="add-log-box">
            <textarea v-model="newCatatan" placeholder="Tambah catatan..." class="catatan-input" rows="2" />
            <button class="add-log-btn" :disabled="!newCatatan.trim() || savingLog" @click="doAddLog">
              <ion-spinner v-if="savingLog" name="crescent" style="width:16px;height:16px" />
              <span v-else>Kirim</span>
            </button>
          </div>
        </div>

        <!-- FOTO Tab -->
        <div v-if="tab === 'foto'" class="tab-content">
          <!-- Upload button -->
          <div class="foto-upload-row">
            <select v-model="fotoStage" class="stage-select">
              <option value="Sebelum">Sebelum</option>
              <option value="Proses">Proses</option>
              <option value="Sesudah">Sesudah</option>
            </select>
            <label class="upload-label">
              <ion-icon :icon="cameraOutline" />
              <span>{{ uploadingFoto ? 'Mengunggah...' : 'Ambil Foto' }}</span>
              <input type="file" accept="image/*" capture="environment" @change="onFotoChange" :disabled="uploadingFoto" style="display:none" />
            </label>
          </div>

          <div v-if="!item.photos?.length" class="empty-tab">Belum ada foto</div>
          <div class="foto-grid">
            <div v-for="foto in item.photos" :key="foto.id_foto" class="foto-item">
              <img :src="fotoUrl(foto.filename)" :alt="foto.caption ?? foto.stage" />
              <div class="foto-info">
                <span class="foto-stage">{{ foto.stage }}</span>
                <span v-if="foto.caption" class="foto-caption">{{ foto.caption }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- BAST Tab -->
        <div v-if="tab === 'bast'" class="tab-content">
          <div class="bast-info" v-if="item.bast?.nama_penandatangan_pelanggan">
            <p><strong>Penandatangan:</strong> {{ item.bast.nama_penandatangan_pelanggan }}</p>
            <p v-if="item.bast.jabatan_penandatangan"><strong>Jabatan:</strong> {{ item.bast.jabatan_penandatangan }}</p>
          </div>

          <div class="bast-form">
            <label class="bast-label">Nama Penandatangan Pelanggan</label>
            <input v-model="bastNama" class="bast-input" placeholder="Nama lengkap..." />
            <label class="bast-label">Jabatan</label>
            <input v-model="bastJabatan" class="bast-input" placeholder="Jabatan (opsional)" />
          </div>

          <!-- TTD Teknisi -->
          <div class="ttd-section">
            <div class="ttd-label">TTD Teknisi</div>
            <canvas ref="canvasTeknisi" class="ttd-canvas"
              @mousedown="startDraw($event, 'teknisi')" @mousemove="draw($event, 'teknisi')" @mouseup="stopDraw"
              @touchstart.prevent="startDraw($event, 'teknisi')" @touchmove.prevent="draw($event, 'teknisi')" @touchend="stopDraw"
            />
            <button class="clear-btn" @click="clearCanvas('teknisi')">Hapus</button>
          </div>

          <!-- TTD Pelanggan -->
          <div class="ttd-section">
            <div class="ttd-label">TTD Pelanggan</div>
            <canvas ref="canvasPelanggan" class="ttd-canvas"
              @mousedown="startDraw($event, 'pelanggan')" @mousemove="draw($event, 'pelanggan')" @mouseup="stopDraw"
              @touchstart.prevent="startDraw($event, 'pelanggan')" @touchmove.prevent="draw($event, 'pelanggan')" @touchend="stopDraw"
            />
            <button class="clear-btn" @click="clearCanvas('pelanggan')">Hapus</button>
          </div>

          <button class="save-bast-btn" :disabled="savingBAST || !bastNama.trim()" @click="doSaveBAST">
            <ion-spinner v-if="savingBAST" name="crescent" style="width:18px;height:18px;color:#fff" />
            <span v-else>Simpan BAST</span>
          </button>
          <div v-if="bastSuccess" class="bast-success">BAST berhasil disimpan!</div>
        </div>
      </template>
    </ion-content>

    <!-- Update Status Modal -->
    <ion-modal :is-open="showStatusModal" @ionModalDidDismiss="showStatusModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>Update Status</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showStatusModal = false">Tutup</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <div class="modal-body">
          <div class="modal-label">Status Baru</div>
          <select v-model="newStatus" class="modal-select">
            <option v-for="s in nextStatuses" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
          <div class="modal-label" style="margin-top:16px">Catatan</div>
          <textarea v-model="statusCatatan" class="modal-textarea" rows="3" placeholder="Catatan (opsional)" />
          <button class="modal-save-btn" :disabled="!newStatus || savingStatus" @click="doUpdateStatus">
            <ion-spinner v-if="savingStatus" name="crescent" style="width:18px;height:18px;color:#fff" />
            <span v-else>Simpan</span>
          </button>
        </div>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonBackButton, IonIcon, IonSpinner, IonModal,
} from '@ionic/vue'
import {
  refreshOutline, cameraOutline, arrowForwardOutline,
} from 'ionicons/icons'
import { useInstalasiStore, type InstalasiItem } from '../stores/instalasi'

const route = useRoute()
const store = useInstalasiStore()
const id = Number(route.params.id)

const item = computed(() => store.current)
const tab = ref<'log' | 'foto' | 'bast'>('log')

// ── Status ──
const showStatusModal = ref(false)
const newStatus = ref('')
const statusCatatan = ref('')
const savingStatus = ref(false)

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  Draft:        { label: 'Draft',       cls: 'gray' },
  Dijadwalkan:  { label: 'Dijadwalkan', cls: 'blue' },
  Dalam_Proses: { label: 'Dikerjakan',  cls: 'yellow' },
  Selesai:      { label: 'Selesai',     cls: 'green' },
  Dibatalkan:   { label: 'Dibatalkan',  cls: 'red' },
}
function statusLabel(s: string) { return STATUS_MAP[s]?.label ?? s }
function statusClass(s: string) { return STATUS_MAP[s]?.cls ?? 'gray' }

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  Dijadwalkan:  [{ value: 'Dalam_Proses', label: 'Mulai Kerjakan' }],
  Dalam_Proses: [{ value: 'Selesai', label: 'Tandai Selesai' }],
}
const nextStatuses = computed(() => NEXT_STATUS[item.value?.status_instalasi ?? ''] ?? [])
const canChangeStatus = computed(() => nextStatuses.value.length > 0)

async function doUpdateStatus() {
  if (!newStatus.value) return
  savingStatus.value = true
  try {
    await store.updateStatus(id, newStatus.value, statusCatatan.value || undefined)
    showStatusModal.value = false
    statusCatatan.value = ''
    newStatus.value = ''
    await store.fetchOne(id)
  } finally { savingStatus.value = false }
}

// ── Log ──
const newCatatan = ref('')
const savingLog = ref(false)

async function doAddLog() {
  if (!newCatatan.value.trim()) return
  savingLog.value = true
  try {
    await store.addLog(id, newCatatan.value.trim())
    newCatatan.value = ''
    await store.fetchOne(id)
  } finally { savingLog.value = false }
}

// ── Foto ──
const fotoStage = ref('Proses')
const uploadingFoto = ref(false)

const BASE_URL = (import.meta as any).env?.VITE_API_BASE?.replace('/api', '') ?? ''
function fotoUrl(filename: string) {
  return `${BASE_URL}/uploads/instalasi/${id}/${filename}`
}

async function onFotoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingFoto.value = true
  try {
    await store.uploadFoto(id, file, fotoStage.value)
    await store.fetchOne(id)
  } finally {
    uploadingFoto.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

// ── BAST ──
const canvasTeknisi = ref<HTMLCanvasElement | null>(null)
const canvasPelanggan = ref<HTMLCanvasElement | null>(null)
const bastNama = ref('')
const bastJabatan = ref('')
const savingBAST = ref(false)
const bastSuccess = ref(false)

let drawing = false
let activeCanvas: 'teknisi' | 'pelanggan' | null = null
let lastX = 0, lastY = 0

function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  if (e instanceof TouchEvent) {
    const t = e.touches[0]
    return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
  }
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}

function getCanvas(which: 'teknisi' | 'pelanggan') {
  return which === 'teknisi' ? canvasTeknisi.value : canvasPelanggan.value
}

function startDraw(e: MouseEvent | TouchEvent, which: 'teknisi' | 'pelanggan') {
  const canvas = getCanvas(which)
  if (!canvas) return
  drawing = true; activeCanvas = which
  const { x, y } = getPos(e, canvas)
  lastX = x; lastY = y
}

function draw(e: MouseEvent | TouchEvent, which: 'teknisi' | 'pelanggan') {
  if (!drawing || activeCanvas !== which) return
  const canvas = getCanvas(which)
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const { x, y } = getPos(e, canvas)
  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(x, y)
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.stroke()
  lastX = x; lastY = y
}

function stopDraw() { drawing = false; activeCanvas = null }

function clearCanvas(which: 'teknisi' | 'pelanggan') {
  const canvas = getCanvas(which)
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): File {
  const dataURL = canvas.toDataURL('image/png')
  const arr = dataURL.split(',')
  const mime = arr[0].match(/:(.*?);/)![1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new File([u8arr], name, { type: mime })
}

async function doSaveBAST() {
  savingBAST.value = true
  bastSuccess.value = false
  try {
    // Upload TTD sebagai foto
    let ttdTeknisiPath = item.value?.bast?.ttd_teknisi_path
    let ttdPelangganPath = item.value?.bast?.ttd_pelanggan_path

    if (canvasTeknisi.value) {
      const file = canvasToFile(canvasTeknisi.value, 'ttd_teknisi.png')
      const result = await store.uploadFoto(id, file, 'BAST_Teknisi')
      ttdTeknisiPath = result?.filename
    }
    if (canvasPelanggan.value) {
      const file = canvasToFile(canvasPelanggan.value, 'ttd_pelanggan.png')
      const result = await store.uploadFoto(id, file, 'BAST_Pelanggan')
      ttdPelangganPath = result?.filename
    }

    await store.saveBAST(id, {
      nama_penandatangan_pelanggan: bastNama.value,
      jabatan_penandatangan: bastJabatan.value || undefined,
      ttd_teknisi_path: ttdTeknisiPath,
      ttd_pelanggan_path: ttdPelangganPath,
      tgl_ditandatangani: new Date().toISOString(),
    })

    bastSuccess.value = true
    await store.fetchOne(id)
  } finally { savingBAST.value = false }
}

// ── Utils ──
function fmtDate(d?: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  await store.fetchOne(id)
  // Pre-fill BAST form
  if (item.value?.bast?.nama_penandatangan_pelanggan)
    bastNama.value = item.value.bast.nama_penandatangan_pelanggan
  if (item.value?.bast?.jabatan_penandatangan)
    bastJabatan.value = item.value.bast.jabatan_penandatangan

  // Init canvas
  await nextTick()
  for (const canvas of [canvasTeknisi.value, canvasPelanggan.value]) {
    if (!canvas) continue
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    const ctx = canvas.getContext('2d')!
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
  }
})
</script>

<style scoped>
.loading-wrap {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 80px 20px; gap: 12px; color: #9ca3af;
}

.status-header {
  background: linear-gradient(135deg, #14532d 0%, #16a34a 100%);
  padding: 20px 20px 16px; text-align: center; color: #fff;
}
.status-badge {
  display: inline-block; font-size: 11px; font-weight: 700;
  padding: 3px 12px; border-radius: 20px; margin-bottom: 8px;
}
.status-badge.gray   { background: rgba(255,255,255,0.2); color: #fff; }
.status-badge.blue   { background: #dbeafe; color: #1d4ed8; }
.status-badge.yellow { background: #fef9c3; color: #854d0e; }
.status-badge.green  { background: #dcfce7; color: #15803d; }
.status-badge.red    { background: #fee2e2; color: #b91c1c; }

.site-name { font-size: 18px; font-weight: 700; }
.pelanggan-name { font-size: 13px; opacity: 0.8; margin-top: 2px; }

.section-card {
  background: #fff; margin: 12px 16px;
  border-radius: 12px; padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.info-row {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 6px 0; border-bottom: 1px solid #f3f4f6; gap: 8px;
}
.info-row:last-child { border-bottom: none; }
.info-lbl { font-size: 12px; color: #9ca3af; flex-shrink: 0; }
.info-val { font-size: 13px; color: #111827; font-weight: 500; text-align: right; }

.action-row { padding: 0 16px 12px; }
.action-btn {
  width: 100%; padding: 12px; border: none; border-radius: 12px;
  font-size: 15px; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.action-btn.primary {
  background: linear-gradient(135deg, #16a34a, #059669);
  color: #fff; box-shadow: 0 4px 12px rgba(22,163,74,0.3);
}
.action-btn ion-icon { font-size: 18px; }

/* Tabs */
.tab-bar {
  display: flex; border-bottom: 2px solid #e5e7eb;
  padding: 0 16px; background: #fff;
}
.tab-btn {
  flex: 1; padding: 10px 0; border: none; background: none;
  font-size: 13px; font-weight: 600; color: #9ca3af; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -2px;
  transition: color 0.2s, border-color 0.2s;
}
.tab-btn.active { color: #16a34a; border-bottom-color: #16a34a; }

.tab-content { padding: 16px; }
.empty-tab { text-align: center; color: #9ca3af; padding: 32px 0; font-size: 14px; }

/* Log */
.log-item { display: flex; gap: 12px; margin-bottom: 16px; }
.log-dot {
  width: 10px; height: 10px; border-radius: 50%; background: #16a34a;
  flex-shrink: 0; margin-top: 4px;
}
.log-body { flex: 1; }
.log-status { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #374151; }
.log-status ion-icon { color: #9ca3af; }
.log-status-ke { color: #16a34a; }
.log-catatan { font-size: 13px; color: #374151; margin-top: 2px; }
.log-time { font-size: 11px; color: #9ca3af; margin-top: 4px; }

.add-log-box { display: flex; gap: 8px; margin-top: 16px; align-items: flex-end; }
.catatan-input {
  flex: 1; border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 8px 12px; font-size: 13px; resize: none; outline: none;
  font-family: inherit;
}
.catatan-input:focus { border-color: #16a34a; }
.add-log-btn {
  padding: 8px 16px; background: #16a34a; color: #fff;
  border: none; border-radius: 10px; font-size: 13px; font-weight: 700;
  cursor: pointer; white-space: nowrap;
}
.add-log-btn:disabled { opacity: 0.5; }

/* Foto */
.foto-upload-row { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; }
.stage-select {
  border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 8px 10px;
  font-size: 13px; outline: none; background: #fff;
}
.upload-label {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; background: #16a34a; color: #fff; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.upload-label ion-icon { font-size: 18px; }

.foto-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.foto-item { border-radius: 10px; overflow: hidden; background: #f3f4f6; }
.foto-item img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
.foto-info { padding: 6px 8px; }
.foto-stage { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; }
.foto-caption { font-size: 11px; color: #374151; display: block; margin-top: 2px; }

/* BAST */
.bast-info { background: #f0fdf4; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }
.bast-info p { margin: 0 0 4px; font-size: 13px; color: #374151; }

.bast-form { margin-bottom: 16px; }
.bast-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px; margin-top: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
.bast-input {
  width: 100%; box-sizing: border-box;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 10px 12px; font-size: 14px; outline: none; font-family: inherit;
}
.bast-input:focus { border-color: #16a34a; }

.ttd-section { margin-bottom: 16px; }
.ttd-label { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
.ttd-canvas {
  width: 100%; height: 140px; border: 2px solid #e5e7eb; border-radius: 10px;
  background: #fff; display: block; cursor: crosshair; touch-action: none;
}
.clear-btn {
  margin-top: 6px; padding: 5px 14px; border: 1.5px solid #e5e7eb;
  border-radius: 8px; background: #fff; font-size: 12px; color: #6b7280; cursor: pointer;
}

.save-bast-btn {
  width: 100%; padding: 14px; background: linear-gradient(135deg, #16a34a, #059669);
  color: #fff; border: none; border-radius: 12px; font-size: 16px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 8px;
}
.save-bast-btn:disabled { opacity: 0.5; }
.bast-success {
  text-align: center; color: #16a34a; font-weight: 600; font-size: 14px; margin-top: 10px;
}

/* Modal */
.modal-body { padding: 8px 0; }
.modal-label { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 6px; text-transform: uppercase; }
.modal-select {
  width: 100%; border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 10px 12px; font-size: 14px; outline: none; background: #fff;
}
.modal-textarea {
  width: 100%; box-sizing: border-box;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 10px 12px; font-size: 14px; resize: none; outline: none; font-family: inherit;
}
.modal-save-btn {
  width: 100%; padding: 14px; background: #16a34a; color: #fff; border: none;
  border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer;
  margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.modal-save-btn:disabled { opacity: 0.5; }
</style>
