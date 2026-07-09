<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAsetStore } from '@/stores/aset'
import { useProyekStore } from '@/stores/proyek'
import { printLabelAset } from '@/composables/usePrint'
import api from '@/services/api'

const router = useRouter()
const aset = useAsetStore()
const proyek = useProyekStore()

const page = ref(1)
const filterStatus = ref('')
const filterKategori = ref('')
const filterKondisi = ref('')
const filterGudang = ref(0)
const search = ref('')

interface GudangOpt { id_gudang: number; kode_gudang: string; nama_gudang: string; kota?: string | null; is_aktif: boolean }
const gudangList = ref<GudangOpt[]>([])

const showModal = ref(false)
const submitting = ref(false)
const formError = ref('')
const form = ref({
  nama_perangkat: '',
  merk: '',
  tipe_model: '',
  serial_number: '',
  is_serialized: true,
  stok_jumlah: 1,
  kategori: '',
  kondisi: 'Baru',
  id_site: 0,
  id_gudang: 0,
  tgl_perolehan: '',
  harga_perolehan: 0,
  catatan: '',
})

// Simpan OBJEK aset yang dipilih (bukan cuma id) — supaya pilihan dari
// halaman lain tidak hilang saat pindah halaman (aset.list diganti tiap fetch).
const selectedItems = ref<Map<number, any>>(new Map())
const selectingAll = ref(false)

function toggleSelect(a: any) {
  if (selectedItems.value.has(a.id_aset)) selectedItems.value.delete(a.id_aset)
  else selectedItems.value.set(a.id_aset, a)
}
function toggleSelectAll() {
  const semuaDiHalamanTerpilih = aset.list.length > 0 && aset.list.every((a: any) => selectedItems.value.has(a.id_aset))
  if (semuaDiHalamanTerpilih) aset.list.forEach((a: any) => selectedItems.value.delete(a.id_aset))
  else aset.list.forEach((a: any) => selectedItems.value.set(a.id_aset, a))
}
async function pilihSemuaSesuaiFilter() {
  selectingAll.value = true
  try {
    const params: any = { page: 1, limit: 200 }
    if (filterStatus.value) params.status_aset = filterStatus.value
    if (filterKategori.value) params.kategori = filterKategori.value
    if (filterKondisi.value) params.kondisi = filterKondisi.value
    if (filterGudang.value) params.id_gudang = filterGudang.value
    if (search.value) params.search = search.value
    const r = await api.get('/assets', { params })
    r.data.data.forEach((a: any) => selectedItems.value.set(a.id_aset, a))
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal memilih semua aset')
  } finally { selectingAll.value = false }
}
function cetakLabelTerpilih() {
  const items = Array.from(selectedItems.value.values())
  if (!items.length) { alert('Pilih dulu aset yang mau dicetak labelnya.'); return }
  printLabelAset(items)
}

const STATUS_LIST = ['Di_Gudang', 'Terpasang', 'Dipinjam', 'Rusak', 'Disposed']
const KONDISI_LIST = ['Baru', 'Baik', 'Perlu_Perbaikan', 'Rusak']

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Di_Gudang:  { bg: '#f0fdf4', color: '#15803d' },
  Terpasang:  { bg: '#eff6ff', color: '#1d4ed8' },
  Dipinjam:   { bg: '#fef9c3', color: '#a16207' },
  Rusak:      { bg: '#fef2f2', color: '#dc2626' },
  Disposed:   { bg: '#f1f5f9', color: '#64748b' },
}

onMounted(async () => {
  await Promise.all([aset.fetchSummary(), aset.fetchKategori(), proyek.fetchSiteList(), fetchGudang()])
  fetchData()
})

