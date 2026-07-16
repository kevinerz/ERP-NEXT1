<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDateShort, fmtRupiah } from '@/composables/useFormat'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

const site = ref<any>(null)
const loading = ref(true)
const error = ref('')
const vendorList = ref<any[]>([])
const asetSimList = ref<any[]>([])
const asetList = ref<any[]>([])  // untuk perangkat picker

const activeTab = ref<'sumber' | 'perangkat' | 'pic' | 'proyek' | 'tiket'>('sumber')

// Sumber Internet
const showSumberModal = ref(false)
const editSumber = ref<any>(null)
const sumberForm = ref<any>({})
const sumberSubmitting = ref(false)
const sumberError = ref('')

// Perangkat
const showPerangkatModal = ref(false)
const editPerangkat = ref<any>(null)
const perangkatForm = ref<any>({})
const perangkatSubmitting = ref(false)
const perangkatError = ref('')
const selectedAset = ref<any>(null)  // aset yang dipilih, untuk auto-fill info

// PIC
const showPicModal = ref(false)
const editPic = ref<any>(null)
const picForm = ref<any>({})
const picSubmitting = ref(false)
const picError = ref('')

const PERUNTUKAN = ['Main', 'Backup', 'Redundant']
const STATUS_LINK = ['Aktif', 'Nonaktif', 'Gangguan']
const STATUS_PERANGKAT = ['Aktif', 'Nonaktif', 'Rusak']

const LINK_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif:    { bg: '#f0fdf4', color: '#15803d' },
  Nonaktif: { bg: '#f1f5f9', color: '#64748b' },
  Gangguan: { bg: '#fef2f2', color: '#dc2626' },
}
const SITE_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif:     { bg: '#f0fdf4', color: '#15803d' },
  Prospek:   { bg: '#eff6ff', color: '#1d4ed8' },
  Terminasi: { bg: '#fef2f2', color: '#dc2626' },
}

onMounted(async () => {
  await Promise.all([loadSite(), loadVendors(), loadAsetSim(), loadAset()])
})

