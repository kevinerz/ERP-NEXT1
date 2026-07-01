<template>
  <div class="sim-page">

    <!-- KPI strip -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-val">{{ simCards.length }}</div>
        <div class="kpi-label">Total Link Internet</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">{{ simCards.filter(s => s.status_link === 'Aktif').length }}</div>
        <div class="kpi-label">Link Aktif</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-val">{{ fmtRp(meta.total_nominal) }}</div>
        <div class="kpi-label">Total Topup</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">{{ meta.total }}</div>
        <div class="kpi-label">Jumlah Transaksi</div>
      </div>
    </div>

    <div class="page-body">
      <!-- Kiri: daftar sumber internet / SIM -->
      <div class="card sim-list-card">
        <div class="card-header">
          <span class="card-title">Sumber Internet</span>
          <input v-model="simSearch" class="search-sm" placeholder="Cari…" @input="fetchSimCards" />
        </div>

        <div class="sim-list">
          <div
            v-for="sim in simCards" :key="sim.id_sumber"
            class="sim-item"
            :class="{ selected: selectedSim?.id_sumber === sim.id_sumber }"
            @click="selectSim(sim)"
          >
            <div class="sim-icon">📡</div>
            <div class="sim-info">
              <div class="sim-name">{{ sim.vendor?.nama_vendor }}</div>
              <div class="sim-sub">{{ sim.site?.nama_site }}</div>
              <div class="sim-sub">{{ sim.site?.pelanggan?.nama_pelanggan }} · {{ sim.peruntukan_link }}</div>
              <div class="sim-sub">{{ sim.nomor_pelanggan_isp || '—' }}</div>
            </div>
            <div class="sim-meta">
              <div class="sim-badge" :class="sim.status_link === 'Aktif' ? 'green' : 'gray'">
                {{ sim.status_link }}
              </div>
              <div class="sim-count">{{ sim._count?.topup || 0 }}x topup</div>
            </div>
          </div>
          <div v-if="simCards.length === 0" class="empty-state">Tidak ada data sumber internet</div>
        </div>
      </div>

      <!-- Kanan: history + tambah -->
      <div class="right-panel">
        <!-- Filter + Tambah -->
        <div class="card filter-card">
          <div class="filter-row">
            <select v-model="filterJenis" @change="fetchTopup">
              <option value="">Semua Jenis</option>
              <option v-for="j in JENIS_TOPUP" :key="j" :value="j">{{ j }}</option>
            </select>
            <input v-model="filterDari" type="date" @change="fetchTopup" />
            <span class="filter-sep">s/d</span>
            <input v-model="filterSampai" type="date" @change="fetchTopup" />
            <button class="btn-reset" @click="resetFilter">Reset</button>
            <button class="btn-primary" @click="openModal">+ Tambah Topup</button>
          </div>
        </div>

        <!-- History table -->
        <div class="card table-card">
          <div class="card-header">
            <span class="card-title">
              History Topup
              <span v-if="selectedSim" class="card-sub"> — {{ selectedSim.vendor?.nama_vendor }} ({{ selectedSim.site?.nama_site }})</span>
            </span>
            <span class="total-badge">Total: {{ fmtRp(meta.total_nominal) }}</span>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Site</th>
                  <th>Operator/Vendor</th>
                  <th>No. Pelanggan</th>
                  <th>Jenis</th>
                  <th>Nominal</th>
                  <th>Keterangan</th>
                  <th>Oleh</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in topups" :key="t.id_topup">
                  <td class="nowrap">{{ fmtDate(t.tgl_topup) }}</td>
                  <td>
                    <div class="cell-main">{{ t.site?.nama_site }}</div>
                    <div class="cell-sub">{{ t.site?.pelanggan?.nama_pelanggan }}</div>
                  </td>
                  <td>{{ t.sumber?.vendor?.nama_vendor || '—' }}</td>
                  <td class="cell-sub">{{ t.sumber?.nomor_pelanggan_isp || '—' }}</td>
                  <td><span class="jenis-chip" :class="jenisClass(t.jenis_topup)">{{ t.jenis_topup }}</span></td>
                  <td class="nominal">{{ fmtRp(t.nominal) }}</td>
                  <td class="ket">{{ t.keterangan || '—' }}</td>
                  <td>{{ t.user?.karyawan?.nama_lengkap || '—' }}</td>
                  <td><button class="btn-hapus-sm" @click="deleteTopup(t.id_topup)">Hapus</button></td>
                </tr>
                <tr v-if="topups.length === 0">
                  <td colspan="9" class="empty-cell">Belum ada data topup</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="meta.total_pages > 1" class="pagination">
            <button :disabled="page === 1" @click="changePage(page - 1)">‹</button>
            <span>{{ page }} / {{ meta.total_pages }}</span>
            <button :disabled="page === meta.total_pages" @click="changePage(page + 1)">›</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Topup -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Tambah Topup SIM</h3>
            <button class="modal-close" @click="showModal = false">✕</button>
          </div>

          <div class="modal-body">
            <div class="form-row">
              <label>Sumber Internet / SIM *</label>
              <select v-model="form.id_sumber">
                <option value="">Pilih sumber internet</option>
                <option v-for="s in simCards" :key="s.id_sumber" :value="s.id_sumber">
                  {{ s.vendor?.nama_vendor }} — {{ s.site?.nama_site }}
                  {{ s.nomor_pelanggan_isp ? '(' + s.nomor_pelanggan_isp + ')' : '' }}
                </option>
              </select>
            </div>
            <div class="form-row">
              <label>Tanggal Topup *</label>
              <input v-model="form.tgl_topup" type="date" />
            </div>
            <div class="form-row">
              <label>Jenis Topup *</label>
              <select v-model="form.jenis_topup">
                <option value="">Pilih jenis</option>
                <option v-for="j in JENIS_TOPUP" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="form-row">
              <label>Nominal (Rp) *</label>
              <input v-model.number="form.nominal" type="number" min="0" step="1000" placeholder="50000" />
            </div>
            <div class="form-row">
              <label>Keterangan</label>
              <input v-model="form.keterangan" type="text" placeholder="Opsional" />
            </div>
            <p v-if="formError" class="form-error">{{ formError }}</p>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="showModal = false">Batal</button>
            <button class="btn-primary" :disabled="submitting" @click="submitTopup">
              {{ submitting ? 'Menyimpan…' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const JENIS_TOPUP = ['Data', 'Pulsa', 'Paket_Bulanan', 'Aktivasi', 'Lainnya']

const simCards    = ref<any[]>([])
const topups      = ref<any[]>([])
const meta        = ref({ total: 0, total_pages: 1, total_nominal: 0 })
const page        = ref(1)
const selectedSim = ref<any>(null)
const simSearch   = ref('')
const filterJenis  = ref('')
const filterDari   = ref('')
const filterSampai = ref('')

const showModal  = ref(false)
const submitting = ref(false)
const formError  = ref('')
const form = ref({ id_sumber: '' as number | '', jenis_topup: '', nominal: 0, tgl_topup: new Date().toISOString().slice(0, 10), keterangan: '' })

async function fetchSimCards() {
  try {
    const r = await api.get('/assets/sim-cards', { params: { search: simSearch.value || undefined } })
    simCards.value = r.data.data || []
  } catch {}
}

async function fetchTopup() {
  try {
    const params: any = { page: page.value, limit: 25 }
    if (selectedSim.value) params.id_sumber = selectedSim.value.id_sumber
    if (filterJenis.value) params.jenis_topup = filterJenis.value
    if (filterDari.value) params.tgl_dari = filterDari.value
    if (filterSampai.value) params.tgl_sampai = filterSampai.value
    const r = await api.get('/assets/sim-topup', { params })
    topups.value = r.data.data || []
    meta.value = r.data.meta || meta.value
  } catch {}
}

function selectSim(sim: any) {
  selectedSim.value = selectedSim.value?.id_sumber === sim.id_sumber ? null : sim
  page.value = 1
  fetchTopup()
}

function resetFilter() {
  filterJenis.value = ''
  filterDari.value = ''
  filterSampai.value = ''
  selectedSim.value = null
  page.value = 1
  fetchTopup()
}

function changePage(p: number) { page.value = p; fetchTopup() }

function openModal() {
  form.value = {
    id_sumber: selectedSim.value?.id_sumber || '',
    jenis_topup: '', nominal: 0,
    tgl_topup: new Date().toISOString().slice(0, 10),
    keterangan: '',
  }
  formError.value = ''
  showModal.value = true
}

async function submitTopup() {
  formError.value = ''
  if (!form.value.id_sumber) return (formError.value = 'Pilih sumber internet')
  if (!form.value.jenis_topup) return (formError.value = 'Pilih jenis topup')
  if (!form.value.nominal || form.value.nominal <= 0) return (formError.value = 'Nominal harus > 0')
  submitting.value = true
  try {
    await api.post('/assets/sim-topup', {
      id_sumber: Number(form.value.id_sumber),
      jenis_topup: form.value.jenis_topup,
      nominal: form.value.nominal,
      tgl_topup: form.value.tgl_topup,
      keterangan: form.value.keterangan || undefined,
    })
    showModal.value = false
    await Promise.all([fetchTopup(), fetchSimCards()])
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Gagal menyimpan'
  } finally { submitting.value = false }
}

async function deleteTopup(id_topup: number) {
  if (!confirm('Hapus catatan topup ini?')) return
  try {
    await api.delete('/assets/sim-topup/' + id_topup)
    await fetchTopup()
  } catch (e: any) {
    alert(e?.response?.data?.message ?? 'Gagal menghapus topup')
  }
}

function fmtRp(v: any) { return 'Rp ' + Number(v).toLocaleString('id-ID') }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }
function jenisClass(j: string) {
  if (j === 'Data' || j === 'Paket_Bulanan') return 'blue'
  if (j === 'Pulsa') return 'green'
  if (j === 'Aktivasi') return 'purple'
  return 'gray'
}

onMounted(() => Promise.all([fetchSimCards(), fetchTopup()]))
</script>

<style scoped>
.sim-page { display: flex; flex-direction: column; gap: 16px; }

.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.kpi-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; }
.kpi-card.blue { background: linear-gradient(135deg,#1e40af,#3b82f6); color:#fff; border:none; }
.kpi-card.blue .kpi-label { color: rgba(255,255,255,.8); }
.kpi-val { font-size: 22px; font-weight: 700; }
.kpi-label { font-size: 12px; color: #6b7280; margin-top: 2px; }

.page-body { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }

.sim-list-card { display: flex; flex-direction: column; }
.sim-list { max-height: 600px; overflow-y: auto; margin-top: 8px; }
.sim-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background .12s; border: 1px solid transparent; }
.sim-item:hover { background: #f3f4f6; }
.sim-item.selected { background: #eff6ff; border-color: #bfdbfe; }
.sim-icon { font-size: 20px; flex-shrink: 0; padding-top: 2px; }
.sim-info { flex: 1; min-width: 0; }
.sim-name { font-size: 13px; font-weight: 600; }
.sim-sub { font-size: 11px; color: #6b7280; }
.sim-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.sim-badge { font-size: 10px; padding: 2px 7px; border-radius: 10px; white-space: nowrap; }
.sim-badge.green { background: #dcfce7; color: #166534; }
.sim-badge.gray  { background: #f3f4f6; color: #374151; }
.sim-count { font-size: 10px; color: #94a3b8; }

.right-panel { display: flex; flex-direction: column; gap: 14px; }
.filter-card { padding: 12px 16px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-row select, .filter-row input[type="date"] { padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: #fff; }
.filter-sep { font-size: 12px; color: #6b7280; }
.btn-reset { background: none; border: 1px solid #d1d5db; border-radius: 6px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
.btn-reset:hover { background: #f3f4f6; }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 10px 12px; background: #f8fafc; color: #475569; font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fafafa; }
.cell-main { font-weight: 500; }
.cell-sub { font-size: 11px; color: #94a3b8; }
.nowrap { white-space: nowrap; }
.nominal { font-weight: 600; color: #1d4ed8; }
.ket { color: #6b7280; max-width: 130px; }
.empty-cell { text-align: center; color: #94a3b8; padding: 32px; }

.jenis-chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.jenis-chip.blue   { background: #dbeafe; color: #1e40af; }
.jenis-chip.green  { background: #dcfce7; color: #166534; }
.jenis-chip.purple { background: #ede9fe; color: #5b21b6; }
.jenis-chip.gray   { background: #f3f4f6; color: #374151; }
.total-badge { font-size: 13px; font-weight: 700; color: #1d4ed8; }
.btn-hapus-sm { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-hapus-sm:hover { background: #fee2e2; }

.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px; }
.pagination button { padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; }
.pagination button:disabled { opacity: .4; cursor: not-allowed; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-title { font-size: 14px; font-weight: 600; }
.card-sub { color: #6b7280; font-weight: 400; }
.search-sm { padding: 5px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; width: 130px; }
.empty-state { text-align: center; color: #94a3b8; padding: 24px; font-size: 13px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: #fff; border-radius: 12px; width: 440px; box-shadow: 0 20px 60px rgba(0,0,0,.2); overflow: hidden; }
.modal-header { padding: 18px 20px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; }
.modal-header h3 { margin: 0; font-size: 15px; }
.modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: #6b7280; }
.modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; flex-direction: column; gap: 4px; }
.form-row label { font-size: 12px; font-weight: 500; color: #6b7280; }
.form-row input, .form-row select { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
.form-row input:focus, .form-row select:focus { outline: none; border-color: #3b82f6; }
.form-error { color: #dc2626; font-size: 12px; margin: 0; }
.modal-footer { padding: 14px 20px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid #f1f5f9; }
.btn-cancel { background: none; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
.btn-primary { background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 8px 20px; font-size: 13px; font-weight: 500; cursor: pointer; }
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

@media (max-width: 768px) { .page-body { grid-template-columns: 1fr; } .kpi-row { grid-template-columns: 1fr 1fr; } }
</style>
