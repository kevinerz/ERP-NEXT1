<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import BasePagination from '@/components/BasePagination.vue'
import CariPilih, { type OpsiCari } from '@/components/CariPilih.vue'
import { fmtDateShort } from '@/composables/useFormat'
import { toast, pesanGalat } from '@/composables/useDialog'

const router = useRouter()

const list      = ref<any[]>([])
const meta      = ref({ total: 0, page: 1, limit: 25, total_pages: 1 })
const stats     = ref<any>(null)
const loading   = ref(false)
const search    = ref('')
const page      = ref(1)

// Import CSV
const showImport   = ref(false)
const importRows   = ref<any[]>([])
const importResult = ref<any[]>([])
const importing    = ref(false)
const importDone   = ref(false)
const importError  = ref('')
const importDilewati = ref(0)
const loadError    = ref('')

// Tambah PIC manual
const showAdd   = ref(false)
const addForm   = ref({ id_site: 0, nama_pic: '', jabatan: '', no_kontak: '', email: '', is_utama: false, tempat_lahir: '', tgl_lahir: '', media_komunikasi: '', rencana_tambah_layanan: '' })
const addError  = ref('')
const addSubmit = ref(false)

const MEDIA_LIST   = ['WhatsApp', 'Email', 'Telepon', 'Tatap Muka']
const RENCANA_LIST = ['Internet', 'Belum ada rencana', 'Masih dipertimbangkan']

onMounted(async () => {
  await Promise.all([fetchList(), fetchStats()])
})

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, limit: 25 }
    if (search.value) params.search = search.value
    const res = await api.get('/crm/pic', { params })
    list.value = res.data.data
    meta.value = res.data.meta
    loadError.value = ''
  } catch (e: any) {
    loadError.value = pesanGalat(e, 'Gagal memuat daftar PIC')
  } finally { loading.value = false }
}

async function fetchStats() {
  try {
    const res = await api.get('/crm/pic/stats')
    stats.value = res.data.data
  } catch { /* angka ringkasan opsional — daftar tetap tampil */ }
}

function doSearch() { page.value = 1; fetchList() }
function goPage(p: number) { page.value = p; fetchList() }

// ── Import CSV ─────────────────────────────────────────────
function onFileChange(e: Event) {
  importRows.value = []
  importResult.value = []
  importDone.value = false
  importError.value = ''
  importDilewati.value = 0
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const text = ev.target?.result as string
    importRows.value = parseCsv(text)
    if (!importRows.value.length) importError.value = 'Tidak ada baris yang bisa diimpor — pastikan header berisi "Nama Perusahaan" dan "Nama Lengkap PIC".'
  }
  reader.onerror = () => { importError.value = 'File tidak bisa dibaca' }
  reader.readAsText(file)
}

// Parser CSV sesuai RFC 4180: field ber-tanda kutip boleh berisi koma, baris baru, dan "" (kutip).
// Dulu pakai split(',') biasa — jawaban Google Form yang berisi koma membuat kolom bergeser.
function bacaCsv(text: string): string[][] {
  const baris: string[][] = []
  let kolom: string[] = [], sel = '', kutip = false
  const t = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (kutip) {
      if (c === '"' && t[i + 1] === '"') { sel += '"'; i++ }
      else if (c === '"') kutip = false
      else sel += c
    } else if (c === '"') kutip = true
    else if (c === ',') { kolom.push(sel); sel = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      kolom.push(sel); sel = ''
      if (kolom.some((k) => k.trim())) baris.push(kolom)
      kolom = []
    } else sel += c
  }
  kolom.push(sel)
  if (kolom.some((k) => k.trim())) baris.push(kolom)
  return baris
}

function parseCsv(text: string) {
  const semua = bacaCsv(text)
  if (semua.length < 2) return []
  const headers = semua[0]!.map(h => h.trim())
  const hasil = semua.slice(1).map(vals => {
    const obj: any = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim() })
    // Petakan kolom dari form Google
    return {
      nama_perusahaan:        obj['Nama Perusahaan'] || obj['nama_perusahaan'] || '',
      nama_pic:               obj['Nama Lengkap PIC'] || obj['nama_pic'] || '',
      jabatan:                obj['Jabatan di perusahaan'] || obj['jabatan'] || '',
      no_kontak:              obj['Nomor Handphone/WhatsApp'] || obj['no_kontak'] || '',
      email:                  obj['Email'] || obj['email'] || '',
      tempat_lahir:           obj['Tempat Lahir'] || obj['tempat_lahir'] || '',
      tgl_lahir:              obj['Tanggal Lahir'] || obj['tgl_lahir'] || '',
      catatan_update:         obj['Apakah terdapat perubahan data lain yang perlu kami ketahui?'] || '',
      media_komunikasi:       obj['Media komunikasi yang paling disukai'] || '',
      rencana_tambah_layanan: obj['Apakah perusahaan berencana menambah layanan Next One dalam 6–12 bulan ke depan?'] || '',
    }
  })
  const valid = hasil.filter(r => r.nama_perusahaan && r.nama_pic)
  importDilewati.value = hasil.length - valid.length
  return valid
}

