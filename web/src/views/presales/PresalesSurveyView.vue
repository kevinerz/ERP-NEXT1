<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import api from '@/services/api'
import { fmtDateShort } from '@/composables/useFormat'
import BasePagination from '@/components/BasePagination.vue'

interface Layanan { id_layanan: number; kode_layanan: string; nama_layanan: string }

interface Survey {
  id_survey: number
  id_opportunity: number | null
  id_layanan: number | null
  nama_prospek: string | null
  alamat_survey: string | null
  kota: string | null
  tanggal_survey: string | null
  nama_odp: string | null
  status_odp: string
  vendor: string | null
  nomor_order_vendor: string | null
  sn_modem: string | null
  status_order: string
  tgl_order: string | null
  tgl_estimasi_selesai: string | null
  tgl_selesai: string | null
  catatan: string | null
  id_presales_pic: number | null
  status_presales: string
  created_at: string
  opportunity?: { id_opportunity: number; nama_opportunity: string; lead: { nama_prospek: string; nama_perusahaan: string } } | null
  layanan?: Layanan | null
  presales_pic?: { id_karyawan: number; nama_lengkap: string } | null
}

interface Karyawan { id_karyawan: number; nama_lengkap: string; jabatan: string }
interface Opportunity { id_opportunity: number; nama_opportunity: string; lead: { nama_prospek: string; nama_perusahaan: string } }

const surveys     = ref<Survey[]>([])
const total       = ref(0)
const loading     = ref(false)
const karyawan    = ref<Karyawan[]>([])
const oppList     = ref<Opportunity[]>([])
const layananList = ref<Layanan[]>([])
const showModal   = ref(false)
const saving      = ref(false)
const saveError   = ref('')
const editId      = ref<number | null>(null)
const confirmDel  = ref<number | null>(null)

const filters = reactive({ search: '', status_presales: '', id_layanan: '', status_odp: '', page: 1, limit: 25 })

const STATUS_ODP = ['Belum_Survey', 'Tersedia', 'Penuh', 'Tidak_Ada_Coverage']
const STATUS_ORDER = ['Belum_Order', 'Submitted', 'Proses', 'Selesai', 'Gagal']
const STATUS_PRESALES = ['Draft', 'Survey_Done', 'Ordered', 'Provisioned', 'Cancelled']

const form = reactive<Partial<Survey>>({
  id_opportunity: null,
  id_layanan: null,
  nama_prospek: '',
  alamat_survey: '',
  kota: '',
  tanggal_survey: '',
  nama_odp: '',
  status_odp: 'Belum_Survey',
  vendor: '',
  nomor_order_vendor: '',
  sn_modem: '',
  status_order: 'Belum_Order',
  tgl_order: '',
  tgl_estimasi_selesai: '',
  tgl_selesai: '',
  catatan: '',
  id_presales_pic: null,
  status_presales: 'Draft',
})

const loadError = ref('')
let fetchSeq = 0

