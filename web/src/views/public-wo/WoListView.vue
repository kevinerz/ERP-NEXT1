<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import BasePagination from '@/components/BasePagination.vue'
import CariPilih, { type OpsiCari } from '@/components/CariPilih.vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDateTime as fmtDate } from '@/composables/useFormat'
import { alertError, pesanGalat, toast } from '@/composables/useDialog'
import { useFilterUrl } from '@/composables/useFilterUrl'

const router = useRouter()

const loading    = ref(false)
const loadError  = ref('')
const wos        = ref<any[]>([])
const summary    = ref<{ status: string; count: number }[]>([])
const teknisis   = ref<any[]>([])
const search     = ref('')
const filterStatus  = ref('')
const filterJenis   = ref('')
const filterTeknisi = ref('')
const page          = ref(1)
// Filter & halaman disimpan di URL — tetap sama setelah kembali dari halaman detail
useFilterUrl({ q: search, status: filterStatus, jenis: filterJenis, teknisi: filterTeknisi, page })
const meta          = ref({ total: 0, total_pages: 1 })

const showModal  = ref(false)
const saving     = ref(false)
const vendors    = ref<{ id_vendor: number; nama_vendor: string }[]>([])
const vendorErr  = ref('')
const form = ref({
  jenis_wo: 'Instalasi',
  id_site: '',
  tipe_eksekutor: 'Internal_NEXT1',
  id_teknisi_internal: '',
  id_vendor_ketiga: '',
  tgl_jadwal: '',
  deskripsi_tugas: '',
})

const JENIS_WO = ['Instalasi', 'Maintenance', 'Perbaikan', 'Relokasi', 'Upgrade', 'Lainnya']

// In_Progress/Completed/Cancelled = status yang ditulis modul Jadwal Visit untuk tabel WO yang sama
const STATUS_STYLE: Record<string, string> = {
  In_Progress: 'badge-amber',
  Completed:  'badge-green',
  Cancelled:  'badge-gray',
  Open:       'badge-blue',
  Dispatch:   'badge-blue',
  'On-Site':  'badge-amber',
  Selesai:    'badge-green',
  Ditunda:    'badge-amber',
  Dibatalkan: 'badge-gray',
}
const STATUS_LABEL: Record<string, string> = {
  Open: 'Open', Dispatch: 'Dispatch', 'On-Site': 'On-Site',
  Selesai: 'Selesai', Ditunda: 'Ditunda', Dibatalkan: 'Dibatalkan',
  In_Progress: 'Dikerjakan', Completed: 'Selesai (visit)', Cancelled: 'Batal (visit)',
}

async function fetchSummary() {
  try {
    const { data } = await api.get('/public-wo/status-summary')
    summary.value = data.data
  } catch {}
}

function goPage(p: number) { page.value = p; fetchList() }

// Nomor urut: hasil pencarian lama tidak boleh menimpa hasil pencarian terbaru
let urutList = 0
async function fetchList() {
  const no = ++urutList
  loading.value = true
  loadError.value = ''
  try {
    const params: any = { page: page.value, limit: 20 }
    if (search.value.trim()) params.search     = search.value.trim()
    if (filterStatus.value)  params.status_wo  = filterStatus.value
    if (filterJenis.value)   params.jenis_wo   = filterJenis.value
    if (filterTeknisi.value) params.id_teknisi = filterTeknisi.value
    const { data } = await api.get('/public-wo', { params })
    if (no !== urutList) return
    wos.value  = data.data ?? []
    meta.value = data.meta ?? { total: 0, total_pages: 1 }
  } catch (e: any) {
    if (no === urutList) loadError.value = pesanGalat(e, 'Gagal memuat Work Order')
  } finally {
    if (no === urutList) loading.value = false
  }
}

async function fetchDropdowns() {
  try {
    const t = await api.get('/public-wo/teknisi')
    teknisis.value = t.data.data
  } catch { /* dropdown filter kosong kalau gagal — tidak fatal buat halaman */ }
}

