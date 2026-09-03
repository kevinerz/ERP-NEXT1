<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInstalasiStore } from '@/stores/instalasi'
import { useAuthStore } from '@/stores/auth'
import { fmtDateTime as fmtDt } from '@/composables/useFormat'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()
const ins = useInstalasiStore()
const auth = useAuthStore()

const id = Number(route.params.id)
const activeTab = ref<'log' | 'foto' | 'bast'>('log')

// Edit status
const showStatusModal = ref(false)
const newStatus = ref('')
const statusCatatan = ref('')
const statusSubmitting = ref(false)
const statusError = ref('')

// Edit info
const showEditModal = ref(false)
const editForm = ref({ id_layanan: 0, jenis_pelaksana: 'Internal', id_teknisi_internal: 0, id_kontak_teknisi: 0, tgl_jadwal: '', catatan: '', fee_vendor: 0 })
const editSubmitting = ref(false)
const editError = ref('')

// Foto
const fotoFile = ref<File | null>(null)
const fotoStage = ref('Proses')
const fotoCaption = ref('')
const fotoUploading = ref(false)

// BAST
const bastForm = ref({ nama_penandatangan_pelanggan: '', jabatan_penandatangan: '' })
const ttdTeknisiCanvas = ref<HTMLCanvasElement | null>(null)
const ttdPelangganCanvas = ref<HTMLCanvasElement | null>(null)
const ttdTeknisiCtx = ref<CanvasRenderingContext2D | null>(null)
const ttdPelangganCtx = ref<CanvasRenderingContext2D | null>(null)
const drawingTeknisi = ref(false)
const drawingPelanggan = ref(false)
const bastSubmitting = ref(false)
const bastError = ref('')

// Set PIN vendor
const showPinModal = ref(false)
const pinValue = ref('')
const pinSubmitting = ref(false)
const pinError = ref('')

// Supporting data
const layananList = ref<any[]>([])
const teknisiList = ref<any[]>([])
const kontakTeknisiList = ref<any[]>([])

const STATUS_LIST = ['Draft', 'Dijadwalkan', 'Dalam_Proses', 'Selesai', 'Dibatalkan']
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft', Dijadwalkan: 'Dijadwalkan', Dalam_Proses: 'Dalam Proses', Selesai: 'Selesai', Dibatalkan: 'Dibatalkan',
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Draft:        { bg: '#f1f5f9', color: '#64748b' },
  Dijadwalkan:  { bg: '#eff6ff', color: '#1d4ed8' },
  Dalam_Proses: { bg: '#fef9c3', color: '#a16207' },
  Selesai:      { bg: '#f0fdf4', color: '#15803d' },
  Dibatalkan:   { bg: '#fef2f2', color: '#dc2626' },
}
const FOTO_STAGE = ['Sebelum', 'Proses', 'Sesudah']

const d = computed(() => ins.current)

onMounted(async () => {
  await Promise.all([
    ins.fetchOne(id),
    api.get('/master/layanan').then(r => { layananList.value = r.data.data ?? [] }),
    api.get('/operations/teknisi-list').then(r => { teknisiList.value = r.data.data ?? [] }),
    api.get('/master/kontak-teknisi', { params: { limit: 200 } }).then(r => { kontakTeknisiList.value = r.data.data ?? [] }),
  ])
})

// ── STATUS ──────────────────────────────────────────────────────
function openStatus() {
  newStatus.value = d.value?.status_instalasi ?? ''
  statusCatatan.value = ''
  statusError.value = ''
  showStatusModal.value = true
}
async function submitStatus() {
  if (!newStatus.value) { statusError.value = 'Pilih status'; return }
  statusSubmitting.value = true; statusError.value = ''
  try {
    await ins.update(id, { status_instalasi: newStatus.value })
    if (statusCatatan.value) await ins.addLog({ id_instalasi: id, catatan: statusCatatan.value })
    await ins.fetchOne(id)
    showStatusModal.value = false
  } catch (e: any) { statusError.value = e.response?.data?.message || 'Gagal update status' }
  finally { statusSubmitting.value = false }
}

