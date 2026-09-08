<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import portalApi from '@/services/portalApi'

// ── Data ────────────────────────────────────────────────────
const tickets   = ref<any[]>([])
const sites     = ref<any[]>([])
const loading   = ref(true)
const activeTab = ref<'all' | 'open' | 'progress' | 'done'>('all')
const detail    = ref<any>(null)

// ── Buat Tiket ───────────────────────────────────────────────
const showForm  = ref(false)
const saving    = ref(false)
const formErr   = ref('')
const form = ref({ id_site: 0, judul_tiket: '', deskripsi_masalah: '' })

// ── Init ─────────────────────────────────────────────────────
onMounted(async () => {
  const [t, s] = await Promise.all([
    portalApi.get('/portal/tickets', { params: { limit: 100 } }),
    portalApi.get('/portal/sites'),
  ])
  tickets.value = t.data.data ?? []
  sites.value   = s.data.data ?? []
  loading.value = false
})

// ── Filtered list ────────────────────────────────────────────
const filtered = computed(() => {
  if (activeTab.value === 'all')      return tickets.value
  if (activeTab.value === 'open')     return tickets.value.filter(t => t.status === 'Open')
  if (activeTab.value === 'progress') return tickets.value.filter(t => t.status === 'In Progress')
  if (activeTab.value === 'done')     return tickets.value.filter(t => ['Resolved','Closed'].includes(t.status))
  return tickets.value
})

const kpi = computed(() => ({
  total:    tickets.value.length,
  open:     tickets.value.filter(t => t.status === 'Open').length,
  progress: tickets.value.filter(t => t.status === 'In Progress').length,
  done:     tickets.value.filter(t => ['Resolved','Closed'].includes(t.status)).length,
}))

// ── Detail ───────────────────────────────────────────────────
async function openDetail(t: any) {
  const r = await portalApi.get(`/portal/tickets/${t.id_ticket}`)
  detail.value = r.data.data
}

// ── Submit tiket ─────────────────────────────────────────────
async function submitTicket() {
  if (!form.value.id_site || !form.value.judul_tiket.trim()) {
    formErr.value = 'Site dan judul tiket wajib diisi'; return
  }
  saving.value = true; formErr.value = ''
  try {
    const r = await portalApi.post('/portal/tickets', {
      id_site:          form.value.id_site,
      judul_tiket:      form.value.judul_tiket.trim(),
      deskripsi_masalah: form.value.deskripsi_masalah.trim() || undefined,
    })
    // Reload list
    const fresh = await portalApi.get('/portal/tickets', { params: { limit: 100 } })
    tickets.value = fresh.data.data ?? []
    showForm.value = false
    form.value = { id_site: 0, judul_tiket: '', deskripsi_masalah: '' }
  } catch (e: any) {
    formErr.value = e.response?.data?.message || 'Gagal membuat tiket'
  } finally { saving.value = false }
}

// ── Helpers ──────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusClass(s: string) {
  if (s === 'Open')              return 'badge-open'
  if (s === 'In Progress')       return 'badge-progress'
  if (s === 'Resolved')          return 'badge-resolved'
  if (s === 'Closed')            return 'badge-closed'
  return 'badge-open'
}

function prioritasClass(p: string) {
  if (p === 'High' || p === 'Critical') return 'pri-high'
  if (p === 'Low')                      return 'pri-low'
  return 'pri-med'
}
</script>