// Site dicari ke server (daftar lama hanya 500 site aktif pertama)
async function cariSite(q: string): Promise<OpsiCari[]> {
  const r = await api.get('/public-wo/sites', { params: { search: q || undefined } })
  return (r.data.data as any[]).slice(0, 50).map((s) => ({ value: s.id_site, label: `${s.kode_site} — ${s.nama_site}`, sub: s.pelanggan?.nama_pelanggan }))
}

async function muatVendor() {
  if (vendors.value.length) return
  vendorErr.value = ''
  try { vendors.value = (await api.get('/public-wo/vendor')).data.data }
  catch (e: any) { vendorErr.value = e?.response?.data?.message || 'Gagal memuat daftar vendor' }
}
watch(() => form.value.tipe_eksekutor, (t) => {
  if (t === 'Vendor_Ketiga') { form.value.id_teknisi_internal = ''; muatVendor() }
  else form.value.id_vendor_ketiga = ''
})
// Field wajib yang belum diisi — ditampilkan supaya tombol nonaktif tidak membingungkan
const kurang = computed(() => {
  const k: string[] = []
  if (!form.value.id_site) k.push('site')
  if (form.value.tipe_eksekutor === 'Vendor_Ketiga' && !form.value.id_vendor_ketiga) k.push('vendor')
  if (!form.value.tgl_jadwal) k.push('tanggal jadwal')
  if (!form.value.deskripsi_tugas.trim()) k.push('deskripsi tugas')
  return k
})

function resetFilter() {
  search.value = ''; filterStatus.value = ''; filterJenis.value = ''; filterTeknisi.value = ''
  page.value = 1; fetchList()
}

let debounce: ReturnType<typeof setTimeout>
watch(search, () => { clearTimeout(debounce); debounce = setTimeout(() => { page.value = 1; fetchList() }, 350) })
watch([filterStatus, filterJenis, filterTeknisi], () => { page.value = 1; fetchList() })

function goDetail(id: number) { router.push(`/public-wo/${id}`) }

function openModal() {
  form.value = { jenis_wo: 'Instalasi', id_site: '', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: '', id_vendor_ketiga: '', tgl_jadwal: '', deskripsi_tugas: '' }
  showModal.value = true
}

async function submitWo() {
  if (kurang.value.length || saving.value) return
  saving.value = true
  try {
    const payload: any = {
      jenis_wo: form.value.jenis_wo,
      id_site: Number(form.value.id_site),
      tipe_eksekutor: form.value.tipe_eksekutor,
      tgl_jadwal: form.value.tgl_jadwal,
      deskripsi_tugas: form.value.deskripsi_tugas,
    }
    if (form.value.tipe_eksekutor === 'Internal_NEXT1' && form.value.id_teknisi_internal) payload.id_teknisi_internal = Number(form.value.id_teknisi_internal)
    if (form.value.tipe_eksekutor === 'Vendor_Ketiga') payload.id_vendor_ketiga = Number(form.value.id_vendor_ketiga)
    const { data } = await api.post('/public-wo', payload)
    showModal.value = false
    toast(data.message || 'Work Order dibuat')
    router.push(`/public-wo/${data.data.id_wo}`)
  } catch (e: any) {
    alertError(e, 'Gagal membuat WO')
  } finally {
    saving.value = false
  }
}


const summaryTotal = computed(() => summary.value.reduce((a, b) => a + b.count, 0))