async function fetchGudang() {
  try {
    const r = await api.get('/master/gudang')
    gudangList.value = r.data.data
  } catch {}
}

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value) params.status_aset = filterStatus.value
  if (filterKategori.value) params.kategori = filterKategori.value
  if (filterKondisi.value) params.kondisi = filterKondisi.value
  if (filterGudang.value) params.id_gudang = filterGudang.value
  if (search.value) params.search = search.value
  aset.fetchList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function resetForm() {
  form.value = {
    nama_perangkat: '', merk: '', tipe_model: '', serial_number: '',
    is_serialized: true, stok_jumlah: 1, kategori: '', kondisi: 'Baru',
    id_site: 0, id_gudang: gudangList.value.find(g => g.is_aktif)?.id_gudang ?? 0,
    tgl_perolehan: '', harga_perolehan: 0, catatan: '',
  }
}

async function handleSubmit() {
  if (!form.value.nama_perangkat || !form.value.kategori) {
    formError.value = 'Nama perangkat dan kategori wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value }
    if (!payload.id_site) delete payload.id_site
    if (!payload.id_gudang) delete payload.id_gudang
    if (!payload.serial_number) delete payload.serial_number
    if (!payload.tgl_perolehan) delete payload.tgl_perolehan
    const result = await aset.create(payload)
    showModal.value = false
    await aset.fetchSummary()
    router.push(`/assets/${result.id_aset}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menambah aset' }
  finally { submitting.value = false }
}

async function hapusAset(id: number, nama: string) {
  if (!confirm(`Hapus aset "${nama}" ini?`)) return
  try {
    await api.delete(`/assets/${id}`)
    await aset.fetchSummary()
    fetchData()
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus aset')
  }
}

function fmtRupiah(n: number) {
  return n ? 'Rp ' + n.toLocaleString('id-ID') : '—'
}
function statusLabel(s: string) { return s.replace('_', ' ') }
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Aset</h2>
        <p class="sub">Manajemen inventaris & perangkat</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="router.push('/assets/pengajuan')">🧾 Pengajuan Aset</button>
        <button class="btn-secondary" @click="router.push('/assets/stok-opname')">📋 Stok Opname</button>
        <button class="btn-primary" @click="showModal = true; resetForm(); formError = ''">+ Tambah Aset</button>
      </div>
    </div>

    <!-- Summary chips -->
    <div class="summary-row">
      <div v-for="s in aset.summary" :key="s.status" class="summary-chip"
        :style="{ borderLeftColor: STATUS_COLOR[s.status]?.color || '#94a3b8' }"
        @click="filterStatus = filterStatus === s.status ? '' : s.status; doFilter()">
        <div class="sc-count">{{ s.count }}</div>
        <div class="sc-label">{{ statusLabel(s.status) }}</div>
      </div>
    </div>

    <!-- Gudang chips -->
    <div class="gudang-row" v-if="aset.summaryGudang.length">
      <div v-for="g in aset.summaryGudang" :key="g.id_gudang" class="gudang-chip"
        :class="{ active: filterGudang === g.id_gudang }"
        @click="filterGudang = filterGudang === g.id_gudang ? 0 : g.id_gudang; doFilter()">
        🏬 {{ g.nama_gudang }}: <strong>{{ g.count }}</strong>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input v-model="search" @keyup.enter="doFilter" placeholder="Cari kode / nama / serial / merk..." class="search-input" />
      <select v-model="filterStatus" @change="doFilter" class="filter-select">
        <option value="">Semua Status</option>
        <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
      </select>
      <select v-model="filterKategori" @change="doFilter" class="filter-select">
        <option value="">Semua Kategori</option>
        <option v-for="k in aset.kategoriList" :key="k" :value="k">{{ k }}</option>
      </select>
      <select v-model="filterKondisi" @change="doFilter" class="filter-select">
        <option value="">Semua Kondisi</option>
        <option v-for="k in KONDISI_LIST" :key="k" :value="k">{{ k.replace('_', ' ') }}</option>
      </select>
      <select v-model.number="filterGudang" @change="doFilter" class="filter-select">
        <option :value="0">Semua Gudang</option>
        <option v-for="g in gudangList" :key="g.id_gudang" :value="g.id_gudang">
          [{{ g.kode_gudang }}] {{ g.nama_gudang }}
        </option>
      </select>
      <button class="btn-search" @click="doFilter">Cari</button>
    </div>

    <div v-if="aset.error" class="alert-error">{{ aset.error }}</div>

    <div v-if="selectedItems.size > 0" class="selection-bar">
      <span>{{ selectedItems.size }} aset dipilih</span>
      <button class="btn-select-all" v-if="aset.meta.total > aset.list.length" @click="pilihSemuaSesuaiFilter" :disabled="selectingAll">
        {{ selectingAll ? 'Memilih...' : `Pilih Semua Sesuai Filter (${aset.meta.total})` }}
      </button>
      <button class="btn-label" @click="cetakLabelTerpilih">🏷️ Cetak Label Terpilih</button>
      <button class="btn-clear-sel" @click="selectedItems.clear()">Batal Pilih</button>
    </div>

    <div class="table-card">
      <div v-if="aset.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th class="center" style="width:36px">
              <input type="checkbox" :checked="aset.list.length > 0 && aset.list.every((a: any) => selectedItems.has(a.id_aset))" @change="toggleSelectAll" />
            </th>
            <th>Kode Aset</th>
            <th>Perangkat</th>
            <th>Kategori</th>
            <th>Kondisi</th>
            <th>Status</th>
            <th>Lokasi / Site</th>
            <th>Stok</th>
            <th>Mutasi</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!aset.list.length">
            <td colspan="10" class="empty">Belum ada data aset</td>
          </tr>
          <tr v-for="a in aset.list" :key="a.id_aset" class="row-link" @click="router.push(`/assets/${a.id_aset}`)">
            <td class="center" @click.stop>
              <input type="checkbox" :checked="selectedItems.has(a.id_aset)" @change="toggleSelect(a)" />
            </td>
            <td class="kode">{{ a.kode_aset }}</td>
            <td>
              <div class="fw600">{{ a.nama_perangkat }}</div>
              <div class="text-gray text-sm">{{ a.merk }} {{ a.tipe_model }}</div>
              <div class="serial" v-if="a.serial_number">SN: {{ a.serial_number }}</div>
            </td>
            <td>{{ a.kategori }}</td>
            <td>{{ a.kondisi?.replace('_', ' ') }}</td>
            <td>
              <span class="status-badge"
                :style="{ background: STATUS_COLOR[a.status_aset]?.bg, color: STATUS_COLOR[a.status_aset]?.color }">
                {{ statusLabel(a.status_aset) }}
              </span>
            </td>
            <td>
              <div v-if="a.site" class="fw600 text-sm">{{ a.site.nama_site }}</div>
              <div v-if="a.site" class="text-gray text-sm">{{ a.site.pelanggan?.nama_pelanggan }}</div>
              <div v-else class="text-gray text-sm">
                {{ a.status_aset === 'Di_Gudang' ? (a.gudang?.nama_gudang ?? 'Gudang') : 'Gudang' }}
              </div>
            </td>
            <td class="center">{{ a.is_serialized ? '—' : a.stok_jumlah }}</td>
            <td class="center">{{ a._count?.mutasi ?? 0 }}</td>
            <td @click.stop>
              <button
                v-if="a.status_aset === 'Di_Gudang'"
                class="btn-hapus"
                @click="hapusAset(a.id_aset, a.nama_perangkat)"
              >Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="aset.meta.total_pages > 1" class="pagination">
        <button v-for="p in aset.meta.total_pages" :key="p"
          :class="['page-btn', { active: p === aset.meta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="aset.meta.total">Total: {{ aset.meta.total }} aset</div>
    </div>

    <!-- Modal Tambah Aset -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Tambah Aset Baru</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Nama Perangkat <span class="req">*</span></label>
            <input v-model="form.nama_perangkat" placeholder="Mikrotik hEX, Switch 24 Port, ..." />
          </div>
          <div class="field">
            <label>Merk</label>
            <input v-model="form.merk" placeholder="Mikrotik, Cisco, Huawei, ..." />
          </div>
          <div class="field">
            <label>Tipe / Model</label>
            <input v-model="form.tipe_model" placeholder="RB750Gr3, SG110, ..." />
          </div>
          <div class="field">
            <label>Kategori <span class="req">*</span></label>
            <input v-model="form.kategori" list="kategori-list" placeholder="Router, Switch, ONU, ..." />
            <datalist id="kategori-list">
              <option v-for="k in aset.kategoriList" :key="k" :value="k" />
            </datalist>
          </div>
          <div class="field">
            <label>Kondisi</label>
            <select v-model="form.kondisi">
              <option v-for="k in KONDISI_LIST" :key="k" :value="k">{{ k.replace('_', ' ') }}</option>
            </select>
          </div>
          <div class="field full">
            <label class="row-label">
              <input type="checkbox" v-model="form.is_serialized" />
              Perangkat ber-serial number (1 unit per record)
            </label>
          </div>
          <template v-if="form.is_serialized">
            <div class="field full">
              <label>Serial Number</label>
              <input v-model="form.serial_number" placeholder="SN unik perangkat" />
            </div>
          </template>
          <template v-else>
            <div class="field">
              <label>Jumlah Stok</label>
              <input v-model.number="form.stok_jumlah" type="number" min="1" />
            </div>
          </template>
          <div class="field full">
            <label>Gudang</label>
            <select v-model.number="form.id_gudang">
              <option :value="0">— Gudang default —</option>
              <option v-for="g in gudangList" :key="g.id_gudang" :value="g.id_gudang">
                [{{ g.kode_gudang }}] {{ g.nama_gudang }}{{ g.kota ? ' — ' + g.kota : '' }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Lokasi / Site (opsional)</label>
            <select v-model="form.id_site">
              <option :value="0">— Gudang / Belum deploy —</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">
                [{{ s.kode_site }}] {{ s.nama_site }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Tanggal Perolehan</label>
            <input v-model="form.tgl_perolehan" type="date" />
          </div>
          <div class="field">
            <label>Harga Perolehan (Rp)</label>
            <input v-model.number="form.harga_perolehan" type="number" min="0" placeholder="0" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2" placeholder="Info tambahan..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Tambah Aset' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.header-actions { display: flex; gap: 10px; }
.btn-secondary { padding: 10px 18px; background: #fff; color: #1e40af; border: 1.5px solid #bfdbfe; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.summary-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.summary-chip { background: #fff; border-radius: 8px; padding: 12px 16px; border-left: 4px solid #94a3b8; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; min-width: 110px; }
.summary-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.sc-count { font-size: 22px; font-weight: 800; color: #0f172a; }
.sc-label { font-size: 11px; color: #64748b; }

.gudang-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.gudang-chip { background: #f0f9ff; border: 1.5px solid #bae6fd; color: #0369a1; border-radius: 20px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.gudang-chip:hover { background: #e0f2fe; }
.gudang-chip.active { background: #0369a1; border-color: #0369a1; color: #fff; }

.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.search-input { flex: 1; min-width: 220px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }
.selection-bar { display: flex; align-items: center; gap: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; color: #1e40af; font-weight: 600; }
.btn-label { padding: 6px 14px; background: #1e40af; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-label:hover { background: #1e3a8a; }
.btn-select-all { padding: 6px 14px; background: #fff; color: #1e40af; border: 1px solid #93c5fd; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-select-all:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-clear-sel { padding: 6px 14px; background: #fff; color: #64748b; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; margin-left: auto; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: top; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.kode { font-weight: 700; color: #1d4ed8; font-size: 13px; white-space: nowrap; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.serial { font-size: 11px; color: #94a3b8; font-family: monospace; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.center { text-align: center; font-weight: 700; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 560px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
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
