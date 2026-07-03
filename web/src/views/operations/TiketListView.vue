<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOperationsStore } from '@/stores/operations'
import { useMasterStore } from '@/stores/master'
import { useProyekStore } from '@/stores/proyek'

const router = useRouter()
const ops = useOperationsStore()
const master = useMasterStore()
const proyek = useProyekStore()

const page = ref(1)
const filterStatus = ref('')
const filterPrioritas = ref('')
const search = ref('')

const showModal = ref(false)
const form = ref({ id_site: 0, judul_tiket: '', deskripsi_masalah: '', prioritas: 'Medium', sumber_tiket: 'Internal', id_teknisi_pic: 0 })
const submitting = ref(false)
const formError = ref('')

const STATUS_LIST = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed']
const PRIORITAS_LIST = ['Low', 'Medium', 'High', 'Critical']
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

onMounted(async () => {
  await Promise.all([ops.fetchSummary(), ops.fetchTeknisiList(), proyek.fetchSiteList(), master.fetchLayanan()])
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value) params.status_tiket = filterStatus.value
  if (filterPrioritas.value) params.prioritas = filterPrioritas.value
  if (search.value) params.search = search.value
  ops.fetchList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

async function handleSubmit() {
  if (!form.value.id_site || !form.value.judul_tiket) {
    formError.value = 'Site dan Judul tiket wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value }
    if (!payload.id_teknisi_pic) delete payload.id_teknisi_pic
    const result = await ops.create(payload)
    showModal.value = false
    router.push(`/operations/${result.id_ticket}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat tiket' }
  finally { submitting.value = false }
}

function fmtDt(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function statusLabel(s: string) { return s.replace('_', ' ') }

// SLA badge: sisa waktu / TELAT untuk tiket aktif; ✓ untuk yang selesai
function slaInfo(t: any): { label: string; cls: string } {
  if (['Resolved', 'Closed'].includes(t.status_tiket)) {
    return t.sla_breached ? { label: 'Telat', cls: 'sla-late-done' } : { label: '✓', cls: 'sla-ok' }
  }
  if (!t.sla_due) return { label: '—', cls: 'sla-none' }
  const sisaMs = new Date(t.sla_due).getTime() - Date.now()
  if (sisaMs <= 0) {
    const jam = Math.floor(-sisaMs / 3600_000)
    return { label: `TELAT ${jam >= 1 ? jam + 'j' : '<1j'}`, cls: 'sla-late' }
  }
  const jam = Math.floor(sisaMs / 3600_000)
  const menit = Math.floor((sisaMs % 3600_000) / 60_000)
  const label = jam >= 1 ? `${jam}j ${menit}m` : `${menit}m`
  return { label, cls: sisaMs < 2 * 3600_000 ? 'sla-warning' : 'sla-safe' }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Operasional</h2>
        <p class="sub">Manajemen tiket helpdesk & troubleshoot</p>
      </div>
      <button class="btn-primary" @click="showModal = true; formError = ''">+ Buat Tiket</button>
    </div>

    <!-- Summary chips -->
    <div class="summary-row">
      <div v-for="s in ops.summary" :key="s.status" class="summary-chip"
        :style="{ borderLeftColor: STATUS_COLOR[s.status]?.color || '#94a3b8' }"
        @click="filterStatus = filterStatus === s.status ? '' : s.status; doFilter()">
        <div class="sc-count">{{ s.count }}</div>
        <div class="sc-label">{{ statusLabel(s.status) }}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input v-model="search" @keyup.enter="doFilter" placeholder="Cari tiket / site / pelanggan..." class="search-input" />
      <select v-model="filterStatus" @change="doFilter" class="filter-select">
        <option value="">Semua Status</option>
        <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
      </select>
      <select v-model="filterPrioritas" @change="doFilter" class="filter-select">
        <option value="">Semua Prioritas</option>
        <option v-for="p in PRIORITAS_LIST" :key="p" :value="p">{{ p }}</option>
      </select>
      <button class="btn-search" @click="doFilter">Cari</button>
    </div>

    <div v-if="ops.error" class="alert-error">{{ ops.error }}</div>

    <div class="table-card">
      <div v-if="ops.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>No. Tiket</th>
            <th>Judul</th>
            <th>Site / Pelanggan</th>
            <th>Prioritas</th>
            <th>SLA</th>
            <th>Status</th>
            <th>Teknisi</th>
            <th>Tgl Open</th>
            <th>ST</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!ops.list.length">
            <td colspan="9" class="empty">Tidak ada tiket</td>
          </tr>
          <tr v-for="t in ops.list" :key="t.id_ticket" class="row-link" @click="router.push(`/operations/${t.id_ticket}`)">
            <td class="fw700">{{ t.nomor_tiket }}</td>
            <td>
              <div class="judul">{{ t.judul_tiket }}</div>
              <div class="sumber">{{ t.sumber_tiket }}</div>
            </td>
            <td>
              <div class="fw600">{{ t.site?.nama_site }}</div>
              <div class="text-gray text-sm">{{ t.site?.pelanggan?.nama_pelanggan }}</div>
            </td>
            <td>
              <span class="prioritas-dot" :style="{ color: PRIORITAS_COLOR[t.prioritas] }">●</span>
              {{ t.prioritas }}
            </td>
            <td>
              <span :class="['sla-badge', slaInfo(t).cls]">{{ slaInfo(t).label }}</span>
            </td>
            <td>
              <span class="status-badge"
                :style="{ background: STATUS_COLOR[t.status_tiket]?.bg, color: STATUS_COLOR[t.status_tiket]?.color }">
                {{ statusLabel(t.status_tiket) }}
              </span>
            </td>
            <td class="text-gray">{{ t.teknisi?.nama_lengkap || '—' }}</td>
            <td class="text-gray text-sm">{{ fmtDt(t.tgl_open) }}</td>
            <td class="center">{{ t._count?.work_orders ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="ops.meta.total_pages > 1" class="pagination">
        <button v-for="p in ops.meta.total_pages" :key="p"
          :class="['page-btn', { active: p === ops.meta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="ops.meta.total">Total: {{ ops.meta.total }} tiket</div>
    </div>

    <!-- Modal Buat Tiket -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Buat Tiket Baru</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Site <span class="req">*</span></label>
            <select v-model="form.id_site">
              <option :value="0">— Pilih Site —</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">
                [{{ s.kode_site }}] {{ s.nama_site }} — {{ s.pelanggan?.nama_pelanggan }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Judul Tiket <span class="req">*</span></label>
            <input v-model="form.judul_tiket" placeholder="Link down, lambat, dst." />
          </div>
          <div class="field">
            <label>Prioritas</label>
            <select v-model="form.prioritas">
              <option v-for="p in PRIORITAS_LIST" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div class="field">
            <label>Sumber</label>
            <select v-model="form.sumber_tiket">
              <option value="Internal">Internal</option>
              <option value="Email">Email</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Telepon">Telepon</option>
              <option value="PRTG">PRTG</option>
              <option value="RCMS">RCMS</option>
            </select>
          </div>
          <div class="field full">
            <label>Assign Teknisi</label>
            <select v-model="form.id_teknisi_pic">
              <option :value="0">— Belum di-assign —</option>
              <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
            </select>
          </div>
          <div class="field full">
            <label>Deskripsi Masalah</label>
            <textarea v-model="form.deskripsi_masalah" rows="3" placeholder="Detail gejala / keluhan..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Membuat...' : 'Buat Tiket' }}
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

.summary-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.summary-chip { background: #fff; border-radius: 8px; padding: 12px 16px; border-left: 4px solid #94a3b8; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; min-width: 110px; }
.summary-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.sc-count { font-size: 22px; font-weight: 800; color: #0f172a; }
.sc-label { font-size: 11px; color: #64748b; }

.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.search-input { flex: 1; min-width: 220px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw700 { font-weight: 700; color: #1d4ed8; font-size: 13px; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.center { text-align: center; font-weight: 700; }
.judul { font-weight: 600; font-size: 14px; }
.sumber { font-size: 11px; color: #94a3b8; }
.prioritas-dot { font-size: 10px; margin-right: 4px; }
.sla-badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.sla-safe { background: #f0fdf4; color: #15803d; }
.sla-warning { background: #fefce8; color: #a16207; }
.sla-late { background: #dc2626; color: #fff; animation: slaPulse 1.2s infinite; }
.sla-late-done { background: #fef2f2; color: #dc2626; }
.sla-ok { background: #f0fdf4; color: #15803d; }
.sla-none { color: #cbd5e1; }
@keyframes slaPulse { 50% { opacity: 0.6; } }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 540px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
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
</style>