// ── EDIT INFO ────────────────────────────────────────────────────
function openEdit() {
  const c = d.value!
  editForm.value = {
    id_layanan: c.layanan?.id_layanan ?? 0,
    jenis_pelaksana: c.jenis_pelaksana,
    id_teknisi_internal: c.teknisi_internal?.id_karyawan ?? 0,
    id_kontak_teknisi: c.kontak_teknisi?.id_kontak ?? 0,
    tgl_jadwal: c.tgl_jadwal?.slice(0, 10) ?? '',
    catatan: c.catatan ?? '',
    fee_vendor: c.fee_vendor ?? 0,
  }
  editError.value = ''
  showEditModal.value = true
}
async function submitEdit() {
  editSubmitting.value = true; editError.value = ''
  try {
    const p: any = { ...editForm.value }
    if (!p.id_layanan) delete p.id_layanan
    if (!p.id_teknisi_internal) delete p.id_teknisi_internal
    if (!p.id_kontak_teknisi) delete p.id_kontak_teknisi
    if (!p.tgl_jadwal) delete p.tgl_jadwal
    await ins.update(id, p)
    await ins.fetchOne(id)
    showEditModal.value = false
  } catch (e: any) { editError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { editSubmitting.value = false }
}

// ── FOTO ─────────────────────────────────────────────────────────
async function uploadFoto() {
  if (!fotoFile.value) return
  fotoUploading.value = true
  try {
    await ins.uploadFoto(id, fotoFile.value, fotoStage.value, fotoCaption.value)
    await ins.fetchOne(id)
    fotoFile.value = null; fotoCaption.value = ''; fotoStage.value = 'Proses'
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal upload foto') }
  finally { fotoUploading.value = false }
}
async function hapusFoto(id_foto: number) {
  if (!confirm('Hapus foto ini?')) return
  await ins.deleteFoto(id_foto)
  await ins.fetchOne(id)
}
function fotoUrl(filename: string) {
  return `/uploads/instalasi/${id}/${filename}`
}

// ── BAST CANVAS ──────────────────────────────────────────────────
function initCanvas(canvasRef: HTMLCanvasElement | null, ctx: { value: CanvasRenderingContext2D | null }) {
  if (!canvasRef) return
  ctx.value = canvasRef.getContext('2d')
  if (ctx.value) {
    ctx.value.strokeStyle = '#0f172a'
    ctx.value.lineWidth = 2
    ctx.value.lineCap = 'round'
  }
}
function startDraw(e: MouseEvent | TouchEvent, which: 'teknisi' | 'pelanggan') {
  if (which === 'teknisi') { drawingTeknisi.value = true; initCanvas(ttdTeknisiCanvas.value, ttdTeknisiCtx) }
  else { drawingPelanggan.value = true; initCanvas(ttdPelangganCanvas.value, ttdPelangganCtx) }
  const ctx = which === 'teknisi' ? ttdTeknisiCtx.value : ttdPelangganCtx.value
  const canvas = which === 'teknisi' ? ttdTeknisiCanvas.value : ttdPelangganCanvas.value
  if (!ctx || !canvas) return
  const pos = getPos(e, canvas)
  ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  e.preventDefault()
}
function draw(e: MouseEvent | TouchEvent, which: 'teknisi' | 'pelanggan') {
  const drawing = which === 'teknisi' ? drawingTeknisi.value : drawingPelanggan.value
  if (!drawing) return
  const ctx = which === 'teknisi' ? ttdTeknisiCtx.value : ttdPelangganCtx.value
  const canvas = which === 'teknisi' ? ttdTeknisiCanvas.value : ttdPelangganCanvas.value
  if (!ctx || !canvas) return
  const pos = getPos(e, canvas)
  ctx.lineTo(pos.x, pos.y); ctx.stroke()
  e.preventDefault()
}
function stopDraw(which: 'teknisi' | 'pelanggan') {
  if (which === 'teknisi') drawingTeknisi.value = false
  else drawingPelanggan.value = false
}
function clearCanvas(which: 'teknisi' | 'pelanggan') {
  const canvas = which === 'teknisi' ? ttdTeknisiCanvas.value : ttdPelangganCanvas.value
  const ctx = which === 'teknisi' ? ttdTeknisiCtx.value : ttdPelangganCtx.value
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}
function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  if (e instanceof TouchEvent) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
  }
  return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top }
}