onMounted(() => { fetchSummary(); fetchList(); fetchDropdowns() })
onBeforeUnmount(() => clearTimeout(debounce))
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Work Order</h2>
        <p class="sub">Manajemen pekerjaan lapangan & teknisi</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openModal">+ Buat WO</button>
    </div>

    <!-- Summary cards -->
    <div class="summary-row">
      <div class="sum-card">
        <div class="sum-num">{{ summaryTotal }}</div>
        <div class="sum-label">Total WO</div>
      </div>
      <div v-for="s in summary" :key="s.status" class="sum-card" :class="`sum-${s.status.toLowerCase().replace('_', '-')}`">
        <div class="sum-num">{{ s.count }}</div>
        <div class="sum-label">{{ STATUS_LABEL[s.status] || s.status }}</div>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <input v-model="search" class="search-input" placeholder="Cari nomor WO, site, pelanggan…" />
      <select v-model="filterStatus" class="select-filter">
        <option value="">Semua Status</option>
        <option value="Open">Open</option>
        <option value="Dispatch">Dispatch</option>
        <option value="On-Site">On-Site</option>
        <option value="Selesai">Selesai</option>
        <option value="Ditunda">Ditunda</option>
        <option value="Dibatalkan">Dibatalkan</option>
        <option value="In_Progress">Dikerjakan (visit)</option>
        <option value="Completed">Selesai (visit)</option>
        <option value="Cancelled">Batal (visit)</option>
      </select>
      <select v-model="filterJenis" class="select-filter">
        <option value="">Semua Jenis</option>
        <option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option>
      </select>
      <select v-model="filterTeknisi" class="select-filter">
        <option value="">Semua Teknisi</option>
        <option v-for="t in teknisis" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
      </select>
      <button type="button" class="btn-reset" @click="resetFilter">Reset</button>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="state">Memuat data…</div>
      <div v-else-if="loadError" class="state state-error" role="alert">
        {{ loadError }}
        <div style="margin-top:10px"><button type="button" class="btn-reset" @click="fetchList">Coba lagi</button></div>
      </div>
      <div v-else-if="!wos.length" class="state">{{ search.trim() || filterStatus || filterJenis || filterTeknisi ? 'Tidak ada Work Order yang cocok dengan filter' : 'Belum ada Work Order' }}</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Nomor WO</th>
            <th>Jenis</th>
            <th>Site / Pelanggan</th>
            <th>Teknisi / Vendor</th>
            <th>Jadwal</th>
            <th>Status</th>
            <th>Foto / BA</th>
          </tr>
        </thead>
        <tbody>
          <tr v-baris v-for="w in wos" :key="w.id_wo" class="row-link" @click="goDetail(w.id_wo)">
            <td>
              <div class="mono">{{ w.nomor_wo }}</div>
              <div v-if="w.ticket" class="sub-text">↳ {{ w.ticket.nomor_tiket }}</div>
            </td>
            <td><span class="badge badge-outline">{{ w.jenis_wo }}</span></td>
            <td>
              <div class="fw-med">{{ w.site?.nama_site }}</div>
              <div class="sub-text">{{ w.site?.pelanggan?.nama_pelanggan }}</div>
            </td>
            <td>
              <div v-if="w.teknisi">{{ w.teknisi.nama_lengkap }}</div>
              <div v-else-if="w.vendor" class="sub-text">{{ w.vendor.nama_vendor }}</div>
              <div v-else class="sub-text">-</div>
            </td>
            <td>{{ fmtDate(w.tgl_jadwal) }}</td>
            <td><span :class="['badge', STATUS_STYLE[w.status_wo]]">{{ STATUS_LABEL[w.status_wo] || w.status_wo }}</span></td>
            <td>
              <div class="count-cell">
                <span title="Foto">📷 {{ w._count?.foto ?? 0 }}</span>
                <span title="Berita Acara">📄 {{ w._count?.berita_acara ?? 0 }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <BasePagination :page="page" :total-pages="meta.total_pages" @change="goPage" />
    </div>

    <!-- Modal Buat WO -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Buat Work Order Baru</h3>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="showModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Jenis WO *</label>
              <select v-model="form.jenis_wo" class="form-control">
                <option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Eksekutor *</label>
              <select v-model="form.tipe_eksekutor" class="form-control">
                <option value="Internal_NEXT1">Internal NEXT1</option>
                <option value="Vendor_Ketiga">Vendor Ketiga</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Site *</label>
            <CariPilih :model-value="form.id_site ? Number(form.id_site) : null" :cari="cariSite"
              placeholder="Cari site aktif: nama, kode, kota, pelanggan…"
              @update:model-value="(v) => (form.id_site = v ? String(v) : '')" />
          </div>
          <div class="form-group" v-if="form.tipe_eksekutor === 'Vendor_Ketiga'">
            <label>Vendor *</label>
            <select v-model="form.id_vendor_ketiga" class="form-control">
              <option value="">-- Pilih Vendor --</option>
              <option v-for="v in vendors" :key="v.id_vendor" :value="v.id_vendor">{{ v.nama_vendor }}</option>
            </select>
            <small v-if="vendorErr" style="color:#dc2626">{{ vendorErr }}</small>
          </div>
          <div class="form-group" v-if="form.tipe_eksekutor === 'Internal_NEXT1'">
            <label>Teknisi</label>
            <select v-model="form.id_teknisi_internal" class="form-control">
              <option value="">-- Pilih Teknisi --</option>
              <option v-for="t in teknisis" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Tanggal Jadwal *</label>
            <input v-model="form.tgl_jadwal" type="datetime-local" class="form-control" />
          </div>
          <div class="form-group">
            <label>Deskripsi Tugas *</label>
            <textarea v-model="form.deskripsi_tugas" rows="3" class="form-control" placeholder="Jelaskan pekerjaan yang akan dilakukan…" />
          </div>
        </div>
        <div class="modal-footer">
          <small v-if="kurang.length" class="wo-kurang">Lengkapi: {{ kurang.join(', ') }}</small>
          <button type="button" class="btn btn-secondary" @click="showModal = false">Batal</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saving || kurang.length > 0"
            :title="kurang.length ? `Lengkapi: ${kurang.join(', ')}` : undefined"
            @click="submitWo"
          >
            {{ saving ? 'Menyimpan…' : 'Buat WO' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-reset { padding: 7px 14px; background: #f1f5f9; border: 1.5px solid #e2e8f0; border-radius: 7px; font-size: 13px; cursor: pointer; color: #475569; }

.summary-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.sum-card { background: #fff; border-radius: 10px; padding: 14px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); min-width: 110px; }
.sum-num { font-size: 26px; font-weight: 700; color: #0f172a; }
.sum-label { font-size: 12px; color: #64748b; margin-top: 2px; }
/* Kelas dari status_wo: Open, Dispatch, On-Site, Selesai, Ditunda, Dibatalkan */
.sum-open .sum-num, .sum-dispatch .sum-num { color: #2563eb; }
.sum-on-site .sum-num, .sum-ditunda .sum-num { color: var(--warning); }
.sum-selesai .sum-num { color: var(--success); }
.sum-dibatalkan .sum-num { color: var(--text-muted); }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.search-input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
.search-input:focus { outline: none; border-color: #93c5fd; }
.select-filter { padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; background: #fff; cursor: pointer; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.state { padding: 50px 20px; text-align: center; color: #94a3b8; font-size: 14px; }
.state-error { color: var(--danger); }
.table { width: 100%; border-collapse: collapse; }
.table th { padding: 12px 16px; background: #f8fafc; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; text-align: left; border-bottom: 1px solid #f1f5f9; }
.table td { padding: 13px 16px; font-size: 13px; color: #1e293b; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
.row-link { cursor: pointer; transition: background 0.1s; }
.row-link:hover { background: #f8fafc; }
.mono { font-family: monospace; font-size: 13px; font-weight: 600; color: #1d4ed8; }
.fw-med { font-weight: 500; }
.sub-text { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.count-cell { display: flex; gap: 10px; font-size: 12px; color: #64748b; }

/* .badge / .badge-* dari main.css */
.badge-outline { background: transparent; border: 1px solid var(--border); color: #475569; }

/* .modal-overlay / .modal / .modal-header / .modal-footer dari main.css */
.modal-body { display: flex; flex-direction: column; gap: 14px; }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group label { font-size: 13px; font-weight: 600; color: #374151; }
.form-control { padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
.form-control:focus { outline: none; border-color: #93c5fd; }
textarea.form-control { resize: vertical; font-family: inherit; }
.wo-kurang { margin-right: auto; color: #b45309; font-size: 12.5px; }
</style>