async function doImport() {
  if (!importRows.value.length || importing.value) return
  importing.value = true; importError.value = ''
  try {
    const res = await api.post('/crm/pic/import', { rows: importRows.value })
    importResult.value = res.data.data
    importDone.value = true
    await Promise.all([fetchList(), fetchStats()])
  } catch (e: any) {
    importError.value = `Import gagal: ${pesanGalat(e, 'periksa koneksi lalu coba lagi')} Tidak ada baris yang tersimpan dari percobaan ini.`
  } finally { importing.value = false }
}

// ── Tambah PIC manual ─────────────────────────────────────
async function openAdd() {
  addForm.value = { id_site: 0, nama_pic: '', jabatan: '', no_kontak: '', email: '', is_utama: false, tempat_lahir: '', tgl_lahir: '', media_komunikasi: '', rencana_tambah_layanan: '' }
  addError.value = ''
  showAdd.value = true
}

async function handleAdd() {
  if (addSubmit.value) return
  if (!addForm.value.id_site || !addForm.value.nama_pic.trim()) { addError.value = 'Site dan nama wajib diisi'; return }
  addSubmit.value = true; addError.value = ''
  try {
    // Tanggal lahir kosong tidak dikirim: string kosong ditolak validasi tanggal di server
    await api.post('/crm/pic', { ...addForm.value, nama_pic: addForm.value.nama_pic.trim(), tgl_lahir: addForm.value.tgl_lahir || undefined })
    showAdd.value = false
    toast('PIC ditambahkan')
    await Promise.all([fetchList(), fetchStats()])
  } catch (e: any) { addError.value = pesanGalat(e, 'Gagal menambah PIC') }
  finally { addSubmit.value = false }
}

function statusColor(s: string) {
  if (s === 'created') return '#15803d'
  if (s === 'updated') return '#1d4ed8'
  if (s === 'skip')    return '#92400e'
  return '#dc2626'
}

const fmtDate = fmtDateShort

const STATUS_TEXT: Record<string, string> = { created: 'Dibuat', updated: 'Diperbarui', skip: 'Dilewati', error: 'Error' }