async function submitBAST() {
  bastSubmitting.value = true; bastError.value = ''
  try {
    // Upload TTD sebagai PNG, simpan path-nya
    const ttdTeknisiPath = ttdTeknisiCanvas.value ? await uploadCanvas(ttdTeknisiCanvas.value, 'teknisi') : null
    const ttdPelangganPath = ttdPelangganCanvas.value ? await uploadCanvas(ttdPelangganCanvas.value, 'pelanggan') : null
    await ins.saveBAST(id, {
      ...bastForm.value,
      ...(ttdTeknisiPath ? { ttd_teknisi_path: ttdTeknisiPath } : {}),
      ...(ttdPelangganPath ? { ttd_pelanggan_path: ttdPelangganPath } : {}),
    })
    await ins.fetchOne(id)
    bastError.value = ''
    alert('BAST berhasil disimpan')
  } catch (e: any) { bastError.value = e.response?.data?.message || 'Gagal menyimpan BAST' }
  finally { bastSubmitting.value = false }
}

async function uploadCanvas(canvas: HTMLCanvasElement, type: string): Promise<string | null> {
  return new Promise(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) { resolve(null); return }
      const form = new FormData()
      form.append('file', blob, `ttd_${type}_${id}.png`)
      form.append('stage', type)
      try {
        const { data } = await api.post(`/instalasi/${id}/foto`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
        resolve(`instalasi/${id}/${data.data?.filename}`)
      } catch { resolve(null) }
    }, 'image/png')
  })
}

function downloadBAST() {
  window.print()
}

// ── SET PIN VENDOR ───────────────────────────────────────────────
async function submitPin() {
  if (!pinValue.value || pinValue.value.length < 4) { pinError.value = 'PIN minimal 4 karakter'; return }
  pinSubmitting.value = true; pinError.value = ''
  try {
    const idKontak = d.value?.kontak_teknisi?.id_kontak
    if (!idKontak) { pinError.value = 'Tidak ada kontak teknisi'; return }
    await ins.setVendorPin(idKontak, pinValue.value)
    showPinModal.value = false
    pinValue.value = ''
    alert('PIN berhasil diset')
  } catch (e: any) { pinError.value = e.response?.data?.message || 'Gagal set PIN' }
  finally { pinSubmitting.value = false }
}

