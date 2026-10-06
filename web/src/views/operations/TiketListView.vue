<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOperationsStore } from '@/stores/operations'
import { useMasterStore } from '@/stores/master'
import { useProyekStore } from '@/stores/proyek'
import { fmtDateTime as fmtDt, statusLabel } from '@/composables/useFormat'
import BasePagination from '@/components/BasePagination.vue'

const router = useRouter()
const ops = useOperationsStore()
const master = useMasterStore()
const proyek = useProyekStore()

const page = ref(1)
const filterStatus = ref('')
const filterPrioritas = ref('')
const filterSumber = ref('')
const search = ref('')

const showModal = ref(false)
const form = ref({ id_site: 0, judul_tiket: '', deskripsi_masalah: '', prioritas: 'Medium', sumber_tiket: 'Internal', id_teknisi_pic: 0 })
const submitting = ref(false)
const formError = ref('')

const STATUS_LIST = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed']
const PRIORITAS_LIST = ['Low', 'Medium', 'High', 'Critical']
const SUMBER_LIST = ['PRTG', 'Internal', 'Email', 'WhatsApp', 'Telepon']

const STATUS_CFG: Record<string, { bg: string; color: string; border: string }> = {
  Open:             { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6' },
  In_Progress:      { bg: '#fef9c3', color: '#92400e', border: '#f59e0b' },
  Pending_Customer: { bg: '#ffedd5', color: '#9a3412', border: '#f97316' },
  Resolved:         { bg: '#dcfce7', color: '#14532d', border: '#22c55e' },
  Closed:           { bg: '#f1f5f9', color: '#475569', border: '#94a3b8' },
}

const PRIORITAS_CFG: Record<string, { bg: string; color: string }> = {
  Low:      { bg: '#f1f5f9', color: '#64748b' },
  Medium:   { bg: '#dbeafe', color: '#1d4ed8' },
  High:     { bg: '#ffedd5', color: '#c2410c' },
  Critical: { bg: '#fee2e2', color: '#b91c1c' },
}

const SUMMARY_CFG: Record<string, { icon: string; label: string; accent: string; bg: string }> = {
  Open:             { icon: '🔵', label: 'Open',       accent: '#1d4ed8', bg: 'linear-gradient(135deg,#dbeafe,#eff6ff)' },
  In_Progress:      { icon: '⚡', label: 'In Progress', accent: '#b45309', bg: 'linear-gradient(135deg,#fef9c3,#fffbeb)' },
  Pending_Customer: { icon: '⏳', label: 'Pending',    accent: '#c2410c', bg: 'linear-gradient(135deg,#ffedd5,#fff7ed)' },
  Resolved:         { icon: '✅', label: 'Resolved',   accent: '#15803d', bg: 'linear-gradient(135deg,#dcfce7,#f0fdf4)' },
  Closed:           { icon: '🔒', label: 'Closed',     accent: '#475569', bg: 'linear-gradient(135deg,#f1f5f9,#f8fafc)' },
}

onMounted(async () => {
  await Promise.all([ops.fetchSummary(), ops.fetchTeknisiList(), proyek.fetchSiteList(), master.fetchLayanan()])
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value)    params.status_tiket  = filterStatus.value
  if (filterPrioritas.value) params.prioritas     = filterPrioritas.value
  if (filterSumber.value)    params.sumber_tiket  = filterSumber.value
  if (search.value)          params.search        = search.value
  ops.fetchList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function setStatusFilter(s: string) {
  filterStatus.value = filterStatus.value === s ? '' : s
  doFilter()
}

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
    form.value = { id_site: 0, judul_tiket: '', deskripsi_masalah: '', prioritas: 'Medium', sumber_tiket: 'Internal', id_teknisi_pic: 0 }
    router.push(`/operations/${result.id_ticket}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat tiket' }
  finally { submitting.value = false }
}

function slaInfo(t: any): { label: string; cls: string } {
  if (['Resolved', 'Closed'].includes(t.status_tiket)) {
    return t.sla_breached ? { label: 'TELAT', cls: 'sla-late-done' } : { label: '✓ On Time', cls: 'sla-ok' }
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

function rowClass(t: any) {
  if (t.sumber_tiket === 'PRTG' && !['Resolved', 'Closed'].includes(t.status_tiket)) return 'row-down'
  if (['Resolved', 'Closed'].includes(t.status_tiket)) return 'row-resolved'
  if (t.prioritas === 'Critical') return 'row-critical'
  return ''
}
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2>Gangguan & Tiket</h2>
        <p class="sub">Monitor real-time · Helpdesk · NOC</p>
      </div>
      <button class="btn-new" @click="showModal = true; formError = ''">
        <span>+</span> Buat Tiket
      </button>
    </div>

    <!-- Summary tiles -->
    <div class="summary-grid">
      <div
        v-for="s in ops.summary" :key="s.status"
        class="summary-tile"
        :class="{ active: filterStatus === s.status }"
        :style="{ background: SUMMARY_CFG[s.status]?.bg, '--accent': SUMMARY_CFG[s.status]?.accent }"
        @click="setStatusFilter(s.status)"
      >
        <div class="tile-icon">{{ SUMMARY_CFG[s.status]?.icon }}</div>
        <div class="tile-count" :style="{ color: SUMMARY_CFG[s.status]?.accent }">{{ s.count }}</div>
        <div class="tile-label">{{ SUMMARY_CFG[s.status]?.label }}</div>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="search-wrap">
        <svg class="search-ico" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.8"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input v-model="search" @keyup.enter="doFilter" placeholder="Cari tiket, site, pelanggan…" class="search-inp" />
      </div>

      <div class="chip-group">
        <button
          v-for="s in STATUS_LIST" :key="s"
          class="chip"
          :class="{ 'chip-active': filterStatus === s }"
          :style="filterStatus === s ? { background: STATUS_CFG[s]?.bg, color: STATUS_CFG[s]?.color, borderColor: STATUS_CFG[s]?.border } : {}"
          @click="setStatusFilter(s)"
        >{{ statusLabel(s) }}</button>
      </div>

      <div class="right-filters">
        <select v-model="filterPrioritas" @change="doFilter" class="fsel">
          <option value="">Semua Prioritas</option>
          <option v-for="p in PRIORITAS_LIST" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterSumber" @change="doFilter" class="fsel">
          <option value="">Semua Sumber</option>
          <option v-for="src in SUMBER_LIST" :key="src" :value="src">{{ src }}</option>
        </select>
        <button v-if="filterStatus || filterPrioritas || filterSumber || search" class="btn-reset" @click="filterStatus='';filterPrioritas='';filterSumber='';search='';doFilter()">✕ Reset</button>
      </div>
    </div>

    <div v-if="ops.error" class="alert-err">{{ ops.error }}</div>

    <!-- Table -->
    <div class="table-wrap">
      <div v-if="ops.loading" class="loading-state">
        <span class="spinner"></span> Memuat tiket…
      </div>
      <table v-else>
        <thead>
          <tr>
            <th style="width:140px">No. Tiket</th>
            <th>Judul / Sumber</th>
            <th>Site &amp; Pelanggan</th>
            <th style="width:100px">Prioritas</th>
            <th style="width:110px">SLA</th>
            <th style="width:130px">Status</th>
            <th style="width:130px">Teknisi</th>
            <th style="width:115px">Tgl Open</th>
            <th style="width:50px" title="Work Orders">WO</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!ops.list.length">
            <td colspan="9" class="empty-row">
              <div class="empty-icon">📋</div>
              <div>Tidak ada tiket ditemukan</div>
            </td>
          </tr>
          <tr
            v-for="t in ops.list" :key="t.id_ticket"
            class="trow" :class="rowClass(t)"
            @click="router.push(`/operations/${t.id_ticket}`)"
          >
            <td>
              <span class="nomor">{{ t.nomor_tiket }}</span>
            </td>
            <td>
              <div class="judul">{{ t.judul_tiket }}</div>
              <span
                class="sumber-badge"
                :class="{
                  'sb-prtg': t.sumber_tiket === 'PRTG',
                  'sb-wa': t.sumber_tiket === 'WhatsApp',
                  'sb-int': t.sumber_tiket === 'Internal',
                }"
              >{{ t.sumber_tiket }}</span>
            </td>
            <td>
              <div class="site-name">{{ t.site?.nama_site || '—' }}</div>
              <div class="pelanggan">{{ t.site?.pelanggan?.nama_pelanggan }}</div>
            </td>
            <td>
              <span
                class="prio-badge"
                :class="{ 'prio-pulse': t.prioritas === 'Critical' }"
                :style="{ background: PRIORITAS_CFG[t.prioritas]?.bg, color: PRIORITAS_CFG[t.prioritas]?.color }"
              >{{ t.prioritas }}</span>
            </td>
            <td>
              <span :class="['sla-badge', slaInfo(t).cls]">{{ slaInfo(t).label }}</span>
            </td>
            <td>
              <span
                class="status-pill"
                :style="{ background: STATUS_CFG[t.status_tiket]?.bg, color: STATUS_CFG[t.status_tiket]?.color, borderColor: STATUS_CFG[t.status_tiket]?.border }"
              >{{ statusLabel(t.status_tiket) }}</span>
            </td>
            <td class="teknisi">{{ t.teknisi?.nama_lengkap || '—' }}</td>
            <td class="tgl">{{ fmtDt(t.tgl_open) }}</td>
            <td class="wo-count">{{ t._count?.work_orders ?? 0 }}</td>
          </tr>
        </tbody>
      </table>

      <div class="table-foot">
        <BasePagination :page="page" :total-pages="ops.meta.total_pages" @change="goPage" />
        <span v-if="ops.meta.total" class="total-label">{{ ops.meta.total }} tiket</span>
      </div>
    </div>

    <!-- Modal Buat Tiket -->
    <div v-if="showModal" class="overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-hdr">
          <h3>Buat Tiket Baru</h3>
          <button class="close-btn" @click="showModal = false">✕</button>
        </div>
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
            <input v-model="form.judul_tiket" placeholder="Link down, lambat, gangguan..." />
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
            </select>
          </div>
          <div class="field full">
            <label>Assign Teknisi</label>
            <select v-model="form.id_teknisi_pic">
              <option :value="0">— Belum di-assign —</option>
              <option v-for="tek in ops.teknisiList" :key="tek.id_karyawan" :value="tek.id_karyawan">{{ tek.nama_lengkap }}</option>
            </select>
          </div>
          <div class="field full">
            <label>Deskripsi Masalah</label>
            <textarea v-model="form.deskripsi_masalah" rows="3" placeholder="Detail gejala / keluhan pelanggan..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-err">{{ formError }}</p>
        <div class="modal-foot">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Membuat…' : 'Buat Tiket' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ─── Page ─────────────────────────────────────────────────── */
.page { padding: 24px 28px; max-width: 1300px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 2px; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
.sub { margin: 0; font-size: 12.5px; color: #64748b; font-weight: 500; }

.btn-new {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #1e40af, #2563eb);
  color: #fff; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px #3b82f640;
  transition: transform .12s, box-shadow .12s;
}
.btn-new:hover { transform: translateY(-1px); box-shadow: 0 4px 16px #3b82f650; }
.btn-new span { font-size: 18px; line-height: 1; }

/* ─── Summary tiles ─────────────────────────────────────────── */
.summary-grid { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.summary-tile {
  flex: 1; min-width: 120px; max-width: 190px;
  border-radius: 14px; padding: 14px 16px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform .15s, border-color .15s, box-shadow .15s;
  position: relative; overflow: hidden;
}
.summary-tile::before {
  content: ''; position: absolute; inset: 0;
  border-radius: 12px;
  border: 2px solid var(--accent, #94a3b8);
  opacity: 0; transition: opacity .15s;
}
.summary-tile:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.10); }
.summary-tile.active::before { opacity: 1; }
.summary-tile.active { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }

.tile-icon { font-size: 18px; margin-bottom: 6px; }
.tile-count { font-size: 32px; font-weight: 900; line-height: 1; letter-spacing: -1px; }
.tile-label { font-size: 11.5px; font-weight: 600; color: #475569; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.4px; }

/* ─── Filter bar ─────────────────────────────────────────────── */
.filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }

.search-wrap { position: relative; flex: 1; min-width: 220px; max-width: 320px; }
.search-ico { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: #94a3b8; }
.search-inp { width: 100%; padding: 9px 12px 9px 34px; border: 1.5px solid #e2e8f0; border-radius: 9px; font-size: 14px; outline: none; box-sizing: border-box; background: #fff; }
.search-inp:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px #3b82f620; }

.chip-group { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { padding: 6px 13px; border: 1.5px solid #e2e8f0; border-radius: 20px; font-size: 12.5px; font-weight: 600; cursor: pointer; background: #f8fafc; color: #475569; transition: all .12s; white-space: nowrap; }
.chip:hover { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.chip-active { font-weight: 700; }

.right-filters { display: flex; gap: 8px; align-items: center; margin-left: auto; }
.fsel { padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; background: #fff; cursor: pointer; }
.fsel:focus { border-color: #3b82f6; }
.btn-reset { padding: 7px 12px; background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn-reset:hover { background: #fee2e2; }

/* ─── Table ─────────────────────────────────────────────────── */
.alert-err { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-wrap { background: #fff; border-radius: 14px; box-shadow: 0 1px 6px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #e2e8f0; }

.loading-state { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 48px; color: #94a3b8; font-size: 14px; }
.spinner { width: 18px; height: 18px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
th { padding: 11px 13px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.6px; white-space: nowrap; }

.trow { cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background .12s; }
.trow:last-child { border-bottom: none; }
.trow:hover td { background: #f8fafc; }

/* Row variants */
.row-down td { background: #fff5f5; }
.row-down td:first-child { border-left: 4px solid #ef4444; }
.row-down:hover td { background: #fee2e2; }

.row-resolved td { background: #f0fdf4; }
.row-resolved td:first-child { border-left: 4px solid #22c55e; }
.row-resolved:hover td { background: #dcfce7; }

.row-critical td:first-child { border-left: 4px solid #f97316; }

td { padding: 11px 13px; font-size: 13.5px; color: #0f172a; vertical-align: middle; }

.nomor { font-weight: 700; color: #1e40af; font-size: 12.5px; font-family: monospace; }

.judul { font-weight: 600; font-size: 13.5px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; }

.sumber-badge { display: inline-block; margin-top: 4px; padding: 1px 7px; border-radius: 4px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.3px; }
.sb-prtg  { background: #fef2f2; color: #b91c1c; }
.sb-wa    { background: #dcfce7; color: #15803d; }
.sb-int   { background: #f1f5f9; color: #475569; }

.site-name { font-weight: 600; font-size: 13px; }
.pelanggan { font-size: 11.5px; color: #64748b; margin-top: 1px; }

.prio-badge { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 11.5px; font-weight: 700; }
.prio-pulse { animation: prioPulse 1.4s ease-in-out infinite; }
@keyframes prioPulse { 0%,100% { box-shadow: 0 0 0 0 #ef444440; } 50% { box-shadow: 0 0 0 5px transparent; } }

.status-pill { display: inline-block; padding: 4px 11px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1.5px solid; white-space: nowrap; }

.sla-badge { display: inline-block; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.sla-safe      { background: #f0fdf4; color: #15803d; }
.sla-warning   { background: #fefce8; color: #a16207; }
.sla-late      { background: #dc2626; color: #fff; animation: slaPulse 1.2s infinite; }
.sla-late-done { background: #fef2f2; color: #dc2626; }
.sla-ok        { background: #dcfce7; color: #15803d; }
.sla-none      { color: #cbd5e1; }
@keyframes slaPulse { 50% { opacity: 0.6; } }
@media (prefers-reduced-motion: reduce) { .sla-late, .prio-pulse { animation: none; } }

.teknisi { font-size: 12.5px; color: #475569; }
.tgl { font-size: 12px; color: #64748b; white-space: nowrap; }
.wo-count { text-align: center; font-weight: 700; font-size: 13px; color: #475569; }

.empty-row { text-align: center; padding: 56px 20px; color: #94a3b8; }
.empty-icon { font-size: 36px; margin-bottom: 8px; }

.table-foot { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-top: 1px solid #f1f5f9; }
.total-label { font-size: 12px; color: #94a3b8; }

/* ─── Modal ─────────────────────────────────────────────────── */
.overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; backdrop-filter: blur(2px); }
.modal { background: #fff; border-radius: 16px; width: 560px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 64px rgba(0,0,0,0.25); }

.modal-hdr { display: flex; justify-content: space-between; align-items: center; padding: 22px 28px 0; }
.modal-hdr h3 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
.close-btn { background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.close-btn:hover { background: #f1f5f9; color: #475569; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 20px 28px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 12.5px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.4px; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; transition: border-color .12s; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px #3b82f615; }

.form-err { margin: 0 28px 4px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 9px 13px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 28px 22px; border-top: 1px solid #f1f5f9; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-cancel:hover { background: #e2e8f0; }
.btn-submit { padding: 9px 24px; background: linear-gradient(135deg, #1e40af, #2563eb); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px #3b82f640; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-submit:hover:not(:disabled) { background: linear-gradient(135deg, #1e3a8a, #1d4ed8); }
</style>
