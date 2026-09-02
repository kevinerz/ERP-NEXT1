<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOperationsStore } from '@/stores/operations'
import { useProyekStore } from '@/stores/proyek'
import { printLaporanTiket } from '@/composables/usePrint'
import { fmtDateTime as fmtDt, statusLabel } from '@/composables/useFormat'
import api from '@/services/api'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default icon paths broken by Vite bundling
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const router = useRouter()
const route = useRoute()
const ops = useOperationsStore()
const proyek = useProyekStore()
const id = Number(route.params.id)

const showEditModal = ref(false)
const editForm = ref<any>({})
const editSubmitting = ref(false)
const editError = ref('')

const showLogModal = ref(false)
const logForm = ref({ status_ke: '', catatan: '' })
const logSubmitting = ref(false)

const showWoModal = ref(false)
const woForm = ref({ jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' })
const woSubmitting = ref(false)
const woError = ref('')

const successMsg = ref('')

// ── FOTOS ────────────────────────────────────────────────────
const fotos = ref<any[]>([])
const previewUrl = ref('')

async function fetchFotos() {
  try {
    const { data } = await api.get(`/operations/${id}/fotos`)
    fotos.value = data.data ?? data
  } catch { /* silent */ }
}

function fotosOf(stage: string) { return fotos.value.filter(f => f.stage === stage) }
function stageLabel(s: string) { return s === 'before' ? 'Sebelum Pekerjaan' : s === 'proses' ? 'Proses Pengerjaan' : s === 'after' ? 'Sesudah Pekerjaan' : s }

// ── MAP ──────────────────────────────────────────────────────
const mapContainer = ref<HTMLDivElement | null>(null)
let mapInstance: L.Map | null = null
let teknisiMarker: L.Marker | null = null
let siteMarker: L.Marker | null = null
let polyline: L.Polyline | null = null
const teknisiLokasi = ref<{ nama_lengkap: string; latitude: number; longitude: number; updated_at: string } | null>(null)
let lokasiInterval: ReturnType<typeof setInterval> | null = null

const iconTeknisi = L.divIcon({
  html: `<div style="background:#16a34a;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #16a34a,0 2px 6px rgba(0,0,0,0.3)"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})
const iconSite = L.divIcon({
  html: `<div style="background:#3b82f6;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6,0 2px 6px rgba(0,0,0,0.3)"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

async function fetchTeknisiLokasi() {
  if (!ops.current?.teknisi) return
  try {
    const { data } = await api.get('/mobile/lokasi/all')
    const list: any[] = data.data ?? data
    const match = list.find((l: any) => l.id_karyawan === ops.current!.teknisi!.id_karyawan)
    if (match) {
      teknisiLokasi.value = { ...match, ...match.karyawan }
      updateTeknisiMarker(match.latitude, match.longitude)
    }
  } catch { /* silent */ }
}

function initMap() {
  if (!mapContainer.value || mapInstance) return
  const site = ops.current?.site
  const siteLatLng = parseSiteLatLng(site?.koordinat_gps)
  const center = siteLatLng ?? [-6.2, 106.8]

  mapInstance = L.map(mapContainer.value, { zoomControl: true, scrollWheelZoom: true }).setView(center, 13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(mapInstance)

  if (siteLatLng) {
    siteMarker = L.marker(siteLatLng, { icon: iconSite })
      .addTo(mapInstance)
      .bindPopup(`<b>${site?.nama_site}</b><br>${site?.kota || ''}`)
  }
}

function parseSiteLatLng(koordinat?: string): [number, number] | null {
  if (!koordinat) return null
  const parts = koordinat.split(',').map(s => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return [parts[0], parts[1]]
  return null
}

function updateTeknisiMarker(lat: number, lng: number) {
  if (!mapInstance) return
  const latlng: L.LatLngExpression = [lat, lng]
  if (teknisiMarker) {
    teknisiMarker.setLatLng(latlng)
  } else {
    teknisiMarker = L.marker(latlng, { icon: iconTeknisi })
      .addTo(mapInstance)
      .bindPopup(`<b>${ops.current?.teknisi?.nama_lengkap}</b><br>Lokasi Teknisi`)
  }

  // Garis dari teknisi ke site
  const siteLatLng = parseSiteLatLng(ops.current?.site?.koordinat_gps)
  if (siteLatLng) {
    if (polyline) polyline.setLatLngs([latlng, siteLatLng])
    else polyline = L.polyline([latlng, siteLatLng], { color: '#16a34a', weight: 2, dashArray: '6 4', opacity: 0.6 }).addTo(mapInstance)
    mapInstance.fitBounds(L.latLngBounds([latlng, siteLatLng]).pad(0.2))
  } else {
    mapInstance.setView(latlng, 14)
  }
}

function destroyMap() {
  if (lokasiInterval) clearInterval(lokasiInterval)
  if (mapInstance) { mapInstance.remove(); mapInstance = null }
  teknisiMarker = null; siteMarker = null; polyline = null
}

const STATUS_LIST = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed']
const PRIORITAS_LIST = ['Low', 'Medium', 'High', 'Critical']
const JENIS_WO = ['Troubleshoot', 'Maintenance', 'Instalasi', 'Survey', 'Upgrade']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Open:             { bg: '#eff6ff', color: '#1d4ed8' },
  In_Progress:      { bg: '#fef9c3', color: '#a16207' },
  Pending_Customer: { bg: '#fff7ed', color: '#c2410c' },
  Resolved:         { bg: '#f0fdf4', color: '#15803d' },
  Closed:           { bg: '#f1f5f9', color: '#64748b' },
}
const PRIORITAS_COLOR: Record<string, string> = {
  Low: '#64748b', Medium: '#3b82f6', High: '#f97316', Critical: '#ef4444',
}
const WO_STATUS_COLOR: Record<string, string> = {
  Open: '#64748b', Dispatch: '#3b82f6', 'On-Site': '#f59e0b',
  Selesai: '#22c55e', Ditunda: '#f97316', Dibatalkan: '#ef4444',
}

onMounted(async () => {
  await Promise.all([
    ops.fetchOne(id),
    ops.fetchTeknisiList(),
    proyek.fetchSiteList(),
  ])
  await fetchFotos()
  await nextTick()
  initMap()
  await fetchTeknisiLokasi()
  lokasiInterval = setInterval(fetchTeknisiLokasi, 15000)
})

onUnmounted(destroyMap)

function openEdit() {
  const t = ops.current!
  editForm.value = {
    judul_tiket: t.judul_tiket,
    deskripsi_masalah: t.deskripsi_masalah || '',
    prioritas: t.prioritas,
    status_tiket: t.status_tiket,
    id_teknisi_pic: t.teknisi?.id_karyawan || 0,
  }
  editError.value = ''; showEditModal.value = true
}

async function handleEdit() {
  editSubmitting.value = true; editError.value = ''
  try {
    const payload: any = { ...editForm.value }
    if (!payload.id_teknisi_pic) payload.id_teknisi_pic = null
    await ops.update(id, payload)
    await ops.fetchOne(id)
    showEditModal.value = false; flash('Tiket diperbarui')
  } catch (e: any) { editError.value = e.response?.data?.message || 'Gagal' }
  finally { editSubmitting.value = false }
}

async function handleAddLog() {
  logSubmitting.value = true
  try {
    await ops.addLog({
      id_ticket: id,
      status_ke: logForm.value.status_ke || undefined,
      catatan: logForm.value.catatan || undefined,
    })
    await ops.fetchOne(id)
    showLogModal.value = false
    logForm.value = { status_ke: '', catatan: '' }
    flash('Log ditambahkan')
  } catch { flash('Gagal tambah log') }
  finally { logSubmitting.value = false }
}

async function handleAddWo() {
  if (!woForm.value.tgl_jadwal || !woForm.value.deskripsi_tugas) {
    woError.value = 'Jadwal dan deskripsi wajib diisi'; return
  }
  woSubmitting.value = true; woError.value = ''
  try {
    await proyek.createWo({
      jenis_wo: woForm.value.jenis_wo,
      id_ticket: id,
      id_site: ops.current!.site!.id_site,
      tipe_eksekutor: woForm.value.tipe_eksekutor,
      id_teknisi_internal: woForm.value.tipe_eksekutor === 'Internal_NEXT1' && woForm.value.id_teknisi_internal ? woForm.value.id_teknisi_internal : undefined,
      fee_vendor: woForm.value.fee_vendor || undefined,
      tgl_jadwal: new Date(woForm.value.tgl_jadwal).toISOString(),
      deskripsi_tugas: woForm.value.deskripsi_tugas,
    })
    await ops.fetchOne(id)
    showWoModal.value = false
    woForm.value = { jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' }
    flash('Work Order dibuat')
  } catch (e: any) { woError.value = e.response?.data?.message || 'Gagal' }
  finally { woSubmitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }

async function hapusTiket() {
  if (!confirm('Hapus tiket ini?')) return
  try {
    await api.delete(`/operations/${id}`)
    router.push('/operations')
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus tiket')
  }
}

function slaInfo(t: any): { label: string; cls: string } {
  if (['Resolved', 'Closed'].includes(t.status_tiket)) {
    return t.sla_breached ? { label: 'Selesai (telat)', cls: 'sla-late-done' } : { label: 'Terpenuhi ✓', cls: 'sla-ok' }
  }
  if (!t.sla_due) return { label: '—', cls: 'sla-none' }
  const sisaMs = new Date(t.sla_due).getTime() - Date.now()
  if (sisaMs <= 0) {
    const jam = Math.floor(-sisaMs / 3600_000)
    return { label: `TELAT ${jam >= 1 ? jam + ' jam' : '<1 jam'}`, cls: 'sla-late' }
  }
  const jam = Math.floor(sisaMs / 3600_000)
  const menit = Math.floor((sisaMs % 3600_000) / 60_000)
  return { label: `sisa ${jam >= 1 ? jam + 'j ' : ''}${menit}m`, cls: sisaMs < 2 * 3600_000 ? 'sla-warning' : 'sla-safe' }
}
function ageHours(d: string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  return h < 24 ? `${h} jam` : `${Math.floor(h / 24)} hari`
}
</script>

<template>
  <div class="page">
    <div v-if="ops.loading && !ops.current" class="loading-page">Memuat...</div>
    <div v-else-if="ops.error" class="alert-error">{{ ops.error }}</div>
    <template v-else-if="ops.current">
      <!-- Header -->
      <div class="page-header">
        <div>
          <button class="btn-back" @click="router.push('/operations')">← Operasional</button>
          <h2>{{ ops.current.nomor_tiket }}</h2>
          <p class="sub">{{ ops.current.judul_tiket }}</p>
        </div>
        <div class="header-right">
          <span :class="['sla-badge-lg', slaInfo(ops.current).cls]" title="Deadline SLA berdasarkan prioritas">
            SLA: {{ slaInfo(ops.current).label }}
          </span>
          <span class="prioritas-badge" :style="{ color: PRIORITAS_COLOR[ops.current.prioritas], background: PRIORITAS_COLOR[ops.current.prioritas] + '20' }">
            ● {{ ops.current.prioritas }}
          </span>
          <span class="status-big"
            :style="{ background: STATUS_COLOR[ops.current.status_tiket]?.bg, color: STATUS_COLOR[ops.current.status_tiket]?.color }">
            {{ statusLabel(ops.current.status_tiket) }}
          </span>
          <button class="btn-print" @click="printLaporanTiket(ops.current)">🖨 Laporan</button>
          <button class="btn-edit" @click="openEdit">Edit</button>
          <button
            v-if="ops.current.status_tiket === 'Open' || ops.current.status_tiket === 'Closed'"
            class="btn-hapus"
            @click="hapusTiket"
          >Hapus</button>
        </div>
      </div>

      <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-chip">
          <span class="ic-label">Pelanggan</span>
          <span class="ic-value fw">{{ ops.current.site?.pelanggan?.nama_pelanggan }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Site</span>
          <span class="ic-value">{{ ops.current.site?.nama_site }} <span class="text-gray">· {{ ops.current.site?.kota }}</span></span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Layanan</span>
          <span class="ic-value">{{ ops.current.site?.layanan?.nama_layanan || '—' }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Teknisi PIC</span>
          <span class="ic-value fw">{{ ops.current.teknisi?.nama_lengkap || 'Belum assigned' }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Sumber</span>
          <span class="ic-value">{{ ops.current.sumber_tiket }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Durasi</span>
          <span class="ic-value" style="color:#f97316;font-weight:700">{{ ageHours(ops.current.tgl_open) }}</span>
        </div>
      </div>

      <div v-if="ops.current.deskripsi_masalah" class="deskripsi-box">
        <strong>Deskripsi:</strong> {{ ops.current.deskripsi_masalah }}
      </div>

      <!-- Peta Lokasi -->
      <div class="map-card">
        <div class="map-header">
          <div class="map-title">
            <span class="map-title-icon">📍</span> Lokasi Real-time
          </div>
          <div class="map-legend">
            <span class="legend-item"><span class="dot green"></span> Teknisi</span>
            <span class="legend-item"><span class="dot blue"></span> Site</span>
            <span v-if="teknisiLokasi" class="map-lastseen">
              Update: {{ fmtDt(teknisiLokasi.updated_at) }}
            </span>
            <span v-else-if="ops.current.teknisi" class="map-nodata">Belum ada data GPS teknisi</span>
            <span v-else class="map-nodata">Belum ada teknisi</span>
          </div>
        </div>
        <div ref="mapContainer" class="map-container" />
        <div v-if="ops.current.site?.koordinat_gps" class="map-footer">
          <a :href="`https://maps.google.com/?q=${ops.current.site.koordinat_gps}`" target="_blank" class="map-link">
            🗺 Buka di Google Maps
          </a>
          <span class="map-coords">{{ ops.current.site.koordinat_gps }}</span>
        </div>
      </div>

      <!-- Dokumentasi Foto -->
      <div class="foto-card" v-if="fotos.length">
        <div class="foto-card-header">
          <span class="foto-card-title">📷 Dokumentasi Foto Teknisi</span>
          <span class="foto-badge">{{ fotos.length }} foto</span>
        </div>
        <div class="foto-stages">
          <template v-for="stage in ['before','proses','after']" :key="stage">
            <div v-if="fotosOf(stage).length">
              <div class="stage-label">{{ stageLabel(stage) }}</div>
              <div class="stage-row">
                <div
                  v-for="f in fotosOf(stage)" :key="f.id_foto"
                  class="foto-thumb-wrap"
                  @click="previewUrl = f.url"
                >
                  <img :src="f.url" class="foto-thumb" loading="lazy" />
                  <div class="foto-time">{{ fmtDt(f.created_at) }}</div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Modal Preview Foto -->
      <div v-if="previewUrl" class="modal-overlay" @click.self="previewUrl = ''" style="z-index:3000">
        <div class="foto-preview-modal">
          <button class="foto-preview-close" @click="previewUrl = ''">✕</button>
          <img :src="previewUrl" class="foto-preview-img" />
        </div>
      </div>

      <div class="two-col">
        <!-- Work Orders -->
        <div class="section-card">
          <div class="section-header">
            <span class="card-title">Surat Tugas ({{ ops.current.work_orders?.length ?? 0 }})</span>
            <button class="btn-add-small" @click="showWoModal = true; woError = ''">+ Surat Tugas</button>
          </div>
          <div v-if="!ops.current.work_orders?.length" class="empty-section">Belum ada surat tugas</div>
          <div v-for="wo in ops.current.work_orders" :key="wo.id_wo" class="wo-item">
            <div class="wo-left">
              <div class="wo-nomor">{{ wo.nomor_wo }}</div>
              <div class="wo-jenis">{{ wo.jenis_wo }}</div>
              <div class="wo-date">{{ fmtDt(wo.tgl_jadwal) }}</div>
            </div>
            <div class="wo-mid">
              <div class="wo-desc">{{ wo.deskripsi_tugas }}</div>
              <div class="wo-exec text-gray">{{ wo.teknisi?.nama_lengkap || wo.vendor?.nama_vendor || '—' }}</div>
            </div>
            <div class="wo-status" :style="{ color: WO_STATUS_COLOR[wo.status_wo] }">{{ wo.status_wo }}</div>
          </div>
        </div>

        <!-- Activity Log -->
        <div class="section-card">
          <div class="section-header">
            <span class="card-title">Log Aktivitas ({{ ops.current.logs?.length ?? 0 }})</span>
            <button class="btn-add-small" @click="showLogModal = true">+ Tambah Log</button>
          </div>
          <div v-if="!ops.current.logs?.length" class="empty-section">Belum ada log</div>
          <div v-for="log in ops.current.logs" :key="log.id_log" class="log-item">
            <div class="log-dot" :style="{ background: log.status_ke ? STATUS_COLOR[log.status_ke]?.color || '#64748b' : '#cbd5e1' }"></div>
            <div class="log-body">
              <div class="log-status" v-if="log.status_ke">
                <span class="log-badge" :style="{ background: STATUS_COLOR[log.status_ke]?.bg, color: STATUS_COLOR[log.status_ke]?.color }">
                  {{ statusLabel(log.status_ke) }}
                </span>
              </div>
              <div class="log-catatan" v-if="log.catatan">{{ log.catatan }}</div>
              <div class="log-meta">{{ log.user?.karyawan?.nama_lengkap || 'System' }} · {{ fmtDt(log.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tiket Lain di Site -->
      <template v-if="ops.current.related_tickets?.length">
        <div class="related-header">
          Tiket lain di <strong>{{ ops.current.site?.nama_site }}</strong>
        </div>
        <div class="related-list">
          <div v-for="t in ops.current.related_tickets" :key="t.id_ticket"
            class="related-item" @click="router.push(`/operations/${t.id_ticket}`)">
            <div class="rel-left">
              <div class="rel-nomor">{{ t.nomor_tiket }}</div>
              <div class="rel-judul">{{ t.judul_tiket }}</div>
            </div>
            <div class="rel-right">
              <span class="prio-dot" :style="{ color: PRIORITAS_COLOR[t.prioritas] }">● {{ t.prioritas }}</span>
              <span class="rel-status"
                :style="{ background: STATUS_COLOR[t.status_tiket]?.bg, color: STATUS_COLOR[t.status_tiket]?.color }">
                {{ statusLabel(t.status_tiket) }}
              </span>
              <span class="rel-arrow">›</span>
            </div>
          </div>
        </div>
      </template>

      <!-- Modal Edit -->
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal">
          <h3>Edit Tiket</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Judul Tiket</label>
              <input v-model="editForm.judul_tiket" />
            </div>
            <div class="field">
              <label>Status</label>
              <select v-model="editForm.status_tiket">
                <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
            </div>
            <div class="field">
              <label>Prioritas</label>
              <select v-model="editForm.prioritas">
                <option v-for="p in PRIORITAS_LIST" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Assign Teknisi</label>
              <select v-model="editForm.id_teknisi_pic">
                <option :value="0">— Belum di-assign —</option>
                <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Deskripsi Masalah</label>
              <textarea v-model="editForm.deskripsi_masalah" rows="3"></textarea>
            </div>
          </div>
          <p v-if="editError" class="form-error">{{ editError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showEditModal = false">Batal</button>
            <button class="btn-submit" @click="handleEdit" :disabled="editSubmitting">
              {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Tambah Log -->
      <div v-if="showLogModal" class="modal-overlay" @click.self="showLogModal = false">
        <div class="modal">
          <h3>Tambah Log</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Update Status (opsional)</label>
              <select v-model="logForm.status_ke">
                <option value="">— Tidak ubah status —</option>
                <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Catatan</label>
              <textarea v-model="logForm.catatan" rows="3" placeholder="Update kondisi, tindakan yang dilakukan..."></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showLogModal = false">Batal</button>
            <button class="btn-submit" @click="handleAddLog" :disabled="logSubmitting">
              {{ logSubmitting ? 'Menyimpan...' : 'Tambah' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Buat Surat Tugas -->
      <div v-if="showWoModal" class="modal-overlay" @click.self="showWoModal = false">
        <div class="modal">
          <h3>Buat Surat Tugas</h3>
          <div class="form-grid">
            <div class="field">
              <label>Jenis Tugas</label>
              <select v-model="woForm.jenis_wo">
                <option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="field">
              <label>Eksekutor</label>
              <select v-model="woForm.tipe_eksekutor">
                <option value="Internal_NEXT1">Internal NEXT1</option>
                <option value="Vendor_Ketiga">Vendor Ketiga</option>
              </select>
            </div>
            <div class="field" v-if="woForm.tipe_eksekutor === 'Internal_NEXT1'">
              <label>Teknisi</label>
              <select v-model="woForm.id_teknisi_internal">
                <option :value="0">— Pilih —</option>
                <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field" v-if="woForm.tipe_eksekutor === 'Vendor_Ketiga'">
              <label>Fee Vendor (Rp)</label>
              <input v-model.number="woForm.fee_vendor" type="number" placeholder="0" />
            </div>
            <div class="field full">
              <label>Jadwal <span class="req">*</span></label>
              <input v-model="woForm.tgl_jadwal" type="datetime-local" />
            </div>
            <div class="field full">
              <label>Deskripsi Tugas <span class="req">*</span></label>
              <textarea v-model="woForm.deskripsi_tugas" rows="3" placeholder="Tugas teknisi..."></textarea>
            </div>
          </div>
          <p v-if="woError" class="form-error">{{ woError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showWoModal = false">Batal</button>
            <button class="btn-submit" @click="handleAddWo" :disabled="woSubmitting">
              {{ woSubmitting ? 'Membuat...' : 'Buat Surat Tugas' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.loading-page { padding: 60px; text-align: center; color: #94a3b8; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 14px; padding: 14px 18px; margin: 20px 0; }
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-right { display: flex; align-items: center; gap: 10px; }
.sla-badge-lg { padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.sla-safe { background: #f0fdf4; color: #15803d; }
.sla-warning { background: #fefce8; color: #a16207; }
.sla-late { background: #dc2626; color: #fff; animation: slaPulse 1.2s infinite; }
.sla-late-done { background: #fef2f2; color: #dc2626; }
.sla-ok { background: #f0fdf4; color: #15803d; }
.sla-none { color: #cbd5e1; }
@keyframes slaPulse { 50% { opacity: 0.6; } }
.prioritas-badge { padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; }
.status-big { padding: 5px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; }
.btn-print { padding: 9px 16px; background: #f0fdf4; color: #15803d; border: 1.5px solid #bbf7d0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-print:hover { background: #dcfce7; }
.btn-edit { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }

.info-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.info-chip { background: #fff; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); flex: 1; min-width: 130px; }
.ic-label { display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
.ic-value { font-size: 14px; color: #0f172a; }
.fw { font-weight: 700; }
.text-gray { color: #64748b; }

.deskripsi-box { background: #f8fafc; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #475569; margin-bottom: 16px; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.section-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.card-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
.btn-add-small { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.empty-section { color: #94a3b8; font-size: 13px; padding: 12px 0; }

.wo-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
.wo-left { min-width: 130px; }
.wo-nomor { font-size: 12px; font-weight: 700; color: #1d4ed8; }
.wo-jenis { font-size: 11px; color: #64748b; }
.wo-date { font-size: 11px; color: #94a3b8; }
.wo-mid { flex: 1; }
.wo-desc { font-size: 13px; color: #0f172a; margin-bottom: 2px; }
.wo-exec { font-size: 11px; }
.wo-status { font-size: 12px; font-weight: 700; min-width: 60px; text-align: right; }

.log-item { display: flex; gap: 10px; margin-bottom: 12px; }
.log-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.log-body { flex: 1; }
.log-status { margin-bottom: 4px; }
.log-badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.log-catatan { font-size: 13px; color: #374151; margin-bottom: 3px; }
.log-meta { font-size: 11px; color: #94a3b8; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

/* Related tickets */
.related-header { font-size: 13px; font-weight: 600; color: #64748b; margin: 20px 0 10px; }
.related-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.related-item { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; cursor: pointer; transition: border-color 0.15s; }
.related-item:hover { border-color: #3b82f6; }
.rel-left { flex: 1; min-width: 0; }
.rel-nomor { font-size: 13px; font-weight: 700; color: #0f172a; }
.rel-judul { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rel-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.prio-dot { font-size: 11px; font-weight: 700; }
.rel-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.rel-arrow { color: #94a3b8; font-size: 16px; }

@media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

/* FOTO GALLERY */
.foto-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); margin-bottom: 16px; overflow: hidden; }
.foto-card-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px 12px; }
.foto-card-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.foto-badge { background: #f0fdf4; color: #15803d; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }
.foto-stages { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 16px; }
.stage-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin-bottom: 8px; }
.stage-row { display: flex; gap: 10px; flex-wrap: wrap; }
.foto-thumb-wrap { cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.foto-thumb { width: 120px; height: 120px; object-fit: cover; border-radius: 10px; border: 2px solid #e2e8f0; transition: transform 0.15s, border-color 0.15s; }
.foto-thumb:hover { transform: scale(1.04); border-color: #3b82f6; }
.foto-time { font-size: 10px; color: #94a3b8; }
.foto-preview-modal { position: relative; max-width: 90vw; max-height: 90vh; }
.foto-preview-img { max-width: 90vw; max-height: 85vh; object-fit: contain; border-radius: 12px; display: block; }
.foto-preview-close { position: absolute; top: -14px; right: -14px; width: 32px; height: 32px; border-radius: 50%; background: #fff; border: none; cursor: pointer; font-size: 16px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 1; }

/* MAP */
.map-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); margin-bottom: 16px; overflow: hidden; }
.map-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px 10px; }
.map-title { font-size: 13px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px; }
.map-title-icon { font-size: 16px; }
.map-legend { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #64748b; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot.green { background: #16a34a; }
.dot.blue  { background: #3b82f6; }
.map-lastseen { font-size: 11px; color: #64748b; }
.map-nodata { font-size: 11px; color: #94a3b8; font-style: italic; }
.map-container { height: 320px; width: 100%; }
.map-footer { display: flex; align-items: center; gap: 14px; padding: 10px 18px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
.map-link { font-size: 12px; color: #3b82f6; text-decoration: none; font-weight: 600; }
.map-link:hover { text-decoration: underline; }
.map-coords { font-size: 11px; color: #94a3b8; font-family: monospace; }
</style>
