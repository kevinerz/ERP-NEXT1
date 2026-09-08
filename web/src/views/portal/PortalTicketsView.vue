<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import portalApi from '@/services/portalApi'

const tickets   = ref<any[]>([])
const sites     = ref<any[]>([])
const loading   = ref(true)
const activeTab = ref<'all' | 'open' | 'progress' | 'done'>('all')
const detail    = ref<any>(null)

const showForm = ref(false)
const saving   = ref(false)
const formErr  = ref('')
const form = ref({ id_site: 0, judul_tiket: '', deskripsi_masalah: '' })

onMounted(async () => {
  const [t, s] = await Promise.all([
    portalApi.get('/portal/tickets', { params: { limit: 100 } }),
    portalApi.get('/portal/sites'),
  ])
  tickets.value = t.data.data ?? []
  sites.value   = s.data.data ?? []
  loading.value = false
})

const filtered = computed(() => {
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

async function openDetail(t: any) {
  const r = await portalApi.get(`/portal/tickets/${t.id_ticket}`)
  detail.value = r.data.data
}

async function submitTicket() {
  if (!form.value.id_site || !form.value.judul_tiket.trim()) {
    formErr.value = 'Site dan judul tiket wajib diisi'; return
  }
  saving.value = true; formErr.value = ''
  try {
    await portalApi.post('/portal/tickets', {
      id_site:           form.value.id_site,
      judul_tiket:       form.value.judul_tiket.trim(),
      deskripsi_masalah: form.value.deskripsi_masalah.trim() || undefined,
    })
    const fresh = await portalApi.get('/portal/tickets', { params: { limit: 100 } })
    tickets.value = fresh.data.data ?? []
    showForm.value = false
    form.value = { id_site: 0, judul_tiket: '', deskripsi_masalah: '' }
  } catch (e: any) {
    formErr.value = e.response?.data?.message || 'Gagal membuat tiket'
  } finally { saving.value = false }
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusBadge(s: string): { bg: string; fg: string } {
  if (s === 'Open')        return { bg: '#fef9ec', fg: '#b45309' }
  if (s === 'In Progress') return { bg: '#eff6ff', fg: '#1d4ed8' }
  if (s === 'Resolved')    return { bg: '#f0fdf4', fg: '#15803d' }
  if (s === 'Closed')      return { bg: '#f1f5f9', fg: '#475569' }
  return { bg: '#f1f5f9', fg: '#475569' }
}

function prioritasColor(p: string): string {
  if (p === 'High' || p === 'Critical') return '#dc2626'
  if (p === 'Low')                      return '#94a3b8'
  return '#d97706'
}

// ── Downtime helpers ─────────────────────────────────────────
function calcDurasi(start: string | null, end: string | null): string {
  if (!start) return '—'
  if (!end)   return 'Belum selesai'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 0) return '—'
  const totalMenit = Math.floor(ms / 60000)
  const h = Math.floor(totalMenit / 60)
  const m = totalMenit % 60
  if (h >= 24) return `${Math.floor(h / 24)} hari ${h % 24} jam ${m} menit`
  if (h > 0)   return `${h} jam ${m} menit`
  return `${m} menit`
}

function slaInfo(t: any): { label: string; color: string; bg: string } {
  const status = t.status_tiket ?? t.status
  const selesai = t.tgl_resolved ?? t.tgl_closed
  const due = t.sla_due
  if (!due) return { label: '—', color: '#94a3b8', bg: '#f8fafc' }
  if (t.sla_breached) return { label: 'SLA Terlampaui', color: '#dc2626', bg: '#fef2f2' }
  if (selesai && new Date(selesai) > new Date(due)) return { label: 'SLA Terlampaui', color: '#dc2626', bg: '#fef2f2' }
  if (['Resolved', 'Closed'].includes(status) && selesai) return { label: 'Tepat Waktu', color: '#15803d', bg: '#f0fdf4' }
  if (new Date() > new Date(due)) return { label: 'SLA Terlampaui', color: '#dc2626', bg: '#fef2f2' }
  return { label: 'Dalam SLA', color: '#1d4ed8', bg: '#eff6ff' }
}

function waktuSelesai(t: any): string | null {
  return t.tgl_resolved ?? t.tgl_closed ?? null
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
        <span class="kpi-n" style="color:#0B1D35">{{ kpi.total }}</span>
        <span class="kpi-l">Total Tiket</span>
      </div>
      <div class="kpi-div" />
      <div class="kpi">
        <span class="kpi-n" style="color:#b45309">{{ kpi.open }}</span>
        <span class="kpi-l">Open</span>
      </div>
      <div class="kpi-div" />
      <div class="kpi">
        <span class="kpi-n" style="color:#1d4ed8">{{ kpi.progress }}</span>
        <span class="kpi-l">Diproses</span>
      </div>
      <div class="kpi-div" />
      <div class="kpi">
        <span class="kpi-n" style="color:#15803d">{{ kpi.done }}</span>
        <span class="kpi-l">Selesai</span>
      </div>
    </div>

    <!-- Tab filter -->
    <div class="tabs">
      <button :class="['tab', activeTab==='all'      && 'tab-active']" @click="activeTab='all'">Semua</button>
      <button :class="['tab', activeTab==='open'     && 'tab-active']" @click="activeTab='open'">Open</button>
      <button :class="['tab', activeTab==='progress' && 'tab-active']" @click="activeTab='progress'">Diproses</button>
      <button :class="['tab', activeTab==='done'     && 'tab-active']" @click="activeTab='done'">Selesai</button>
    </div>

    <div v-if="loading" class="empty-state">Memuat data tiket…</div>

    <!-- Table -->
    <div v-else class="tbl-card">
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
          <tr v-for="t in filtered" :key="t.id_ticket" class="tbl-row" @click="openDetail(t)">
            <td class="col-no">{{ t.nomor_tiket }}</td>
            <td class="col-site">{{ t.site?.nama_site ?? '—' }}</td>
            <td class="col-judul">{{ t.judul ?? t.judul_tiket }}</td>
            <td>
              <span class="status-badge"
                :style="{ background: statusBadge(t.status ?? t.status_tiket).bg, color: statusBadge(t.status ?? t.status_tiket).fg }">
                {{ t.status ?? t.status_tiket }}
              </span>
            </td>
            <td class="col-pri" :style="{ color: prioritasColor(t.prioritas ?? 'Medium') }">
              {{ t.prioritas ?? 'Medium' }}
            </td>
            <td class="col-date">{{ fmtDate(t.tgl_open ?? t.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Modal Detail ─────────────────────────────────── -->
    <div v-if="detail" class="overlay" @click.self="detail = null">
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="eyebrow" style="color:#1A56DB">{{ detail.nomor_tiket }}</div>
            <div class="modal-title">{{ detail.judul_tiket ?? detail.judul }}</div>
          </div>
          <button class="modal-close" @click="detail = null">✕</button>
        </div>

        <!-- Meta strip -->
        <div class="meta-strip">
          <div class="meta-cell">
            <div class="meta-lbl">Status</div>
            <span class="status-badge"
              :style="{ background: statusBadge(detail.status_tiket ?? detail.status).bg, color: statusBadge(detail.status_tiket ?? detail.status).fg }">
              {{ detail.status_tiket ?? detail.status }}
            </span>
          </div>
          <div class="meta-cell">
            <div class="meta-lbl">Prioritas</div>
            <span class="meta-val" :style="{ color: prioritasColor(detail.prioritas ?? 'Medium'), fontWeight: 600 }">
              {{ detail.prioritas ?? 'Medium' }}
            </span>
          </div>
          <div class="meta-cell">
            <div class="meta-lbl">Site</div>
            <span class="meta-val">{{ detail.site?.nama_site ?? '—' }}</span>
          </div>
          <div class="meta-cell">
            <div class="meta-lbl">Dilaporkan</div>
            <span class="meta-val">{{ fmtDate(detail.tgl_open ?? detail.created_at) }}</span>
          </div>
        </div>

        <!-- Rincian Downtime -->
        <div class="downtime-card">
          <div class="downtime-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Rincian Downtime Tiket Ini
          </div>
          <div class="downtime-grid">
            <div class="dt-cell">
              <div class="dt-lbl">Mulai Down (Laporan)</div>
              <div class="dt-val">{{ fmtDate(detail.tgl_open ?? detail.created_at) }}</div>
            </div>
            <div class="dt-cell">
              <div class="dt-lbl">Waktu Selesai</div>
              <div class="dt-val">{{ fmtDate(waktuSelesai(detail)) }}</div>
            </div>
            <div class="dt-cell">
              <div class="dt-lbl">Total Durasi Downtime</div>
              <div class="dt-val dt-val-bold">
                {{ calcDurasi(detail.tgl_open ?? detail.created_at, waktuSelesai(detail)) }}
              </div>
            </div>
            <div class="dt-cell">
              <div class="dt-lbl">SLA Deadline</div>
              <div class="dt-val">{{ fmtDate(detail.sla_due) }}</div>
            </div>
            <div class="dt-cell" style="grid-column:1/-1">
              <div class="dt-lbl">Status SLA</div>
              <span class="sla-badge"
                :style="{ background: slaInfo(detail).bg, color: slaInfo(detail).color }">
                {{ slaInfo(detail).label }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="detail.deskripsi_masalah" class="desc-block">
          <div class="meta-lbl" style="margin-bottom:6px">Deskripsi Masalah</div>
          <p class="desc-text">{{ detail.deskripsi_masalah }}</p>
        </div>

        <div v-if="detail.logs?.length" class="log-section">
          <div class="log-title">Riwayat Tiket</div>
          <div class="log-list">
            <div v-for="log in [...detail.logs].reverse()" :key="log.id_log" class="log-item">
              <div class="log-dot"></div>
              <div>
                <div class="log-body">
                  <span style="font-weight:700;color:#0f172a">{{ log.status_ke }}</span>
                  <span v-if="log.catatan" style="color:#64748b"> — {{ log.catatan }}</span>
                </div>
                <div class="log-time">{{ fmtDate(log.created_at) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal Buat Tiket ─────────────────────────────── -->
    <div v-if="showForm" class="overlay" @click.self="showForm = false; formErr = ''">
      <div class="modal modal-sm">
        <div class="modal-head">
          <div>
            <div class="eyebrow" style="color:#1A56DB">PERMINTAAN BARU</div>
            <div class="modal-title">Buat Tiket Support</div>
          </div>
          <button class="modal-close" @click="showForm = false; formErr = ''">✕</button>
        </div>

        <div class="form-stack">
          <div class="field">
            <label class="field-lbl">Site / Lokasi <span style="color:#ef4444">*</span></label>
            <select v-model="form.id_site" class="inp">
              <option :value="0">— Pilih Site —</option>
              <option v-for="s in sites" :key="s.id_site" :value="s.id_site">{{ s.nama_site }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-lbl">Topik / Judul Masalah <span style="color:#ef4444">*</span></label>
            <input v-model="form.judul_tiket" class="inp" placeholder="Contoh: Koneksi internet mati sejak pagi" maxlength="200" />
          </div>
          <div class="field">
            <label class="field-lbl">Deskripsi Detail <span style="color:#94a3b8;font-weight:400">(opsional)</span></label>
            <textarea v-model="form.deskripsi_masalah" class="inp inp-area" rows="4"
              placeholder="Ceritakan gejala, waktu kejadian, dan langkah yang sudah dicoba…" />
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

.pg { font-family: 'Inter', system-ui, sans-serif; padding: 28px 32px; max-width: 1000px; background: #f8fafc; min-height: 100%; box-sizing: border-box; }

/* Header */
.pg-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 4px; }
.pg-title { margin: 0; font-size: 22px; font-weight: 700; color: #0B1D35; }
.btn-create { padding: 10px 22px; background: #0B1D35; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.btn-create:hover { background: #162d52; }

/* KPI */
.kpi-strip { display: flex; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 24px; margin-bottom: 20px; gap: 0; }
.kpi { display: flex; flex-direction: column; align-items: flex-start; padding: 0 24px; }
.kpi:first-child { padding-left: 0; }
.kpi-n { font-size: 30px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.kpi-l { font-size: 11px; color: #64748b; margin-top: 4px; }
.kpi-div { width: 1px; height: 36px; background: #e2e8f0; flex-shrink: 0; }

/* Tabs */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 16px; }
.tab { padding: 9px 16px; font-size: 13px; font-weight: 500; color: #64748b; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: inherit; margin-bottom: -1px; transition: color .15s; }
.tab-active { color: #0B1D35; border-bottom-color: #0B1D35; font-weight: 600; }

/* Table */
.empty-state { color: #94a3b8; padding: 60px; text-align: center; font-size: 14px; }
.tbl-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.tbl { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 10px 16px; font-size: 10px; font-weight: 700; color: #94a3b8; text-align: left; text-transform: uppercase; letter-spacing: .07em; border-bottom: 1px solid #e2e8f0; }
td { padding: 13px 16px; font-size: 13px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: middle; }
.tbl-row { cursor: pointer; transition: background .1s; }
.tbl-row:hover td { background: #f8fafc; }
.empty-row { text-align: center; color: #94a3b8; padding: 48px; }

.col-no   { font-family: 'Courier New', monospace; font-size: 12px; color: #334155; font-weight: 600; white-space: nowrap; }
.col-site { color: #334155; font-weight: 500; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-judul{ max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-pri  { font-size: 12px; font-weight: 600; }
.col-date { color: #94a3b8; font-size: 12px; white-space: nowrap; }

.status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; white-space: nowrap; line-height: 1.5; }

/* Overlay */
.overlay { position: fixed; inset: 0; background: rgba(11,29,53,.55); display: flex; align-items: center; justify-content: center; z-index: 300; }

/* Modal */
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 560px; max-width: 95vw; max-height: 86vh; overflow-y: auto; box-shadow: 0 24px 64px rgba(0,0,0,.2); }
.modal-sm { width: 480px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
.modal-title { font-size: 18px; font-weight: 700; color: #0B1D35; margin-top: 3px; }
.modal-close { background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0; }
.modal-close:hover { color: #0f172a; }

/* Meta strip */
.meta-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; background: #f8fafc; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.meta-cell { display: flex; flex-direction: column; gap: 5px; }
.meta-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; }
.meta-val { font-size: 13px; font-weight: 500; color: #0f172a; }

/* Rincian Downtime */
.downtime-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #0B1D35;
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 20px;
}
.downtime-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #0B1D35;
  margin-bottom: 14px;
}
.downtime-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 20px;
}
.dt-cell { display: flex; flex-direction: column; gap: 4px; }
.dt-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #94a3b8; }
.dt-val { font-size: 13px; font-weight: 500; color: #0f172a; }
.dt-val-bold { font-size: 15px; font-weight: 700; color: #0B1D35; }
.sla-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: 700; }

/* Deskripsi */
.desc-block { margin-bottom: 20px; }
.desc-text { margin: 0; font-size: 14px; color: #334155; line-height: 1.65; white-space: pre-wrap; }

/* Log */
.log-section { border-top: 1px solid #e2e8f0; padding-top: 18px; }
.log-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin-bottom: 14px; }
.log-list { display: flex; flex-direction: column; gap: 14px; }
.log-item { display: flex; gap: 12px; align-items: flex-start; }
.log-dot { width: 8px; height: 8px; border-radius: 50%; background: #1A56DB; flex-shrink: 0; margin-top: 4px; }
.log-body { font-size: 13px; }
.log-time { font-size: 11px; color: #94a3b8; margin-top: 2px; }

/* Form */
.form-stack { display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-lbl { font-size: 13px; font-weight: 600; color: #334155; }
.inp { padding: 10px 13px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: inherit; color: #0f172a; background: #f8fafc; outline: none; transition: border-color .15s; width: 100%; box-sizing: border-box; }
.inp:focus { border-color: #1A56DB; background: #fff; }
.inp-area { resize: vertical; min-height: 90px; }
.form-err { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; }

.modal-foot { display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 4px; }
.btn-cancel { padding: 10px 20px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 600; color: #334155; cursor: pointer; font-family: inherit; }
.btn-cancel:hover { background: #e2e8f0; }
.btn-submit { padding: 10px 26px; background: #0B1D35; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.btn-submit:hover { background: #162d52; }
.btn-submit:disabled { opacity: .5; cursor: not-allowed; }
</style>
