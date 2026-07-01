<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

const router = useRouter()

const loading    = ref(false)
const wos        = ref<any[]>([])
const summary    = ref<{ status: string; count: number }[]>([])
const teknisis   = ref<any[]>([])
const search     = ref('')
const filterStatus  = ref('')
const filterJenis   = ref('')
const filterTeknisi = ref('')
const page          = ref(1)
const meta          = ref({ total: 0, total_pages: 1 })

const showModal  = ref(false)
const saving     = ref(false)
const sites      = ref<any[]>([])
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

const STATUS_STYLE: Record<string, string> = {
  Open:       'badge-blue',
  Dispatch:   'badge-blue',
  'On-Site':  'badge-yellow',
  Selesai:    'badge-green',
  Ditunda:    'badge-yellow',
  Dibatalkan: 'badge-gray',
}
const STATUS_LABEL: Record<string, string> = {
  Open: 'Open', Dispatch: 'Dispatch', 'On-Site': 'On-Site',
  Selesai: 'Selesai', Ditunda: 'Ditunda', Dibatalkan: 'Dibatalkan',
}

async function fetchSummary() {
  try {
    const { data } = await api.get('/public-wo/status-summary')
    summary.value = data.data
  } catch {}
}

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, limit: 20 }
    if (search.value)        params.search     = search.value
    if (filterStatus.value)  params.status_wo  = filterStatus.value
    if (filterJenis.value)   params.jenis_wo   = filterJenis.value
    if (filterTeknisi.value) params.id_teknisi = filterTeknisi.value
    const { data } = await api.get('/public-wo', { params })
    wos.value  = data.data
    meta.value = data.meta
  } finally {
    loading.value = false
  }
}

async function fetchDropdowns() {
  const [t, s] = await Promise.all([
    api.get('/public-wo/teknisi'),
    api.get('/public-wo/sites'),
  ])
  teknisis.value = t.data.data
  sites.value    = s.data.data
}

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
  if (!form.value.id_site || !form.value.tgl_jadwal || !form.value.deskripsi_tugas) return
  saving.value = true
  try {
    const payload: any = {
      jenis_wo: form.value.jenis_wo,
      id_site: Number(form.value.id_site),
      tipe_eksekutor: form.value.tipe_eksekutor,
      tgl_jadwal: form.value.tgl_jadwal,
      deskripsi_tugas: form.value.deskripsi_tugas,
    }
    if (form.value.id_teknisi_internal) payload.id_teknisi_internal = Number(form.value.id_teknisi_internal)
    const { data } = await api.post('/public-wo', payload)
    showModal.value = false
    fetchSummary()
    fetchList()
    router.push(`/public-wo/${data.data.id_wo}`)
  } catch (e: any) {
    alert(e?.response?.data?.message || 'Gagal membuat WO')
  } finally {
    saving.value = false
  }
}

function fmtDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const summaryTotal = computed(() => summary.value.reduce((a, b) => a + b.count, 0))