async function cariSite(q: string): Promise<OpsiCari[]> {
  const r = await api.get('/master/site', { params: { search: q || undefined, limit: 30 } })
  return (r.data.data as any[]).map((s) => ({ value: s.id_site, label: `[${s.kode_site}] ${s.nama_site}`, sub: s.pelanggan?.nama_pelanggan }))
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>CRM — Master Data PIC</h2>
        <p class="sub">Kontak penanggung jawab IT di setiap pelanggan</p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-import" @click="showImport = true; importDone = false; importRows = []; importResult = []; importError = ''; importDilewati = 0">⬆ Import CSV</button>
        <button type="button" class="btn btn-primary" @click="openAdd">+ Tambah PIC</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-row" v-if="stats">
      <div class="stat-card">
        <div class="stat-num">{{ stats.total ?? 0 }}</div>
        <div class="stat-label">Total PIC</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ stats.updated_30_hari ?? 0 }}</div>
        <div class="stat-label">Update 30 Hari</div>
      </div>
      <div class="stat-card" v-for="m in stats.by_media?.filter((x:any) => x.media_komunikasi)" :key="m.media_komunikasi">
        <div class="stat-num">{{ m._count.id_pic }}</div>
        <div class="stat-label">{{ m.media_komunikasi }}</div>
      </div>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama PIC / perusahaan / email..." class="search-input" />
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <!-- Tabel -->
    <div class="table-card">
      <div v-if="loading" class="loading">Memuat...</div>
      <div v-else-if="loadError" class="form-error" role="alert" style="margin:16px">{{ loadError }} <button type="button" class="btn-cancel" @click="fetchList">Coba lagi</button></div>
      <table v-else>
        <thead>
          <tr>
            <th>Nama PIC</th>
            <th>Perusahaan / Site</th>
            <th>Jabatan</th>
            <th>Kontak</th>
            <th>Media</th>
            <th>Rencana Layanan</th>
            <th>Update Data</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!list.length">
            <td colspan="7" class="empty">{{ search ? 'Tidak ada PIC yang cocok dengan pencarian ini' : 'Belum ada data PIC' }}</td>
          </tr>
          <tr v-baris v-for="p in list" :key="p.id_pic" class="row-link" @click="router.push(`/crm/pic/${p.id_pic}`)">
            <td>
              <div class="fw">{{ p.nama_pic }}</div>
              <div class="text-sm text-gray">{{ p.email || '—' }}</div>
            </td>
            <td>
              <div class="fw">{{ p.site?.pelanggan?.nama_pelanggan || '—' }}</div>
              <div class="text-sm text-gray">{{ p.site?.nama_site }}</div>
            </td>
            <td class="text-gray">{{ p.jabatan || '—' }}</td>
            <td class="text-gray">{{ p.no_kontak || '—' }}</td>
            <td>
              <span v-if="p.media_komunikasi" class="badge-media">{{ p.media_komunikasi }}</span>
              <span v-else class="text-gray">—</span>
            </td>
            <td>
              <span v-if="p.rencana_tambah_layanan" :class="['badge-rencana', p.rencana_tambah_layanan === 'Internet' ? 'rencana-yes' : 'rencana-no']">
                {{ p.rencana_tambah_layanan }}
              </span>
              <span v-else class="text-gray">—</span>
            </td>
            <td class="text-sm text-gray">{{ p.tgl_update_data ? fmtDate(p.tgl_update_data) : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <BasePagination :page="page" :total-pages="meta.total_pages" @change="goPage" />
      <div class="table-footer" v-if="meta.total">Total: {{ meta.total }} PIC</div>
    </div>

    <!-- Modal Import CSV -->
    <div v-if="showImport" class="modal-overlay" @click.self="showImport = false">
      <div class="modal modal-wide">
        <h3>Import PIC dari CSV</h3>
        <p class="hint">Format kolom: dari Google Form respons atau CSV manual dengan header yang sama.</p>

        <div v-if="!importDone">
          <input type="file" accept=".csv" class="file-input" @change="onFileChange" />

          <p v-if="importDilewati" class="import-info">⚠ {{ importDilewati }} baris dilewati karena Nama Perusahaan atau Nama PIC kosong.</p>
          <p v-if="importError" class="form-error" role="alert">{{ importError }}</p>
          <div v-if="importRows.length" class="preview-box">
            <p class="preview-title">Preview {{ importRows.length }} baris:</p>
            <table class="preview-table">
              <thead><tr><th>Perusahaan</th><th>Nama PIC</th><th>Jabatan</th><th>Email</th><th>Media</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in importRows.slice(0, 5)" :key="i">
                  <td>{{ r.nama_perusahaan }}</td>
                  <td>{{ r.nama_pic }}</td>
                  <td>{{ r.jabatan }}</td>
                  <td>{{ r.email }}</td>
                  <td>{{ r.media_komunikasi }}</td>
                </tr>
                <tr v-if="importRows.length > 5"><td colspan="5" class="text-gray text-sm">...dan {{ importRows.length - 5 }} baris lainnya</td></tr>
              </tbody>
            </table>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="showImport = false">Batal</button>
            <button class="btn-submit" :disabled="!importRows.length || importing" @click="doImport">
              {{ importing ? 'Mengimpor...' : `Import ${importRows.length} Baris` }}
            </button>
          </div>
        </div>

        <div v-else>
          <div class="result-summary">
            <span class="res-ok">✓ {{ importResult.filter(r => r.status === 'created' || r.status === 'updated').length }} berhasil</span>
            <span class="res-skip">⚠ {{ importResult.filter(r => r.status === 'skip').length }} dilewati</span>
            <span class="res-err">✗ {{ importResult.filter(r => r.status === 'error').length }} error</span>
          </div>
          <table class="preview-table">
            <thead><tr><th>Perusahaan</th><th>Nama PIC</th><th>Status</th><th>Keterangan</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in importResult" :key="i">
                <td>{{ r.nama_perusahaan }}</td>
                <td>{{ r.nama_pic }}</td>
                <td><span :style="{ color: statusColor(r.status), fontWeight: 700 }">{{ STATUS_TEXT[r.status] || r.status }}</span></td>
                <td class="text-sm text-gray">{{ r.keterangan || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="modal-actions">
            <button class="btn-submit" @click="showImport = false">Tutup</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Tambah PIC -->
    <div v-if="showAdd" class="modal-overlay" @click.self="showAdd = false">
      <div class="modal">
        <h3>Tambah PIC Baru</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Site <span class="req">*</span></label>
            <CariPilih :model-value="addForm.id_site || null" :cari="cariSite"
              placeholder="Cari site: nama, kode, kota, pelanggan…"
              @update:model-value="(v) => (addForm.id_site = v || 0)" />
          </div>
          <div class="field full">
            <label>Nama PIC <span class="req">*</span></label>
            <input v-model="addForm.nama_pic" placeholder="Nama lengkap" />
          </div>
          <div class="field">
            <label>Jabatan</label>
            <input v-model="addForm.jabatan" placeholder="IT Manager, dll." />
          </div>
          <div class="field">
            <label>No. HP / WhatsApp</label>
            <input v-model="addForm.no_kontak" placeholder="08xx..." />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="addForm.email" type="email" />
          </div>
          <div class="field">
            <label>Tempat Lahir</label>
            <input v-model="addForm.tempat_lahir" />
          </div>
          <div class="field">
            <label>Tanggal Lahir</label>
            <input v-model="addForm.tgl_lahir" type="date" />
          </div>
          <div class="field">
            <label>Media Komunikasi</label>
            <select v-model="addForm.media_komunikasi">
              <option value="">— Pilih —</option>
              <option v-for="m in MEDIA_LIST" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="field">
            <label>Rencana Tambah Layanan</label>
            <select v-model="addForm.rencana_tambah_layanan">
              <option value="">— Pilih —</option>
              <option v-for="r in RENCANA_LIST" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
        </div>
        <p v-if="addError" class="form-error">{{ addError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showAdd = false">Batal</button>
          <button class="btn-submit" @click="handleAdd" :disabled="addSubmit">{{ addSubmit ? 'Menyimpan...' : 'Simpan' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: var(--text-1); }
.sub { margin: 0; font-size: 13px; color: var(--text-3); }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-import  { padding: 8px 16px; background: var(--success-light); color: #15803d; border: 1px solid #bbf7d0; border-radius: var(--r); font-size: 13.5px; font-weight: 600; cursor: pointer; line-height: 1; }
.btn-import:hover { background: #dcfce7; }

.stats-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 10px; padding: 14px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); min-width: 110px; }
.stat-num   { font-size: 26px; font-weight: 800; color: #0f172a; }
.stat-label { font-size: 11px; color: #64748b; }

.search-input { flex: 1; min-width: 220px; }
.btn-search { height: 36px; padding: 0 16px; background: var(--border-light); border: 1px solid var(--border); border-radius: var(--r); font-size: 13.5px; font-weight: 600; color: var(--text-2); cursor: pointer; }
.btn-search:hover { background: var(--border); }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 11px 14px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; }
td { padding: 12px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw { font-weight: 600; }
.text-sm { font-size: 12px; }
.text-gray { color: #64748b; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.badge-media  { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: #eff6ff; color: #1d4ed8; }
.badge-rencana { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.rencana-yes  { background: #f0fdf4; color: #15803d; }
.rencana-no   { background: #f8fafc; color: #64748b; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

.modal        { padding: 28px 32px; max-width: 520px; }
.modal-wide   { max-width: 720px; }
.modal h3     { margin: 0 0 12px; font-size: 18px; color: #0f172a; }
.hint         { font-size: 12px; color: #64748b; margin: 0 0 16px; }
.file-input   { display: block; margin-bottom: 16px; font-size: 13px; }

.preview-box   { margin-bottom: 16px; }
.preview-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
.preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.preview-table th { background: #f8fafc; padding: 7px 10px; text-align: left; font-size: 11px; color: #64748b; }
.preview-table td { padding: 7px 10px; border-top: 1px solid #f1f5f9; }

.result-summary { display: flex; gap: 20px; margin-bottom: 14px; font-size: 14px; font-weight: 700; }
.res-ok   { color: #15803d; }
.res-skip { color: #92400e; }
.res-err  { color: #dc2626; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; }
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.result-summary { flex-wrap: wrap; gap: 8px 20px; }
@media (max-width: 480px) {
  .modal { padding: 20px 18px; }
}
.import-info { margin: 8px 0; color: #b45309; font-size: 13px; }
</style>