async function fetchSurveys() {
  const seq = ++fetchSeq
  loading.value = true
  loadError.value = ''
  try {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '' && v !== null)
    )
    const res = await api.get('/presales', { params })
    if (seq !== fetchSeq) return // respons lama tidak boleh menimpa hasil pencarian terbaru
    surveys.value = res.data.data
    total.value   = res.data.meta?.total ?? 0
  } catch (e: any) {
    if (seq === fetchSeq) loadError.value = e?.response?.data?.message ?? 'Gagal memuat data survey'
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

async function fetchRefs() {
  try {
    const [k, o, l] = await Promise.all([
      api.get('/presales/karyawan'),
      api.get('/presales/opportunity'),
      api.get('/presales/layanan'),
    ])
    karyawan.value    = k.data.data
    oppList.value     = o.data.data
    layananList.value = l.data.data
  } catch (e: any) {
    loadError.value = e?.response?.data?.message ?? 'Gagal memuat data referensi (karyawan/opportunity/layanan)'
  }
}

onMounted(() => { fetchSurveys(); fetchRefs() })

function openCreate() {
  editId.value = null
  Object.assign(form, {
    id_opportunity: null, id_layanan: null, nama_prospek: '', alamat_survey: '', kota: '',
    tanggal_survey: '', nama_odp: '', status_odp: 'Belum_Survey',
    vendor: '', nomor_order_vendor: '', sn_modem: '', status_order: 'Belum_Order',
    tgl_order: '', tgl_estimasi_selesai: '', tgl_selesai: '',
    catatan: '', id_presales_pic: null, status_presales: 'Draft',
  })
  showModal.value = true
}

// Hanya field ini yang boleh dikirim — backend menolak field lain (id_survey, relasi, created_at)
const FORM_KEYS = Object.keys(form) as (keyof typeof form)[]
const DATE_KEYS = ['tanggal_survey', 'tgl_order', 'tgl_estimasi_selesai', 'tgl_selesai'] as const

function openEdit(s: Survey) {
  editId.value = s.id_survey
  saveError.value = ''
  const f: any = {}
  for (const k of FORM_KEYS) f[k] = (s as any)[k] ?? (typeof form[k] === 'string' ? '' : null)
  for (const k of DATE_KEYS) if (f[k]) f[k] = String(f[k]).slice(0, 10)
  Object.assign(form, f)
  showModal.value = true
}

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    const payload: any = {}
    for (const k of FORM_KEYS) {
      const v = form[k]
      // Edit: field yang dikosongkan dikirim null supaya benar-benar terhapus
      payload[k] = v === '' ? (editId.value ? null : undefined) : v
    }
    if (editId.value) {
      await api.patch(`/presales/${editId.value}`, payload)
    } else {
      await api.post('/presales', payload)
    }
    showModal.value = false
    await fetchSurveys()
  } catch (e: any) {
    saveError.value = e?.response?.data?.message ?? e?.message ?? 'Gagal menyimpan, coba lagi.'
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)
const delError = ref('')

async function del(id: number) {
  if (deleting.value) return
  deleting.value = true
  delError.value = ''
  try {
    await api.delete(`/presales/${id}`)
    confirmDel.value = null
    await fetchSurveys()
  } catch (e: any) {
    delError.value = e?.response?.data?.message ?? 'Gagal menghapus survey'
  } finally {
    deleting.value = false
  }
}

function searchInput() { filters.page = 1; fetchSurveys() }

let searchTimer: ReturnType<typeof setTimeout> | undefined
function searchDebounced() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(searchInput, 300)
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / filters.limit)))
function goPage(p: number) { filters.page = p; fetchSurveys() }

function badgeOdp(s: string) {
  return { Tersedia: 'badge-green', Penuh: 'badge-red', Tidak_Ada_Coverage: 'badge-gray', Belum_Survey: 'badge-amber' }[s] ?? 'badge-gray'
}
function badgeOrder(s: string) {
  return { Selesai: 'badge-green', Gagal: 'badge-red', Proses: 'badge-blue', Submitted: 'badge-amber', Belum_Order: 'badge-gray' }[s] ?? 'badge-gray'
}
function badgePresales(s: string) {
  return { Provisioned: 'badge-green', Cancelled: 'badge-red', Ordered: 'badge-blue', Survey_Done: 'badge-amber', Draft: 'badge-gray' }[s] ?? 'badge-gray'
}
function labelPresales(s: string) {
  return { Draft: 'Draft', Survey_Done: 'Survey ✓', Ordered: 'Ordered', Provisioned: 'Provisioned', Cancelled: 'Batal' }[s] ?? s
}
const fmtDate = fmtDateShort
function prospecName(s: Survey) {
  if (s.opportunity) return s.opportunity.lead?.nama_perusahaan || s.opportunity.lead?.nama_prospek || s.nama_prospek || '—'
  return s.nama_prospek || '—'
}
</script>