<template>
  <div class="pg">
    <!-- Header -->
    <div class="pg-head">
      <div>
        <div class="eyebrow">TIKET SUPPORT</div>
        <h1 class="pg-title">Riwayat &amp; Permintaan Bantuan</h1>
      </div>
      <button class="btn-create" @click="showForm = true">+ Buat Tiket</button>
    </div>

    <!-- KPI strip -->
    <div class="kpi-strip" v-if="!loading">
      <div class="kpi">
        <span class="kpi-n">{{ kpi.total }}</span>
        <span class="kpi-l">Total Tiket</span>
      </div>
      <div class="kpi-div" />
      <div class="kpi">
        <span class="kpi-n kpi-open">{{ kpi.open }}</span>
        <span class="kpi-l">Open</span>
      </div>
      <div class="kpi-div" />
      <div class="kpi">
        <span class="kpi-n kpi-prog">{{ kpi.progress }}</span>
        <span class="kpi-l">Sedang Diproses</span>
      </div>
      <div class="kpi-div" />
      <div class="kpi">
        <span class="kpi-n kpi-done">{{ kpi.done }}</span>
        <span class="kpi-l">Selesai</span>
      </div>
    </div>

    <!-- Tab filter -->
    <div class="tabs">
      <button :class="['tab', activeTab === 'all'      && 'tab-active']" @click="activeTab = 'all'">Semua</button>
      <button :class="['tab', activeTab === 'open'     && 'tab-active']" @click="activeTab = 'open'">Open</button>
      <button :class="['tab', activeTab === 'progress' && 'tab-active']" @click="activeTab = 'progress'">Diproses</button>
      <button :class="['tab', activeTab === 'done'     && 'tab-active']" @click="activeTab = 'done'">Selesai</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="empty-state">Memuat data tiket…</div>

    <!-- Table -->
    <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>No. Tiket</th>
            <th>Site</th>
            <th>Judul</th>
            <th>Status</th>
            <th>Prioritas</th>
            <th>Dibuat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filtered.length">
            <td colspan="6" class="empty-row">Tidak ada tiket pada kategori ini</td>
          </tr>
          <tr
            v-for="t in filtered" :key="t.id_ticket"
            class="tbl-row"
            @click="openDetail(t)"
          >
            <td class="mono">{{ t.nomor_tiket }}</td>
            <td class="site-cell">{{ t.site?.nama_site ?? '—' }}</td>
            <td class="judul-cell">{{ t.judul_tiket }}</td>
            <td><span :class="['badge', statusClass(t.status)]">{{ t.status }}</span></td>
            <td><span :class="['pri', prioritasClass(t.prioritas ?? 'Medium')]">{{ t.prioritas ?? 'Medium' }}</span></td>
            <td class="date-cell">{{ fmtDate(t.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Modal Detail ─────────────────────────────── -->
    <div v-if="detail" class="overlay" @click.self="detail = null">
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="eyebrow">{{ detail.nomor_tiket }}</div>
            <div class="modal-title">{{ detail.judul_tiket }}</div>
          </div>
          <button class="modal-close" @click="detail = null">✕</button>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Status</span>
            <span :class="['badge', statusClass(detail.status)]">{{ detail.status }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Prioritas</span>
            <span :class="['pri', prioritasClass(detail.prioritas ?? 'Medium')]">{{ detail.prioritas ?? 'Medium' }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Site</span>
            <span class="meta-val">{{ detail.site?.nama_site ?? '—' }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Dibuat</span>
            <span class="meta-val">{{ fmtDate(detail.created_at) }}</span>
          </div>
        </div>

        <div v-if="detail.deskripsi_masalah" class="desc-block">
          <div class="meta-label" style="margin-bottom:6px">Deskripsi Masalah</div>
          <p class="desc-text">{{ detail.deskripsi_masalah }}</p>
        </div>

        <!-- Log riwayat -->
        <div v-if="detail.logs?.length" class="log-section">
          <div class="log-title">Riwayat Tiket</div>
          <div class="log-list">
            <div v-for="log in detail.logs" :key="log.id_log" class="log-item">
              <div class="log-dot" />
              <div class="log-body">
                <span class="log-status">{{ log.status_ke }}</span>
                <span v-if="log.catatan" class="log-note"> — {{ log.catatan }}</span>
                <div class="log-time">{{ fmtDate(log.created_at) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal Buat Tiket ─────────────────────────── -->
    <div v-if="showForm" class="overlay" @click.self="showForm = false; formErr = ''">
      <div class="modal modal-sm">
        <div class="modal-head">
          <div>
            <div class="eyebrow">PERMINTAAN BARU</div>
            <div class="modal-title">Buat Tiket Support</div>
          </div>
          <button class="modal-close" @click="showForm = false; formErr = ''">✕</button>
        </div>

        <div class="form-stack">
          <div class="field">
            <label class="field-label">Site / Lokasi <span class="req">*</span></label>
            <select v-model="form.id_site" class="inp">
              <option :value="0">— Pilih Site —</option>
              <option v-for="s in sites" :key="s.id_site" :value="s.id_site">{{ s.nama_site }}</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label">Judul / Topik Masalah <span class="req">*</span></label>
            <input v-model="form.judul_tiket" class="inp" placeholder="Contoh: Koneksi internet terputus sejak pagi" maxlength="200" />
          </div>

          <div class="field">
            <label class="field-label">Deskripsi Detail <span class="opt">(opsional)</span></label>
            <textarea v-model="form.deskripsi_masalah" class="inp area" rows="4" placeholder="Ceritakan gejala, waktu kejadian, dan langkah yang sudah dicoba…" />
          </div>

          <div v-if="formErr" class="form-err">{{ formErr }}</div>
        </div>

        <div class="modal-foot">
          <button class="btn-cancel" @click="showForm = false; formErr = ''">Batal</button>
          <button class="btn-submit" @click="submitTicket" :disabled="saving">
            {{ saving ? 'Mengirim…' : 'Kirim Tiket' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --navy: #0B1D35;
  --blue: #1A56DB;
  --blue-lt: #EBF0FB;
  --ink: #0f172a;
  --ink2: #334155;
  --muted: #64748b;
  --line: #e2e8f0;
  --bg: #f8fafc;
  --card: #ffffff;
  --open-bg: #fef9ec; --open-fg: #b45309;
  --prog-bg: #eff6ff; --prog-fg: #1d4ed8;
  --done-bg: #f0fdf4; --done-fg: #15803d;
  --close-bg: #f1f5f9; --close-fg: #475569;
}

.pg { font-family: 'Inter', sans-serif; padding: 28px 32px; max-width: 980px; background: var(--bg); min-height: 100vh; }

/* Header */
.pg-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .12em; color: var(--blue); text-transform: uppercase; margin-bottom: 4px; }
.pg-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--navy); }

.btn-create {
  padding: 10px 22px; background: var(--navy); color: #fff;
  border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: background .15s;
  white-space: nowrap;
}
.btn-create:hover { background: #162d52; }

/* KPI strip */
.kpi-strip { display: flex; align-items: center; gap: 0; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 24px; margin-bottom: 20px; }
.kpi { display: flex; flex-direction: column; align-items: flex-start; padding: 0 20px; }
.kpi:first-child { padding-left: 0; }
.kpi-n { font-size: 28px; font-weight: 700; color: var(--ink); line-height: 1; font-variant-numeric: tabular-nums; }
.kpi-l { font-size: 11px; color: var(--muted); margin-top: 3px; }
.kpi-open { color: #b45309; }
.kpi-prog { color: #1d4ed8; }
.kpi-done { color: #15803d; }
.kpi-div { width: 1px; height: 36px; background: var(--line); flex-shrink: 0; }

/* Tabs */
.tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
.tab { padding: 9px 16px; font-size: 13px; font-weight: 500; color: var(--muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: inherit; margin-bottom: -1px; }
.tab-active { color: var(--navy); border-bottom-color: var(--navy); font-weight: 600; }

/* Table */
.tbl-wrap { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.tbl { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 10px 14px; font-size: 10px; font-weight: 700; color: var(--muted); text-align: left; text-transform: uppercase; letter-spacing: .06em; }
td { padding: 13px 14px; font-size: 13px; color: var(--ink); border-top: 1px solid #f1f5f9; }
.tbl-row { cursor: pointer; transition: background .1s; }
.tbl-row:hover td { background: #f8fafc; }
.empty-row { text-align: center; color: var(--muted); padding: 40px; }
.empty-state { color: var(--muted); padding: 60px; text-align: center; }

.mono { font-family: 'Courier New', monospace; font-size: 12px; color: var(--ink2); font-weight: 600; }
.site-cell { color: var(--ink2); font-weight: 500; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.judul-cell { max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.date-cell { color: var(--muted); font-size: 12px; white-space: nowrap; }

/* Badges */
.badge { padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.badge-open     { background: var(--open-bg); color: var(--open-fg); }
.badge-progress { background: var(--prog-bg); color: var(--prog-fg); }
.badge-resolved { background: var(--done-bg); color: var(--done-fg); }
.badge-closed   { background: var(--close-bg); color: var(--close-fg); }

/* Prioritas */
.pri { font-size: 11px; font-weight: 600; }
.pri-high { color: #dc2626; }
.pri-med  { color: #d97706; }
.pri-low  { color: var(--muted); }

/* Overlay / Modal */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 200; }
.modal {
  background: var(--card); border-radius: 14px; padding: 28px 32px;
  width: 560px; max-width: 95vw; max-height: 88vh; overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0,0,0,.22);
}
.modal-sm { width: 480px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.modal-title { font-size: 18px; font-weight: 700; color: var(--navy); margin-top: 2px; }
.modal-close { background: none; border: none; font-size: 18px; color: var(--muted); cursor: pointer; padding: 0; line-height: 1; }
.modal-close:hover { color: var(--ink); }

/* Detail meta */
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; background: var(--bg); border-radius: 8px; padding: 16px; margin-bottom: 20px; }
.meta-item { display: flex; flex-direction: column; gap: 5px; }
.meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.meta-val { font-size: 13px; font-weight: 500; color: var(--ink); }

.desc-block { margin-bottom: 20px; }
.desc-text { margin: 0; font-size: 14px; color: var(--ink2); line-height: 1.6; white-space: pre-wrap; }

/* Log */
.log-section { border-top: 1px solid var(--line); padding-top: 18px; }
.log-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 14px; }
.log-list { display: flex; flex-direction: column; gap: 12px; }
.log-item { display: flex; gap: 12px; }
.log-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); flex-shrink: 0; margin-top: 5px; }
.log-body { font-size: 13px; color: var(--ink2); }
.log-status { font-weight: 700; color: var(--ink); }
.log-note { color: var(--muted); }
.log-time { font-size: 11px; color: var(--muted); margin-top: 2px; }

/* Form */
.form-stack { display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 13px; font-weight: 600; color: var(--ink2); }
.req { color: #ef4444; }
.opt { font-weight: 400; color: var(--muted); }
.inp { padding: 10px 13px; border: 1.5px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; color: var(--ink); background: var(--bg); outline: none; transition: border-color .15s; }
.inp:focus { border-color: var(--blue); background: #fff; }
.area { resize: vertical; min-height: 90px; }
.form-err { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; }

.modal-foot { display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--line); padding-top: 18px; }
.btn-cancel { padding: 10px 20px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--ink2); cursor: pointer; font-family: inherit; }
.btn-cancel:hover { background: var(--line); }
.btn-submit { padding: 10px 26px; background: var(--navy); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.btn-submit:hover { background: #162d52; }
.btn-submit:disabled { opacity: .5; cursor: not-allowed; }
</style>