async function loadSite() {
  loading.value = true; error.value = ''
  try {
    const r = await api.get(`/master/site/${id}`)
    site.value = r.data.data
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal memuat site' }
  finally { loading.value = false }
}

async function loadVendors() {
  try {
    const r = await api.get('/master/vendor-dropdown')
    vendorList.value = r.data.data
  } catch {}
}

async function loadAsetSim() {
  try {
    const r = await api.get('/assets', { params: { limit: 500 } })
    // filter modem/GSM dari semua aset
    asetSimList.value = (r.data.data || []).filter((a: any) =>
      ['Modem GSM', 'SIM Card', 'Modem', 'Modem FO'].includes(a.kategori)
    )
  } catch {}
}

async function loadAset() {
  try {
    // Semua aset yang tersedia (Di_Gudang) atau sudah Terpasang (bisa pindah)
    const r = await api.get('/assets', { params: { limit: 500 } })
    asetList.value = r.data.data || []
  } catch {}
}

// Aset yang tersedia untuk dipilih: Di_Gudang atau yang sudah terpasang di site ini
const asetTersedia = computed(() => {
  const terpasangDiSiteIni = (site.value?.perangkat || [])
    .map((p: any) => p.id_aset)
    .filter(Boolean)
  return asetList.value.filter((a: any) =>
    a.status_aset === 'Di_Gudang' || terpasangDiSiteIni.includes(a.id_aset)
  )
})

// ─── Sumber Internet ──────────────────────────────────────────

function openAddSumber() {
  editSumber.value = null
  sumberForm.value = { id_site: id, id_vendor_isp: 0, nomor_pelanggan_isp: '', peruntukan_link: 'Main', bandwidth_mbps: '', biaya_mrc_vendor: 0, tgl_mulai: '', status_link: 'Aktif', catatan: '' }
  showSumberModal.value = true; sumberError.value = ''
}

function openEditSumber(s: any) {
  editSumber.value = s
  sumberForm.value = {
    id_vendor_isp: s.id_vendor_isp,
    nomor_pelanggan_isp: s.nomor_pelanggan_isp || '',
    peruntukan_link: s.peruntukan_link,
    bandwidth_mbps: s.bandwidth_mbps || '',
    biaya_mrc_vendor: Number(s.biaya_mrc_vendor),
    id_aset_sim: s.id_aset_sim || 0,
    tgl_mulai: s.tgl_mulai ? s.tgl_mulai.split('T')[0] : '',
    tgl_berakhir: s.tgl_berakhir ? s.tgl_berakhir.split('T')[0] : '',
    status_link: s.status_link,
    catatan: s.catatan || '',
  }
  showSumberModal.value = true; sumberError.value = ''
}

async function saveSumber() {
  if (!sumberForm.value.id_vendor_isp) { sumberError.value = 'Vendor wajib dipilih'; return }
  sumberSubmitting.value = true; sumberError.value = ''
  try {
    const payload = { ...sumberForm.value }
    if (!payload.tgl_mulai) delete payload.tgl_mulai
    if (!payload.tgl_berakhir) delete payload.tgl_berakhir
    if (!payload.id_aset_sim) delete payload.id_aset_sim
    if (editSumber.value) {
      await api.patch(`/master/sumber-internet/${editSumber.value.id_sumber}`, payload)
    } else {
      await api.post('/master/sumber-internet', payload)
    }
    showSumberModal.value = false
    await loadSite()
  } catch (e: any) { sumberError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { sumberSubmitting.value = false }
}

async function deleteSumber(s: any) {
  if (!confirm(`Hapus sumber internet ${s.vendor?.nama_vendor}?`)) return
  try {
    await api.delete(`/master/sumber-internet/${s.id_sumber}`)
    await loadSite()
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal menghapus' }
}

// ─── Perangkat ────────────────────────────────────────────────

function openAddPerangkat() {
  editPerangkat.value = null
  selectedAset.value = null
  perangkatForm.value = { id_site: id, id_aset: 0, ip_address: '', mac_address: '', tgl_pasang: '', status_perangkat: 'Aktif', catatan: '' }
  showPerangkatModal.value = true; perangkatError.value = ''
}

function openEditPerangkat(p: any) {
  editPerangkat.value = p
  selectedAset.value = p.aset || null
  perangkatForm.value = {
    id_aset: p.id_aset || 0,
    ip_address: p.ip_address || '',
    mac_address: p.mac_address || '',
    tgl_pasang: p.tgl_pasang ? p.tgl_pasang.split('T')[0] : '',
    status_perangkat: p.status_perangkat,
    catatan: p.catatan || '',
  }
  showPerangkatModal.value = true; perangkatError.value = ''
}

// Saat user pilih aset, update selectedAset untuk tampilkan info
watch(() => perangkatForm.value.id_aset, (val) => {
  if (!val) { selectedAset.value = null; return }
  selectedAset.value = asetList.value.find((a: any) => a.id_aset === Number(val)) || null
})

async function savePerangkat() {
  if (!perangkatForm.value.id_aset) { perangkatError.value = 'Aset wajib dipilih'; return }
  perangkatSubmitting.value = true; perangkatError.value = ''
  try {
    const aset = selectedAset.value
    const payload: any = {
      ...perangkatForm.value,
      // Salin info dari aset
      jenis_perangkat: aset?.kategori || 'Perangkat',
      merk: aset?.merk || '',
      tipe_model: aset?.tipe_model || '',
      serial_number: aset?.serial_number || '',
    }
    if (!payload.tgl_pasang) delete payload.tgl_pasang
    if (editPerangkat.value) {
      await api.patch(`/master/perangkat/${editPerangkat.value.id_perangkat}`, payload)
    } else {
      await api.post('/master/perangkat', payload)
    }
    showPerangkatModal.value = false
    await loadSite()
  } catch (e: any) { perangkatError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { perangkatSubmitting.value = false }
}

async function deletePerangkat(p: any) {
  if (!confirm(`Hapus perangkat ${p.aset?.nama_perangkat || p.jenis_perangkat}?`)) return
  try {
    await api.delete(`/master/perangkat/${p.id_perangkat}`)
    await loadSite()
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal menghapus' }
}

// ─── PIC ──────────────────────────────────────────────────────

function openAddPic() {
  editPic.value = null
  picForm.value = { id_site: id, nama_pic: '', jabatan: '', no_kontak: '', email: '', is_utama: false }
  showPicModal.value = true; picError.value = ''
}

function openEditPic(p: any) {
  editPic.value = p
  picForm.value = { nama_pic: p.nama_pic, jabatan: p.jabatan || '', no_kontak: p.no_kontak || '', email: p.email || '', is_utama: p.is_utama }
  showPicModal.value = true; picError.value = ''
}

async function savePic() {
  if (!picForm.value.nama_pic) { picError.value = 'Nama PIC wajib diisi'; return }
  picSubmitting.value = true; picError.value = ''
  try {
    if (editPic.value) {
      await api.patch(`/master/pic/${editPic.value.id_pic}`, picForm.value)
    } else {
      await api.post('/master/pic', picForm.value)
    }
    showPicModal.value = false
    await loadSite()
  } catch (e: any) { picError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { picSubmitting.value = false }
}

async function deletePic(p: any) {
  if (!confirm(`Hapus PIC ${p.nama_pic}?`)) return
  try {
    await api.delete(`/master/pic/${p.id_pic}`)
    await loadSite()
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal menghapus' }
}

// ─── Helpers ──────────────────────────────────────────────────

const fmtDate = fmtDateShort

const selectedVendor = computed(() => vendorList.value.find((v: any) => v.id_vendor === sumberForm.value.id_vendor_isp))
const isGsm = computed(() => {
  const tipe = selectedVendor.value?.tipe_vendor?.toLowerCase() || ''
  return tipe.includes('gsm') || tipe.includes('seluler') || tipe.includes('cellular')
})
</script>

<template>
  <div class="page">
    <div class="breadcrumb">
      <span class="link" @click="router.push('/master/site')">Site Pelanggan</span>
      <span class="sep">›</span>
      <span>{{ site?.kode_site || '...' }}</span>
    </div>

    <div v-if="loading && !site" class="loading-full">Memuat...</div>
    <div v-else-if="error" class="alert-error">{{ error }}</div>

    <template v-else-if="site">
      <!-- Header -->
      <div class="page-header">
        <div>
          <div class="kode">{{ site.kode_site }}</div>
          <h2>{{ site.nama_site }}</h2>
          <div class="sub-row">
            <span class="pelanggan">{{ site.pelanggan?.nama_pelanggan }}</span>
            <span class="status-badge"
              :style="{ background: SITE_STATUS_COLOR[site.status_site]?.bg || '#f1f5f9', color: SITE_STATUS_COLOR[site.status_site]?.color || '#64748b' }">
              {{ site.status_site }}
            </span>
          </div>
        </div>
      </div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-item">
          <div class="info-label">Layanan</div>
          <div class="info-value">{{ site.layanan?.nama_layanan }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Alamat</div>
          <div class="info-value">{{ site.alamat_lengkap }}</div>
        </div>
        <div class="info-item" v-if="site.kota">
          <div class="info-label">Kota</div>
          <div class="info-value">{{ site.kota }}</div>
        </div>
        <div class="info-item" v-if="site.tgl_aktif">
          <div class="info-label">Tgl Aktif</div>
          <div class="info-value">{{ fmtDate(site.tgl_aktif) }}</div>
        </div>
        <div class="info-item" v-if="site.koordinat_gps">
          <div class="info-label">GPS</div>
          <div class="info-value mono">{{ site.koordinat_gps }}</div>
        </div>
        <div class="info-item" v-if="site.kontrak?.length">
          <div class="info-label">Kontrak Aktif</div>
          <div class="info-value green">{{ site.kontrak.length }} kontrak</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button :class="['tab', { active: activeTab === 'sumber' }]" @click="activeTab = 'sumber'">
          🌐 Sumber Internet ({{ site.sumber_internet?.length || 0 }})
        </button>
        <button :class="['tab', { active: activeTab === 'perangkat' }]" @click="activeTab = 'perangkat'">
          🔌 Perangkat ({{ site.perangkat?.length || 0 }})
        </button>
        <button :class="['tab', { active: activeTab === 'pic' }]" @click="activeTab = 'pic'">
          👤 PIC Kontak ({{ site.pic?.length || 0 }})
        </button>
        <button :class="['tab', { active: activeTab === 'proyek' }]" @click="activeTab = 'proyek'">
          📦 Project ({{ site.projects?.length || 0 }})
        </button>
        <button :class="['tab', { active: activeTab === 'tiket' }]" @click="activeTab = 'tiket'">
          🎫 Tiket ({{ site.tickets?.length || 0 }})
        </button>
      </div>

      <!-- Tab: Sumber Internet -->
      <div v-if="activeTab === 'sumber'" class="tab-content">
        <div class="tab-header">
          <h3>Sumber Internet</h3>
          <button class="btn-add" @click="openAddSumber">+ Tambah Link</button>
        </div>
        <div v-if="!site.sumber_internet?.length" class="empty-state">Belum ada sumber internet terdaftar</div>
        <div v-else class="sumber-list">
          <div v-for="s in site.sumber_internet" :key="s.id_sumber" class="sumber-card">
            <div class="sumber-top">
              <div class="sumber-main">
                <div class="sumber-vendor">{{ s.vendor?.nama_vendor }}</div>
                <div class="sumber-tipe">{{ s.vendor?.tipe_vendor }}</div>
              </div>
              <div class="sumber-badges">
                <span class="peruntukan-badge" :class="s.peruntukan_link.toLowerCase()">{{ s.peruntukan_link }}</span>
                <span class="link-badge"
                  :style="{ background: LINK_COLOR[s.status_link]?.bg, color: LINK_COLOR[s.status_link]?.color }">
                  {{ s.status_link }}
                </span>
              </div>
              <div class="sumber-actions">
                <button class="btn-icon" @click="openEditSumber(s)">✏️</button>
                <button class="btn-icon red" @click="deleteSumber(s)">🗑️</button>
              </div>
            </div>
            <div class="sumber-details">
              <div class="sumber-detail-item" v-if="s.nomor_pelanggan_isp">
                <span class="dl">{{ s.vendor?.tipe_vendor?.toLowerCase().includes('gsm') ? 'Nomor SIM' : 'Circuit ID / Nomor Pelanggan ISP' }}</span>
                <span class="dv mono">{{ s.nomor_pelanggan_isp }}</span>
              </div>
              <div class="sumber-detail-item" v-if="s.bandwidth_mbps">
                <span class="dl">Bandwidth</span>
                <span class="dv">{{ s.bandwidth_mbps }} Mbps</span>
              </div>
              <div class="sumber-detail-item" v-if="s.biaya_mrc_vendor">
                <span class="dl">Biaya MRC Vendor</span>
                <span class="dv">{{ fmtRupiah(Number(s.biaya_mrc_vendor)) }}</span>
              </div>
              <div class="sumber-detail-item" v-if="s.tgl_mulai">
                <span class="dl">Mulai</span>
                <span class="dv">{{ fmtDate(s.tgl_mulai) }}</span>
              </div>
              <div class="sumber-detail-item" v-if="s.aset_sim">
                <span class="dl">Modem / SIM</span>
                <span class="dv">{{ s.aset_sim.nama_perangkat }} · <span class="mono">{{ s.aset_sim.serial_number || s.aset_sim.kode_aset }}</span></span>
              </div>
              <div class="sumber-detail-item" v-if="s.catatan">
                <span class="dl">Catatan</span>
                <span class="dv">{{ s.catatan }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: Perangkat -->
      <div v-if="activeTab === 'perangkat'" class="tab-content">
        <div class="tab-header">
          <h3>Perangkat Terpasang</h3>
          <button class="btn-add" @click="openAddPerangkat">+ Tambah Perangkat</button>
        </div>
        <div v-if="!site.perangkat?.length" class="empty-state">Belum ada perangkat terdaftar</div>
        <table v-else class="perangkat-table">
          <thead>
            <tr>
              <th>Aset</th>
              <th>Kode Aset</th>
              <th>Serial / IP</th>
              <th>Tgl Pasang</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in site.perangkat" :key="p.id_perangkat">
              <td>
                <div class="fw600">{{ p.aset?.nama_perangkat || p.jenis_perangkat }}</div>
                <div class="text-gray text-sm">{{ p.merk }} {{ p.tipe_model }}</div>
              </td>
              <td>
                <span class="kode-aset" v-if="p.aset">{{ p.aset.kode_aset }}</span>
                <span class="text-gray text-sm" v-else>—</span>
              </td>
              <td>
                <div class="mono text-sm" v-if="p.serial_number">SN: {{ p.serial_number }}</div>
                <div class="mono text-sm" v-if="p.ip_address">IP: {{ p.ip_address }}</div>
                <div class="mono text-sm" v-if="p.mac_address">MAC: {{ p.mac_address }}</div>
              </td>
              <td class="text-sm text-gray">{{ p.tgl_pasang ? fmtDate(p.tgl_pasang) : '—' }}</td>
              <td>
                <span :class="['perangkat-status', p.status_perangkat.toLowerCase()]">{{ p.status_perangkat }}</span>
              </td>
              <td>
                <div class="action-row">
                  <button class="btn-icon" @click="openEditPerangkat(p)">✏️</button>
                  <button class="btn-icon red" @click="deletePerangkat(p)">🗑️</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tab: PIC -->
      <div v-if="activeTab === 'pic'" class="tab-content">
        <div class="tab-header">
          <h3>PIC Kontak</h3>
          <button class="btn-add" @click="openAddPic">+ Tambah PIC</button>
        </div>
        <div v-if="!site.pic?.length" class="empty-state">Belum ada PIC terdaftar</div>
        <div v-else class="pic-list">
          <div v-for="p in site.pic" :key="p.id_pic" class="pic-card">
            <div class="pic-top">
              <div>
                <div class="pic-nama">
                  {{ p.nama_pic }}
                  <span v-if="p.is_utama" class="utama-badge">Utama</span>
                </div>
                <div class="pic-jabatan text-gray">{{ p.jabatan }}</div>
              </div>
              <div class="action-row">
                <button class="btn-icon" @click="openEditPic(p)">✏️</button>
                <button class="btn-icon red" @click="deletePic(p)">🗑️</button>
              </div>
            </div>
            <div class="pic-kontak">
              <span v-if="p.no_kontak">📱 {{ p.no_kontak }}</span>
              <span v-if="p.email">✉️ {{ p.email }}</span>
            </div>
          </div>
        </div>
      </div>
      <!-- Tab: Project -->
      <div v-if="activeTab === 'proyek'" class="tab-content">
        <div class="tab-header">
          <h3>Project</h3>
          <button class="btn-add" @click="router.push('/projects?new=1')">+ Buat Project</button>
        </div>
        <div v-if="!site.projects?.length" class="empty-state">Belum ada project untuk site ini</div>
        <div v-else class="list-rows">
          <div v-for="p in site.projects" :key="p.id_project"
            class="list-row clickable" @click="router.push(`/projects/${p.id_project}`)">
            <div class="lr-left">
              <div class="lr-nomor">{{ p.nomor_project }}</div>
              <div class="lr-sub">PM: {{ p.pm?.nama_lengkap || '—' }}</div>
            </div>
            <div class="lr-mid">
              <span class="lr-date" v-if="p.tgl_mulai">
                {{ fmtDate(p.tgl_mulai) }}
                <template v-if="p.tgl_target_selesai"> — {{ fmtDate(p.tgl_target_selesai) }}</template>
              </span>
            </div>
            <div class="lr-right">
              <span class="status-chip" :class="`pstatus-${p.status_project.toLowerCase()}`">
                {{ p.status_project }}
              </span>
              <span class="lr-arrow">›</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: Tiket -->
      <div v-if="activeTab === 'tiket'" class="tab-content">
        <div class="tab-header">
          <h3>Tiket Operasional</h3>
          <button class="btn-add" @click="router.push('/operations')">Lihat Semua</button>
        </div>
        <div v-if="!site.tickets?.length" class="empty-state">Belum ada tiket untuk site ini</div>
        <div v-else class="list-rows">
          <div v-for="t in site.tickets" :key="t.id_ticket"
            class="list-row clickable" @click="router.push(`/operations/${t.id_ticket}`)">
            <div class="lr-left">
              <div class="lr-nomor">{{ t.nomor_tiket }}</div>
              <div class="lr-sub">{{ t.judul_tiket }}</div>
            </div>
            <div class="lr-mid">
              <span class="prioritas-chip" :class="`prio-${t.prioritas?.toLowerCase()}`">{{ t.prioritas }}</span>
            </div>
            <div class="lr-right">
              <span class="status-chip" :class="`tstatus-${t.status_tiket?.toLowerCase().replace('_', '-')}`">
                {{ t.status_tiket }}
              </span>
              <span class="lr-arrow">›</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal Sumber Internet -->
    <div v-if="showSumberModal" class="modal-overlay" @click.self="showSumberModal = false">
      <div class="modal">
        <h3>{{ editSumber ? 'Edit Sumber Internet' : 'Tambah Sumber Internet' }}</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Vendor / Operator <span class="req">*</span></label>
            <select v-model.number="sumberForm.id_vendor_isp">
              <option :value="0">— Pilih Vendor —</option>
              <option v-for="v in vendorList" :key="v.id_vendor" :value="v.id_vendor">
                [{{ v.tipe_vendor }}] {{ v.nama_vendor }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>{{ isGsm ? 'Nomor SIM / GSM' : 'Circuit ID / Nomor Pelanggan ISP' }}</label>
            <input v-model="sumberForm.nomor_pelanggan_isp"
              :placeholder="isGsm ? '08xxxxxxxxxx' : 'Circuit ID / nomor layanan ISP'" />
          </div>
          <div class="field">
            <label>Peruntukan Link</label>
            <select v-model="sumberForm.peruntukan_link">
              <option v-for="p in PERUNTUKAN" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div class="field">
            <label>Status Link</label>
            <select v-model="sumberForm.status_link">
              <option v-for="s in STATUS_LINK" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field">
            <label>Bandwidth (Mbps)</label>
            <input v-model="sumberForm.bandwidth_mbps" placeholder="cth: 20, 100, 20/20" />
          </div>
          <div class="field">
            <label>Biaya MRC Vendor (Rp)</label>
            <input v-model.number="sumberForm.biaya_mrc_vendor" type="number" min="0" />
          </div>
          <div class="field">
            <label>Tanggal Mulai</label>
            <input v-model="sumberForm.tgl_mulai" type="date" />
          </div>
          <div class="field">
            <label>Tanggal Berakhir</label>
            <input v-model="sumberForm.tgl_berakhir" type="date" />
          </div>
          <div class="field full" v-if="isGsm">
            <label>Modem / Aset SIM (opsional)</label>
            <select v-model.number="sumberForm.id_aset_sim">
              <option :value="0">— Tidak terhubung ke aset —</option>
              <option v-for="a in asetSimList" :key="a.id_aset" :value="a.id_aset">
                [{{ a.kode_aset }}] {{ a.nama_perangkat }} {{ a.serial_number ? '· ' + a.serial_number : '' }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="sumberForm.catatan" rows="2" placeholder="Info tambahan..."></textarea>
          </div>
        </div>
        <p v-if="sumberError" class="form-error">{{ sumberError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showSumberModal = false">Batal</button>
          <button class="btn-submit" @click="saveSumber" :disabled="sumberSubmitting">
            {{ sumberSubmitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Perangkat — picker dari Aset -->
    <div v-if="showPerangkatModal" class="modal-overlay" @click.self="showPerangkatModal = false">
      <div class="modal">
        <h3>{{ editPerangkat ? 'Edit Perangkat' : 'Tambah Perangkat dari Aset' }}</h3>

        <!-- Pilih Aset -->
        <div class="field" style="margin-bottom: 16px;">
          <label>Pilih Aset <span class="req">*</span></label>
          <select v-model.number="perangkatForm.id_aset">
            <option :value="0">— Pilih dari inventaris aset —</option>
            <option v-for="a in asetTersedia" :key="a.id_aset" :value="a.id_aset">
              [{{ a.kode_aset }}] {{ a.nama_perangkat }}
              {{ a.merk ? '· ' + a.merk : '' }}
              {{ a.tipe_model ? a.tipe_model : '' }}
              {{ a.serial_number ? '· SN:' + a.serial_number : '' }}
            </option>
          </select>
          <div v-if="asetTersedia.length === 0" class="hint-text">
            Tidak ada aset tersedia di gudang. Tambah aset di modul Aset terlebih dahulu.
          </div>
        </div>

        <!-- Info aset yang dipilih -->
        <div v-if="selectedAset" class="aset-preview">
          <div class="aset-preview-row">
            <span class="apl">Kode</span><span class="apv mono">{{ selectedAset.kode_aset }}</span>
          </div>
          <div class="aset-preview-row">
            <span class="apl">Perangkat</span><span class="apv">{{ selectedAset.nama_perangkat }}</span>
          </div>
          <div class="aset-preview-row" v-if="selectedAset.merk || selectedAset.tipe_model">
            <span class="apl">Merk / Model</span><span class="apv">{{ selectedAset.merk }} {{ selectedAset.tipe_model }}</span>
          </div>
          <div class="aset-preview-row" v-if="selectedAset.serial_number">
            <span class="apl">Serial Number</span><span class="apv mono">{{ selectedAset.serial_number }}</span>
          </div>
          <div class="aset-preview-row">
            <span class="apl">Kategori</span><span class="apv">{{ selectedAset.kategori }}</span>
          </div>
          <div class="aset-preview-row">
            <span class="apl">Status Aset</span>
            <span class="apv" :class="selectedAset.status_aset === 'Di_Gudang' ? 'green' : 'orange'">
              {{ selectedAset.status_aset }}
            </span>
          </div>
        </div>

        <!-- Info tambahan site-specific -->
        <div class="form-grid" style="margin-top: 16px;">
          <div class="field">
            <label>IP Address</label>
            <input v-model="perangkatForm.ip_address" placeholder="192.168.x.x" />
          </div>
          <div class="field">
            <label>MAC Address</label>
            <input v-model="perangkatForm.mac_address" placeholder="AA:BB:CC:DD:EE:FF" />
          </div>
          <div class="field">
            <label>Tanggal Pasang</label>
            <input v-model="perangkatForm.tgl_pasang" type="date" />
          </div>
          <div class="field">
            <label>Status di Site</label>
            <select v-model="perangkatForm.status_perangkat">
              <option v-for="s in STATUS_PERANGKAT" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="perangkatForm.catatan" rows="2" placeholder="Info tambahan (posisi, konfigurasi, dll)"></textarea>
          </div>
        </div>

        <p v-if="perangkatError" class="form-error">{{ perangkatError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showPerangkatModal = false">Batal</button>
          <button class="btn-submit" @click="savePerangkat" :disabled="perangkatSubmitting">
            {{ perangkatSubmitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal PIC -->
    <div v-if="showPicModal" class="modal-overlay" @click.self="showPicModal = false">
      <div class="modal-pic">
        <h3>{{ editPic ? 'Edit PIC' : 'Tambah PIC' }}</h3>
        <div class="pic-form">
          <div class="field">
            <label>Nama PIC <span class="req">*</span></label>
            <input v-model="picForm.nama_pic" placeholder="Nama kontak di site" />
          </div>
          <div class="field">
            <label>Jabatan</label>
            <input v-model="picForm.jabatan" placeholder="IT Staff, Network Admin..." />
          </div>
          <div class="field">
            <label>No. HP / WA</label>
            <input v-model="picForm.no_kontak" placeholder="08xxxxxxxxxx" type="tel" />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="picForm.email" type="email" placeholder="nama@perusahaan.com" />
          </div>
          <label class="checkbox-label">
            <input type="checkbox" v-model="picForm.is_utama" />
            <span>Jadikan PIC Utama</span>
          </label>
        </div>
        <p v-if="picError" class="form-error">{{ picError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showPicModal = false">Batal</button>
          <button class="btn-submit" @click="savePic" :disabled="picSubmitting">
            {{ picSubmitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.breadcrumb { font-size: 13px; color: #64748b; margin-bottom: 16px; }
.link { cursor: pointer; color: #3b82f6; }
.link:hover { text-decoration: underline; }
.sep { margin: 0 6px; }
.loading-full { padding: 60px; text-align: center; color: #94a3b8; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; }

.page-header { margin-bottom: 16px; }
.kode { font-size: 13px; font-weight: 700; color: #3b82f6; margin-bottom: 4px; }
.page-header h2 { margin: 0 0 8px; font-size: 22px; color: #0f172a; }
.sub-row { display: flex; align-items: center; gap: 8px; }
.pelanggan { font-size: 14px; color: #64748b; font-weight: 600; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }

.info-bar { display: flex; flex-wrap: wrap; gap: 0; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 16px 24px; margin-bottom: 20px; }
.info-item { flex: 0 0 auto; min-width: 130px; padding: 6px 20px 6px 0; border-right: 1px solid #f1f5f9; margin-right: 20px; margin-bottom: 4px; }
.info-item:last-child { border-right: none; }
.info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 3px; }
.info-value { font-size: 13px; color: #0f172a; font-weight: 600; }
.info-value.green { color: #15803d; }
.mono { font-family: monospace; font-size: 12px; }

/* Tabs */
.tabs { display: flex; gap: 4px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; }
.tab { padding: 10px 18px; border: none; background: none; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
.tab:hover { color: #1d4ed8; }
.tab.active { color: #1d4ed8; border-bottom-color: #1d4ed8; }

.tab-content { }
.tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tab-header h3 { margin: 0; font-size: 16px; color: #0f172a; }
.btn-add { padding: 8px 16px; background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.empty-state { text-align: center; color: #94a3b8; padding: 40px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }

/* Sumber Internet */
.sumber-list { display: flex; flex-direction: column; gap: 12px; }
.sumber-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 16px 20px; }
.sumber-top { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.sumber-main { flex: 1; }
.sumber-vendor { font-weight: 700; font-size: 15px; color: #0f172a; }
.sumber-tipe { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.sumber-badges { display: flex; gap: 6px; align-items: center; }
.peruntukan-badge { padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: 700; }
.peruntukan-badge.main { background: #eff6ff; color: #1d4ed8; }
.peruntukan-badge.backup { background: #fef9c3; color: #a16207; }
.peruntukan-badge.redundant { background: #f0fdf4; color: #15803d; }
.link-badge { padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
.sumber-actions { display: flex; gap: 4px; }
.sumber-details { display: flex; flex-wrap: wrap; gap: 12px 24px; }
.sumber-detail-item { display: flex; gap: 8px; align-items: baseline; }
.dl { font-size: 12px; color: #94a3b8; font-weight: 600; white-space: nowrap; }
.dv { font-size: 13px; color: #0f172a; font-weight: 600; }

/* Perangkat */
.perangkat-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.perangkat-table th { padding: 11px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; background: #f8fafc; }
.perangkat-table td { padding: 12px 14px; font-size: 14px; border-top: 1px solid #f1f5f9; }
.fw600 { font-weight: 600; }
.kode-aset { font-family: monospace; font-size: 12px; background: #f1f5f9; padding: 2px 7px; border-radius: 4px; color: #1d4ed8; font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.perangkat-status { padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
.perangkat-status.aktif { background: #f0fdf4; color: #15803d; }
.perangkat-status.nonaktif { background: #f1f5f9; color: #64748b; }
.perangkat-status.rusak { background: #fef2f2; color: #dc2626; }
.action-row { display: flex; gap: 4px; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 15px; padding: 4px; border-radius: 4px; }
.btn-icon:hover { background: #f1f5f9; }
.btn-icon.red:hover { background: #fef2f2; }

/* Aset preview card */
.aset-preview { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.aset-preview-row { display: flex; gap: 12px; align-items: baseline; }
.apl { font-size: 11px; color: #94a3b8; font-weight: 700; width: 100px; flex-shrink: 0; }
.apv { font-size: 13px; color: #0f172a; font-weight: 600; }
.apv.green { color: #15803d; }
.apv.orange { color: #d97706; }

.hint-text { font-size: 12px; color: #f59e0b; margin-top: 4px; }

/* PIC */
.pic-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.pic-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 16px 20px; }
.pic-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.pic-nama { font-weight: 700; font-size: 15px; color: #0f172a; display: flex; align-items: center; gap: 8px; }
.utama-badge { font-size: 10px; background: #eff6ff; color: #1d4ed8; padding: 2px 7px; border-radius: 8px; font-weight: 700; }
.pic-jabatan { font-size: 12px; }
.pic-kontak { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #374151; }

/* Project & Tiket list rows */
.list-rows { display: flex; flex-direction: column; gap: 8px; }
.list-row { display: flex; align-items: center; gap: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; }
.list-row.clickable { cursor: pointer; transition: border-color 0.15s; }
.list-row.clickable:hover { border-color: #3b82f6; }
.lr-left { flex: 1; min-width: 0; }
.lr-nomor { font-size: 14px; font-weight: 700; color: #0f172a; }
.lr-sub { font-size: 12px; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lr-mid { min-width: 120px; }
.lr-date { font-size: 12px; color: #94a3b8; }
.lr-right { display: flex; align-items: center; gap: 8px; }
.lr-arrow { color: #94a3b8; font-size: 18px; }
.status-chip { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 12px; white-space: nowrap; }
.pstatus-perencanaan { background: #eff6ff; color: #1d4ed8; }
.pstatus-instalasi    { background: #fef9c3; color: #a16207; }
.pstatus-testing      { background: #fff7ed; color: #c2410c; }
.pstatus-selesai      { background: #f0fdf4; color: #15803d; }
.pstatus-ditahan      { background: #fef2f2; color: #dc2626; }
.tstatus-open              { background: #f1f5f9; color: #64748b; }
.tstatus-in_progress       { background: #eff6ff; color: #1d4ed8; }
.tstatus-pending-customer  { background: #fef9c3; color: #a16207; }
.tstatus-resolved          { background: #f0fdf4; color: #15803d; }
.tstatus-closed            { background: #e2e8f0; color: #475569; }
.prioritas-chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }
.prio-high     { background: #fef2f2; color: #dc2626; }
.prio-medium   { background: #fff7ed; color: #c2410c; }
.prio-low      { background: #f0fdf4; color: #15803d; }
.prio-critical { background: #fdf2f8; color: #9d174d; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 560px; max-width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
/* Modal PIC khusus — single column, lebih compact */
.modal-pic { background: #fff; border-radius: 14px; padding: 24px 28px; width: 380px; max-width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-pic h3 { margin: 0 0 18px; font-size: 17px; color: #0f172a; font-weight: 700; }
.pic-form { display: flex; flex-direction: column; gap: 12px; }
.checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; margin-top: 4px; }
.checkbox-label input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #1d4ed8; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.row-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