<template>
  <div class="page">
    <div class="page-header ps-header">
      <div class="ps-title-block">
        <h1>Pre-Sales Survey</h1>
        <span class="ps-count">{{ total }} survey</span>
      </div>
      <button type="button" class="btn-primary" @click="openCreate">+ Tambah Survey</button>
    </div>

    <!-- Filter bar -->
    <div class="ps-filters">
      <input v-model="filters.search" placeholder="Cari prospek, ODP, SN modem…"
        class="filter-input" @input="searchDebounced" />
      <select v-model="filters.status_presales" class="filter-select" @change="searchInput">
        <option value="">Semua Status</option>
        <option v-for="s in STATUS_PRESALES" :key="s" :value="s">{{ labelPresales(s) }}</option>
      </select>
      <select v-model="filters.id_layanan" class="filter-select" @change="searchInput">
        <option value="">Semua Layanan</option>
        <option v-for="l in layananList" :key="l.id_layanan" :value="String(l.id_layanan)">{{ l.nama_layanan }}</option>
      </select>
      <select v-model="filters.status_odp" class="filter-select" @change="searchInput">
        <option value="">Semua ODP</option>
        <option v-for="s in STATUS_ODP" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
      </select>
    </div>

    <!-- Pipeline badges -->
    <div class="ps-pipeline">
      <span v-for="s in STATUS_PRESALES" :key="s"
        class="pipe-badge" :class="badgePresales(s)"
        :style="{ cursor: 'pointer', opacity: filters.status_presales === s ? 1 : 0.55 }"
        @click="filters.status_presales = filters.status_presales === s ? '' : s; searchInput()">
        {{ labelPresales(s) }}
      </span>
    </div>

    <div v-if="loadError" class="save-error" role="alert">{{ loadError }}</div>

    <!-- Table -->
    <div class="ps-table-wrap">
      <div v-if="loading" class="ps-loading">Memuat…</div>
      <table v-else class="ps-table">
        <thead>
          <tr>
            <th>Prospek / Site</th>
            <th>Kota</th>
            <th>ODP</th>
            <th>Status ODP</th>
            <th>Layanan</th>
            <th>No. Order</th>
            <th>SN Modem</th>
            <th>Status Order</th>
            <th>Tgl Survey</th>
            <th>Status</th>
            <th>PIC</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!surveys.length">
            <td colspan="12" class="ps-empty">Belum ada data survey</td>
          </tr>
          <tr v-for="s in surveys" :key="s.id_survey" class="ps-row" @click="openEdit(s)">
            <td class="td-name">
              <span class="td-main">{{ prospecName(s) }}</span>
              <span v-if="s.alamat_survey" class="td-sub">{{ s.alamat_survey }}</span>
            </td>
            <td>{{ s.kota || '—' }}</td>
            <td>{{ s.nama_odp || '—' }}</td>
            <td><span class="badge" :class="badgeOdp(s.status_odp)">{{ s.status_odp.replace(/_/g, ' ') }}</span></td>
            <td>{{ s.layanan?.nama_layanan || s.vendor || '—' }}</td>
            <td>{{ s.nomor_order_vendor || '—' }}</td>
            <td class="td-mono">{{ s.sn_modem || '—' }}</td>
            <td><span class="badge" :class="badgeOrder(s.status_order)">{{ s.status_order.replace(/_/g, ' ') }}</span></td>
            <td>{{ fmtDate(s.tanggal_survey) }}</td>
            <td><span class="badge" :class="badgePresales(s.status_presales)">{{ labelPresales(s.status_presales) }}</span></td>
            <td>{{ s.presales_pic?.nama_lengkap || '—' }}</td>
            <td class="td-action" @click.stop>
              <button type="button" class="btn-del" @click="confirmDel = s.id_survey" title="Hapus" aria-label="Hapus survey">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <BasePagination :page="filters.page" :total-pages="totalPages" @change="goPage" />

    <!-- Modal Create/Edit -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-box">
          <div class="modal-head">
            <h2>{{ editId ? 'Edit Survey' : 'Tambah Survey' }}</h2>
            <button type="button" class="modal-close" aria-label="Tutup" @click="showModal = false">✕</button>
          </div>

          <form class="modal-form" @submit.prevent="save">
            <!-- Status presales -->
            <div class="form-section-title">Status Pre-Sales</div>
            <div class="field">
              <label>Status Keseluruhan</label>
              <select v-model="form.status_presales">
                <option v-for="s in STATUS_PRESALES" :key="s" :value="s">{{ labelPresales(s) }}</option>
              </select>
            </div>

            <!-- Identitas -->
            <div class="form-section-title">Identitas Prospek</div>
            <div class="field">
              <label>Link ke Opportunity</label>
              <select v-model="form.id_opportunity">
                <option :value="null">— Tanpa Opportunity —</option>
                <option v-for="o in oppList" :key="o.id_opportunity" :value="o.id_opportunity">
                  {{ o.nama_opportunity }} ({{ o.lead?.nama_perusahaan || o.lead?.nama_prospek || '?' }})
                </option>
              </select>
            </div>
            <div class="field">
              <label>Nama Prospek / Perusahaan</label>
              <input v-model="form.nama_prospek" placeholder="Nama jika tanpa opportunity" />
            </div>
            <div class="field">
              <label>Alamat</label>
              <textarea v-model="form.alamat_survey" rows="2" placeholder="Alamat lokasi survey"></textarea>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Kota</label>
                <input v-model="form.kota" placeholder="Kota" />
              </div>
              <div class="field">
                <label>Tanggal Survey</label>
                <input v-model="form.tanggal_survey" type="date" />
              </div>
            </div>

            <!-- Survey FO -->
            <div class="form-section-title">Survey FO / ODP</div>
            <div class="field-row">
              <div class="field">
                <label>Nama ODP</label>
                <input v-model="form.nama_odp" placeholder="Kode/nama ODP" />
              </div>
              <div class="field">
                <label>Status ODP</label>
                <select v-model="form.status_odp">
                  <option v-for="s in STATUS_ODP" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
                </select>
              </div>
            </div>

            <!-- Vendor Order -->
            <div class="form-section-title">Order ke Vendor</div>
            <div class="field">
              <label>Layanan</label>
              <select v-model="form.id_layanan">
                <option :value="null">— Pilih Layanan —</option>
                <option v-for="l in layananList" :key="l.id_layanan" :value="l.id_layanan">
                  {{ l.nama_layanan }} ({{ l.kode_layanan }})
                </option>
              </select>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Nama Vendor / ISP</label>
                <input v-model="form.vendor" placeholder="Telkom, Biznet, IKG, dll" />
              </div>
              <div class="field">
                <label>Status Order</label>
                <select v-model="form.status_order">
                  <option v-for="s in STATUS_ORDER" :key="s" :value="s">{{ s.replace(/_/g, ' ') }}</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label>Nomor Order / Tiket Vendor</label>
              <input v-model="form.nomor_order_vendor" placeholder="No. tiket dari Telkom/Biznet/dll" />
            </div>
            <div class="field">
              <label>SN Modem (Serial Number)</label>
              <input v-model="form.sn_modem" placeholder="Serial number modem yang dipasang" class="font-mono" />
            </div>
            <div class="field-row">
              <div class="field">
                <label>Tanggal Order</label>
                <input v-model="form.tgl_order" type="date" />
              </div>
              <div class="field">
                <label>Estimasi Selesai</label>
                <input v-model="form.tgl_estimasi_selesai" type="date" />
              </div>
              <div class="field">
                <label>Tanggal Selesai</label>
                <input v-model="form.tgl_selesai" type="date" />
              </div>
            </div>

            <!-- PIC & Catatan -->
            <div class="form-section-title">Tambahan</div>
            <div class="field">
              <label>PIC Survey</label>
              <select v-model="form.id_presales_pic">
                <option :value="null">— Tidak ada —</option>
                <option v-for="k in karyawan" :key="k.id_karyawan" :value="k.id_karyawan">{{ k.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field">
              <label>Catatan</label>
              <textarea v-model="form.catatan" rows="3" placeholder="Catatan tambahan…"></textarea>
            </div>

            <div v-if="saveError" class="save-error">{{ saveError }}</div>
            <div class="modal-actions">
              <button type="button" class="btn-cancel" @click="showModal = false">Batal</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                {{ saving ? 'Menyimpan…' : 'Simpan' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete -->
    <Teleport to="body">
      <div v-if="confirmDel" class="modal-overlay" @click.self="confirmDel = null; delError = ''">
        <div class="modal-box modal-small">
          <h3>Hapus survey ini?</h3>
          <p>Data tidak dapat dikembalikan.</p>
          <div v-if="delError" class="save-error" role="alert">{{ delError }}</div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="confirmDel = null; delError = ''">Batal</button>
            <button class="btn-danger" :disabled="deleting" @click="del(confirmDel!)">{{ deleting ? 'Menghapus…' : 'Hapus' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.save-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 10px; }

.ps-header { align-items: center; margin-bottom: 18px; }
.ps-title-block { display: flex; align-items: baseline; gap: 10px; }
.ps-title-block h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0; }
.ps-count { font-size: 13px; color: #64748b; }

.ps-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.filter-input {
  flex: 1 1 220px; padding: 9px 12px;
  border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; background: #f8fafc; outline: none;
}
.filter-input:focus { border-color: #3b82f6; background: #fff; }
.filter-select {
  padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; background: #f8fafc; outline: none;
}

.ps-pipeline { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.pipe-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity .15s; user-select: none; }

.ps-table-wrap { overflow-x: auto; border-radius: var(--r-lg); border: 1px solid var(--border); box-shadow: var(--shadow-sm); background: var(--surface); }
.ps-table { width: 100%; border-collapse: collapse; font-size: 13.5px; background: #fff; }
.ps-table thead { background: #f8fafc; }
.ps-table thead th {
  padding: 12px 14px; text-align: left;
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .5px; color: #64748b; white-space: nowrap;
}
.ps-row { cursor: pointer; transition: background .1s; border-top: 1px solid #f1f5f9; }
.ps-row:hover td { background: #f8fafc; }
.ps-table td { padding: 12px 14px; font-size: 14px; color: #0f172a; vertical-align: top; }
.ps-empty { text-align: center; color: #94a3b8; padding: 40px; }
.ps-loading { padding: 40px; text-align: center; color: #94a3b8; }

.td-name { max-width: 200px; }
.td-main { display: block; font-weight: 600; }
.td-sub { display: block; font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.td-mono { font-family: monospace; font-size: 12px; }
.td-action { width: 36px; }
.btn-del { background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 14px; padding: 4px 6px; border-radius: 6px; }
.btn-del:hover { background: #fef2f2; color: #dc2626; }

/* Badges: .badge / .badge-* dari main.css */
.ps-table { min-width: 1100px; }

/* Buttons */
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-danger { padding: 9px 22px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.modal-box { background: #fff; border-radius: 14px; width: 100%; max-width: 680px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.2); }
.modal-small { max-width: 420px; padding: 32px; text-align: center; }
.modal-small h3 { margin: 0 0 8px; font-size: 18px; color: #0f172a; }
.modal-small p { color: #64748b; font-size: 14px; margin-bottom: 20px; }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px 0; }
.modal-head h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
.modal-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b; line-height: 1; }
.modal-form { padding: 16px 28px 28px; display: flex; flex-direction: column; gap: 14px; }

.form-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; padding: 8px 0 2px; border-top: 1px solid #f1f5f9; margin-top: 4px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }
.font-mono { font-family: 'Courier New', monospace; }

.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }

@media (max-width: 480px) {
  .modal-head { padding: 18px 18px 0; }
  .modal-form { padding: 14px 18px 20px; }
  .modal-small { padding: 24px 20px; }
}
</style>