// ── HAPUS ORDER ──────────────────────────────────────────────────
async function hapusOrder() {
  if (!confirm(`Hapus order ${d.value?.nomor_instalasi}? Hanya Draft/Dibatalkan yang bisa dihapus.`)) return
  try {
    await ins.remove(id)
    router.push('/instalasi')
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal menghapus') }
}
</script>

<template>
  <div class="page">
    <div v-if="ins.loading && !d" class="loading-full">Memuat...</div>
    <div v-else-if="!d" class="loading-full text-gray">Data tidak ditemukan</div>
    <template v-else>
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <button class="btn-back" @click="router.push('/instalasi')">← Kembali</button>
          <div>
            <div class="nomor">{{ d.nomor_instalasi }}</div>
            <span class="status-badge"
              :style="{ background: STATUS_COLOR[d.status_instalasi]?.bg, color: STATUS_COLOR[d.status_instalasi]?.color }">
              {{ STATUS_LABEL[d.status_instalasi] || d.status_instalasi }}
            </span>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-outline" @click="openEdit">✏️ Edit</button>
          <button class="btn-outline" @click="openStatus">🔄 Update Status</button>
          <button v-if="d.jenis_pelaksana === 'Vendor' && auth.hasRole('Admin')"
            class="btn-outline" @click="showPinModal = true; pinValue = ''; pinError = ''">🔑 Set PIN Vendor</button>
          <button v-if="auth.hasRole('Admin')" class="btn-hapus" @click="hapusOrder">🗑 Hapus</button>
        </div>
      </div>

      <!-- Info Cards -->
      <div class="info-grid">
        <div class="info-card">
          <div class="card-label">Site</div>
          <div class="card-value fw600">{{ d.site?.nama_site }}</div>
          <div class="card-sub">{{ d.site?.kode_site }} · {{ d.site?.kota }}</div>
          <div class="card-sub">{{ d.site?.pelanggan?.nama_pelanggan }}</div>
        </div>
        <div class="info-card">
          <div class="card-label">Layanan</div>
          <div class="card-value">{{ d.layanan?.nama_layanan || '—' }}</div>
          <div class="card-sub">{{ d.layanan?.kode_layanan }}</div>
        </div>
        <div class="info-card">
          <div class="card-label">Pelaksana</div>
          <div class="card-value">
            <span :class="['jenis-badge', d.jenis_pelaksana === 'Vendor' ? 'vendor' : 'internal']">{{ d.jenis_pelaksana }}</span>
          </div>
          <div class="card-sub fw600">
            {{ d.jenis_pelaksana === 'Vendor'
              ? (d.kontak_teknisi?.nama || '—')
              : (d.teknisi_internal?.nama_lengkap || '—') }}
          </div>
          <div v-if="d.jenis_pelaksana === 'Vendor'" class="card-sub">
            {{ d.kontak_teknisi?.asal_vendor }} · {{ d.kontak_teknisi?.no_hp }}
          </div>
          <div v-if="d.jenis_pelaksana === 'Vendor' && d.fee_vendor" class="card-sub">
            Fee: Rp {{ Number(d.fee_vendor).toLocaleString('id') }}
          </div>
        </div>
        <div class="info-card">
          <div class="card-label">Jadwal & Waktu</div>
          <div class="card-sub">Jadwal: <b>{{ d.tgl_jadwal ? d.tgl_jadwal.slice(0,10) : '—' }}</b></div>
          <div class="card-sub">Mulai: {{ d.tgl_mulai ? fmtDt(d.tgl_mulai) : '—' }}</div>
          <div class="card-sub">Selesai: {{ d.tgl_selesai ? fmtDt(d.tgl_selesai) : '—' }}</div>
        </div>
      </div>

      <div v-if="d.catatan" class="catatan-box">📝 {{ d.catatan }}</div>

      <!-- Tabs -->
      <div class="tabs">
        <button :class="['tab', { active: activeTab === 'log' }]" @click="activeTab = 'log'">
          Log ({{ d.logs?.length ?? 0 }})
        </button>
        <button :class="['tab', { active: activeTab === 'foto' }]" @click="activeTab = 'foto'">
          Foto ({{ d.photos?.length ?? 0 }})
        </button>
        <button :class="['tab', { active: activeTab === 'bast' }]" @click="activeTab = 'bast'">
          BAST TTD
        </button>
      </div>

      <!-- Tab: Log -->
      <div v-if="activeTab === 'log'" class="tab-content">
        <div v-if="!d.logs?.length" class="empty-tab">Belum ada log</div>
        <div v-for="log in d.logs" :key="log.id_log" class="log-item">
          <div class="log-time">{{ fmtDt(log.created_at) }}</div>
          <div v-if="log.status_dari || log.status_ke" class="log-status">
            <span class="status-badge-sm" :style="{ background: STATUS_COLOR[log.status_dari ?? '']?.bg ?? '#f1f5f9', color: STATUS_COLOR[log.status_dari ?? '']?.color ?? '#64748b' }">
              {{ STATUS_LABEL[log.status_dari ?? ''] || log.status_dari || '—' }}
            </span>
            →
            <span class="status-badge-sm" :style="{ background: STATUS_COLOR[log.status_ke ?? '']?.bg ?? '#f1f5f9', color: STATUS_COLOR[log.status_ke ?? '']?.color ?? '#64748b' }">
              {{ STATUS_LABEL[log.status_ke ?? ''] || log.status_ke || '—' }}
            </span>
          </div>
          <div v-if="log.catatan" class="log-catatan">{{ log.catatan }}</div>
        </div>
      </div>

      <!-- Tab: Foto -->
      <div v-if="activeTab === 'foto'" class="tab-content">
        <div class="foto-upload-bar">
          <select v-model="fotoStage" class="filter-select">
            <option v-for="s in FOTO_STAGE" :key="s" :value="s">{{ s }}</option>
          </select>
          <input type="text" v-model="fotoCaption" placeholder="Keterangan foto (opsional)" class="caption-input" />
          <label class="btn-file">
            Pilih Foto
            <input type="file" accept="image/*" @change="(e: any) => fotoFile = e.target.files[0]" style="display:none" />
          </label>
          <span v-if="fotoFile" class="file-name">{{ fotoFile.name }}</span>
          <button class="btn-upload" @click="uploadFoto" :disabled="!fotoFile || fotoUploading">
            {{ fotoUploading ? 'Upload...' : 'Upload' }}
          </button>
        </div>
        <div v-if="!d.photos?.length" class="empty-tab">Belum ada foto</div>
        <div class="foto-grid">
          <div v-for="foto in d.photos" :key="foto.id_foto" class="foto-card">
            <img :src="fotoUrl(foto.filename)" :alt="foto.caption ?? foto.stage" />
            <div class="foto-info">
              <span class="foto-stage">{{ foto.stage }}</span>
              <span v-if="foto.caption" class="foto-caption">{{ foto.caption }}</span>
              <button v-if="auth.hasRole('Admin')" class="btn-del-foto" @click="hapusFoto(foto.id_foto)">×</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: BAST -->
      <div v-if="activeTab === 'bast'" class="tab-content">
        <div v-if="d.bast" class="bast-saved">
          ✅ BAST sudah ditandatangani — {{ fmtDt(d.bast.tgl_ditandatangani!) }}
          <div class="bast-meta">
            Penandatangan: <b>{{ d.bast.nama_penandatangan_pelanggan }}</b>
            {{ d.bast.jabatan_penandatangan ? '(' + d.bast.jabatan_penandatangan + ')' : '' }}
          </div>
          <div v-if="d.bast.ttd_pelanggan_path || d.bast.ttd_teknisi_path" class="ttd-preview-row">
            <div v-if="d.bast.ttd_teknisi_path">
              <div class="ttd-label">TTD Teknisi</div>
              <img :src="'/uploads/' + d.bast.ttd_teknisi_path" class="ttd-preview-img" />
            </div>
            <div v-if="d.bast.ttd_pelanggan_path">
              <div class="ttd-label">TTD Pelanggan</div>
              <img :src="'/uploads/' + d.bast.ttd_pelanggan_path" class="ttd-preview-img" />
            </div>
          </div>
          <button class="btn-outline" style="margin-top:12px" @click="downloadBAST">⬇️ Print / Download</button>
        </div>

        <div class="bast-form">
          <h4>{{ d.bast ? 'Perbarui BAST' : 'Input BAST' }}</h4>
          <div class="form-grid">
            <div class="field">
              <label>Nama Penandatangan Pelanggan</label>
              <input v-model="bastForm.nama_penandatangan_pelanggan" placeholder="Nama lengkap" />
            </div>
            <div class="field">
              <label>Jabatan</label>
              <input v-model="bastForm.jabatan_penandatangan" placeholder="Jabatan" />
            </div>
          </div>

          <div class="ttd-section">
            <div class="ttd-block">
              <div class="ttd-label">Tanda Tangan Teknisi</div>
              <canvas ref="ttdTeknisiCanvas" width="300" height="120" class="ttd-canvas"
                @mousedown="startDraw($event, 'teknisi')"
                @mousemove="draw($event, 'teknisi')"
                @mouseup="stopDraw('teknisi')"
                @mouseleave="stopDraw('teknisi')"
                @touchstart="startDraw($event, 'teknisi')"
                @touchmove="draw($event, 'teknisi')"
                @touchend="stopDraw('teknisi')">
              </canvas>
              <button class="btn-clear" @click="clearCanvas('teknisi')">Ulangi</button>
            </div>
            <div class="ttd-block">
              <div class="ttd-label">Tanda Tangan Pelanggan</div>
              <canvas ref="ttdPelangganCanvas" width="300" height="120" class="ttd-canvas"
                @mousedown="startDraw($event, 'pelanggan')"
                @mousemove="draw($event, 'pelanggan')"
                @mouseup="stopDraw('pelanggan')"
                @mouseleave="stopDraw('pelanggan')"
                @touchstart="startDraw($event, 'pelanggan')"
                @touchmove="draw($event, 'pelanggan')"
                @touchend="stopDraw('pelanggan')">
              </canvas>
              <button class="btn-clear" @click="clearCanvas('pelanggan')">Ulangi</button>
            </div>
          </div>

          <p v-if="bastError" class="form-error">{{ bastError }}</p>
          <div style="margin-top:14px; display:flex; gap:10px">
            <button class="btn-submit" @click="submitBAST" :disabled="bastSubmitting">
              {{ bastSubmitting ? 'Menyimpan...' : 'Simpan BAST' }}
            </button>
            <button class="btn-outline" @click="downloadBAST">⬇️ Print</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal Update Status -->
    <div v-if="showStatusModal" class="modal-overlay" @click.self="showStatusModal = false">
      <div class="modal">
        <h3>Update Status</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Status Baru</label>
            <select v-model="newStatus">
              <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="statusCatatan" rows="3" placeholder="Catatan perubahan..."></textarea>
          </div>
        </div>
        <p v-if="statusError" class="form-error">{{ statusError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showStatusModal = false">Batal</button>
          <button class="btn-submit" @click="submitStatus" :disabled="statusSubmitting">
            {{ statusSubmitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Edit Info -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h3>Edit Order</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Layanan</label>
            <select v-model="editForm.id_layanan">
              <option :value="0">— Pilih Layanan —</option>
              <option v-for="l in layananList" :key="l.id_layanan" :value="l.id_layanan">{{ l.nama_layanan }}</option>
            </select>
          </div>
          <div class="field">
            <label>Jenis Pelaksana</label>
            <select v-model="editForm.jenis_pelaksana">
              <option value="Internal">Internal</option>
              <option value="Vendor">Vendor Pihak 3</option>
            </select>
          </div>
          <div class="field">
            <label>Jadwal</label>
            <input type="date" v-model="editForm.tgl_jadwal" />
          </div>
          <div v-if="editForm.jenis_pelaksana === 'Internal'" class="field full">
            <label>Teknisi Internal</label>
            <select v-model="editForm.id_teknisi_internal">
              <option :value="0">— Belum di-assign —</option>
              <option v-for="t in teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
            </select>
          </div>
          <div v-if="editForm.jenis_pelaksana === 'Vendor'" class="field full">
            <label>Kontak Teknisi Vendor</label>
            <select v-model="editForm.id_kontak_teknisi">
              <option :value="0">— Belum di-assign —</option>
              <option v-for="k in kontakTeknisiList" :key="k.id_kontak" :value="k.id_kontak">
                {{ k.nama }} {{ k.asal_vendor ? '(' + k.asal_vendor + ')' : '' }}
              </option>
            </select>
          </div>
          <div v-if="editForm.jenis_pelaksana === 'Vendor'" class="field">
            <label>Fee Vendor (Rp)</label>
            <input type="number" v-model="editForm.fee_vendor" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="editForm.catatan" rows="2"></textarea>
          </div>
        </div>
        <p v-if="editError" class="form-error">{{ editError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEditModal = false">Batal</button>
          <button class="btn-submit" @click="submitEdit" :disabled="editSubmitting">
            {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Set PIN Vendor -->
    <div v-if="showPinModal" class="modal-overlay" @click.self="showPinModal = false">
      <div class="modal" style="width:360px">
        <h3>Set PIN Login Vendor</h3>
        <p class="pin-info">PIN untuk <b>{{ d?.kontak_teknisi?.nama }}</b> agar bisa login di aplikasi mobile.</p>
        <div class="field">
          <label>PIN (4–10 digit)</label>
          <input type="password" v-model="pinValue" placeholder="••••" maxlength="10" />
        </div>
        <p v-if="pinError" class="form-error">{{ pinError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showPinModal = false">Batal</button>
          <button class="btn-submit" @click="submitPin" :disabled="pinSubmitting">
            {{ pinSubmitting ? 'Menyimpan...' : 'Set PIN' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.loading-full { padding: 60px; text-align: center; color: #94a3b8; font-size: 16px; }
.text-gray { color: #64748b; }

/* Header */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
.header-left { display: flex; align-items: center; gap: 16px; }
.btn-back { padding: 8px 14px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; color: #374151; }
.nomor { font-size: 20px; font-weight: 800; color: #1e40af; margin-bottom: 4px; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-outline { padding: 8px 14px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: #374151; }
.btn-outline:hover { background: #f8fafc; }
.btn-hapus { padding: 8px 14px; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.status-badge { padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 700; }

/* Info cards */
.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
.info-card { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.card-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.card-value { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 4px; }
.card-sub { font-size: 12px; color: #64748b; }
.fw600 { font-weight: 600; }
.catatan-box { background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #713f12; margin-bottom: 16px; }
.jenis-badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; }
.jenis-badge.internal { background: #eff6ff; color: #1d4ed8; }
.jenis-badge.vendor { background: #f5f3ff; color: #6d28d9; }

/* Tabs */
.tabs { display: flex; gap: 4px; border-bottom: 2px solid #e2e8f0; margin-bottom: 0; }
.tab { padding: 10px 18px; border: none; background: none; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tab.active { color: #1e40af; border-bottom-color: #1e40af; }
.tab-content { background: #fff; border-radius: 0 0 12px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px; min-height: 200px; }
.empty-tab { text-align: center; color: #94a3b8; padding: 40px; }

/* Log */
.log-item { padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
.log-item:last-child { border-bottom: none; }
.log-time { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.log-status { font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.status-badge-sm { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.log-catatan { font-size: 13px; color: #374151; background: #f8fafc; border-radius: 6px; padding: 6px 10px; margin-top: 4px; }

/* Foto */
.foto-upload-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
.caption-input { flex: 1; min-width: 160px; padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
.btn-file { padding: 8px 14px; background: #f1f5f9; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.file-name { font-size: 12px; color: #64748b; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn-upload { padding: 8px 16px; background: #1e40af; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-upload:disabled { opacity: 0.5; cursor: not-allowed; }
.foto-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.foto-card { border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; position: relative; }
.foto-card img { width: 100%; height: 130px; object-fit: cover; display: block; }
.foto-info { padding: 6px 8px; display: flex; align-items: center; gap: 6px; background: #f8fafc; }
.foto-stage { font-size: 11px; font-weight: 700; background: #eff6ff; color: #1d4ed8; padding: 1px 6px; border-radius: 6px; }
.foto-caption { font-size: 11px; color: #64748b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn-del-foto { background: none; border: none; color: #ef4444; font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; }

/* BAST */
.bast-saved { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 14px; color: #15803d; }
.bast-meta { font-size: 13px; color: #166534; margin-top: 6px; }
.ttd-preview-row { display: flex; gap: 20px; margin-top: 12px; flex-wrap: wrap; }
.ttd-preview-img { max-width: 200px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
.bast-form h4 { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 16px; }
.ttd-section { display: flex; gap: 24px; flex-wrap: wrap; margin: 16px 0; }
.ttd-block { display: flex; flex-direction: column; gap: 8px; }
.ttd-label { font-size: 12px; font-weight: 700; color: #374151; }
.ttd-canvas { border: 1.5px dashed #94a3b8; border-radius: 8px; background: #f8fafc; cursor: crosshair; touch-action: none; }
.btn-clear { padding: 4px 10px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; align-self: flex-start; }

/* Shared */
.filter-select { padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 540px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 16px; font-size: 18px; color: #0f172a; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.pin-info { font-size: 13px; color: #374151; margin: 0 0 14px; }

@media print {
  .page-header, .tabs, .foto-upload-bar, .btn-submit, .btn-clear, .btn-back, .btn-outline, .btn-hapus { display: none !important; }
  .tab-content { box-shadow: none; }
}
</style>