onMounted(() => { fetchSummary(); fetchList(); fetchDropdowns() })
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Work Order</h2>
        <p class="sub">Manajemen pekerjaan lapangan & teknisi</p>
      </div>
      <button class="btn-primary" @click="openModal">+ Buat WO</button>
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
      </select>
      <select v-model="filterJenis" class="select-filter">
        <option value="">Semua Jenis</option>
        <option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option>
      </select>
      <select v-model="filterTeknisi" class="select-filter">
        <option value="">Semua Teknisi</option>
        <option v-for="t in teknisis" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
      </select>
      <button class="btn-reset" @click="resetFilter">Reset</button>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="state">Memuat data…</div>
      <div v-else-if="!wos.length" class="state">Tidak ada Work Order ditemukan</div>
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
          <tr v-for="w in wos" :key="w.id_wo" class="row-link" @click="goDetail(w.id_wo)">
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
            <td class="count-cell">
              <span title="Foto">📷 {{ w._count?.foto ?? 0 }}</span>
              <span title="Berita Acara">📄 {{ w._count?.berita_acara ?? 0 }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="meta.total_pages > 1" class="pagination">
        <button :disabled="page === 1" @click="page--; fetchList()">‹ Prev</button>
        <span>Hal {{ page }} / {{ meta.total_pages }} ({{ meta.total }} WO)</span>
        <button :disabled="page >= meta.total_pages" @click="page++; fetchList()">Next ›</button>
      </div>
    </div>

    <!-- Modal Buat WO -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Buat Work Order Baru</h3>
          <button class="btn-close" @click="showModal = false">✕</button>
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
            <select v-model="form.id_site" class="form-control">
              <option value="">-- Pilih Site --</option>
              <option v-for="s in sites" :key="s.id_site" :value="s.id_site">
                {{ s.kode_site }} — {{ s.nama_site }} ({{ s.pelanggan?.nama_pelanggan }})
              </option>
            </select>
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
          <button class="btn-secondary" @click="showModal = false">Batal</button>
          <button
            class="btn-primary"
            :disabled="saving || !form.id_site || !form.tgl_jadwal || !form.deskripsi_tugas"
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
.btn-primary { padding: 8px 18px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary:hover:not(:disabled) { background: #1e40af; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { padding: 8px 16px; background: #f1f5f9; color: #374151; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-reset { padding: 7px 14px; background: #f1f5f9; border: 1.5px solid #e2e8f0; border-radius: 7px; font-size: 13px; cursor: pointer; color: #475569; }

.summary-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.sum-card { background: #fff; border-radius: 10px; padding: 14px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); min-width: 110px; }
.sum-num { font-size: 26px; font-weight: 700; color: #0f172a; }
.sum-label { font-size: 12px; color: #64748b; margin-top: 2px; }
.sum-open .sum-num { color: #2563eb; }
.sum-in-progress .sum-num { color: #d97706; }
.sum-completed .sum-num { color: #16a34a; }
.sum-cancelled .sum-num { color: #94a3b8; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.search-input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
.search-input:focus { outline: none; border-color: #93c5fd; }
.select-filter { padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; background: #fff; cursor: pointer; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.state { padding: 50px 20px; text-align: center; color: #94a3b8; font-size: 14px; }
.table { width: 100%; border-collapse: collapse; }
.table th { padding: 12px 16px; background: #f8fafc; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; text-align: left; border-bottom: 1px solid #f1f5f9; }
.table td { padding: 13px 16px; font-size: 13px; color: #1e293b; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
.row-link { cursor: pointer; transition: background 0.1s; }
.row-link:hover { background: #f8fafc; }
.mono { font-family: monospace; font-size: 13px; font-weight: 600; color: #1d4ed8; }
.fw-med { font-weight: 500; }
.sub-text { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.count-cell { display: flex; gap: 10px; font-size: 12px; color: #64748b; }

.badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.badge-blue   { background: #eff6ff; color: #2563eb; }
.badge-yellow { background: #fffbeb; color: #d97706; }
.badge-green  { background: #f0fdf4; color: #16a34a; }
.badge-gray   { background: #f1f5f9; color: #64748b; }
.badge-outline { background: transparent; border: 1px solid #e2e8f0; color: #475569; }

.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 14px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #64748b; }
.pagination button { padding: 6px 14px; border: 1.5px solid #e2e8f0; border-radius: 7px; background: #fff; cursor: pointer; font-size: 13px; }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; width: 560px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,0.18); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px 0; }
.modal-header h3 { margin: 0; font-size: 17px; color: #0f172a; }
.btn-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; padding: 4px 8px; border-radius: 6px; }
.btn-close:hover { background: #f1f5f9; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid #f1f5f9; }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group label { font-size: 13px; font-weight: 600; color: #374151; }
.form-control { padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
.form-control:focus { outline: none; border-color: #93c5fd; }
textarea.form-control { resize: vertical; font-family: inherit; }
</style>
