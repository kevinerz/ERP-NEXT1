<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '@/services/api'

const logs    = ref<any[]>([])
const meta    = ref({ total: 0, page: 1, limit: 50, total_pages: 0 })
const stats   = ref({ total: 0, sent: 0, failed: 0, last24h: 0, configured: true })
const loading = ref(false)
const error   = ref('')

// Filter state
const fStatus = ref('')
const fModul  = ref('')
const fDari   = ref('')
const fSampai = ref('')
const fSearch = ref('')
const page    = ref(1)

const STATUS_LIST = [
  { v: 'sent', label: 'Terkirim' },
  { v: 'failed', label: 'Gagal' },
]

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  sent:   { bg: '#f0fdf4', color: '#15803d', label: 'Terkirim' },
  failed: { bg: '#fef2f2', color: '#dc2626', label: 'Gagal' },
}

onMounted(async () => {
  await Promise.all([fetchStats(), fetchLogs()])
})

async function fetchStats() {
  try {
    const r = await api.get('/mailer/logs/stats')
    stats.value = r.data.data
  } catch (e: any) { /* stats opsional, jangan blok halaman */ }
}

async function fetchLogs() {
  loading.value = true; error.value = ''
  try {
    const params: any = { page: page.value, limit: 50 }
    if (fStatus.value) params.status    = fStatus.value
    if (fModul.value)  params.modul     = fModul.value
    if (fDari.value)   params.tgl_dari  = fDari.value
    if (fSampai.value) params.tgl_sampai = fSampai.value
    if (fSearch.value) params.search    = fSearch.value

    const r = await api.get('/mailer/logs', { params })
    logs.value = r.data.data
    meta.value = r.data.meta
  } catch (e: any) { error.value = e.response?.data?.message || 'Gagal memuat log email' }
  finally { loading.value = false }
}

function doFilter() { page.value = 1; fetchLogs() }
function goPage(p: number) { page.value = p; fetchLogs() }
function refresh() { fetchStats(); fetchLogs() }
function clearFilter() {
  fStatus.value = ''; fModul.value = ''
  fDari.value = ''; fSampai.value = ''; fSearch.value = ''
  page.value = 1; fetchLogs()
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const hasFilter = computed(() =>
  fStatus.value || fModul.value || fDari.value || fSampai.value || fSearch.value,
)

// ─── Test kirim ──────────────────────────────────────────────
const showTest    = ref(false)
const testTo      = ref('')
const testSubject = ref('')
const testMessage = ref('')
const sending     = ref(false)
const testOk      = ref('')
const testErr     = ref('')

function openTest() {
  testTo.value = ''; testSubject.value = ''; testMessage.value = ''
  testOk.value = ''; testErr.value = ''
  showTest.value = true
}

async function sendTest() {
  if (!testTo.value.trim()) { testErr.value = 'Isi alamat email tujuan'; return }
  sending.value = true; testOk.value = ''; testErr.value = ''
  try {
    const r = await api.post('/mailer/test', {
      to: testTo.value.trim(),
      subject: testSubject.value.trim() || undefined,
      message: testMessage.value.trim() || undefined,
    })
    testOk.value = r.data.message || 'Email test terkirim'
    await Promise.all([fetchStats(), fetchLogs()])
  } catch (e: any) {
    testErr.value = e.response?.data?.message || 'Gagal mengirim email test'
  } finally { sending.value = false }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Email Log</h2>
        <p class="sub">Riwayat semua email keluar dari sistem (noreply) — onboarding, broadcast, notifikasi</p>
      </div>
      <div class="header-actions">
        <button class="btn-test" @click="openTest">✉️ Kirim Test</button>
        <button class="btn-refresh" @click="refresh">↻ Muat ulang</button>
      </div>
    </div>

    <div v-if="error" class="alert-error">{{ error }}</div>
    <div v-if="!stats.configured" class="alert-warn">
      ⚠️ Mailer belum dikonfigurasi (MAIL_* di .env server). Email otomatis tidak akan terkirim sampai diisi.
    </div>

    <!-- Stat cards -->
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Email</div>
        <div class="stat-value">{{ stats.total.toLocaleString('id-ID') }}</div>
      </div>
      <div class="stat-card ok">
        <div class="stat-label">Terkirim</div>
        <div class="stat-value">{{ stats.sent.toLocaleString('id-ID') }}</div>
      </div>
      <div class="stat-card bad">
        <div class="stat-label">Gagal</div>
        <div class="stat-value">{{ stats.failed.toLocaleString('id-ID') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">24 Jam Terakhir</div>
        <div class="stat-value">{{ stats.last24h.toLocaleString('id-ID') }}</div>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="filter-card">
      <div class="filter-row">
        <input v-model="fSearch" placeholder="Cari alamat / subjek..." class="f-input wide"
          @keyup.enter="doFilter" />

        <select v-model="fStatus" class="f-select narrow">
          <option value="">Semua Status</option>
          <option v-for="s in STATUS_LIST" :key="s.v" :value="s.v">{{ s.label }}</option>
        </select>

        <input v-model="fModul" placeholder="Modul (mis. onboarding)" class="f-input" />
      </div>
      <div class="filter-row">
        <label class="date-label">Dari</label>
        <input v-model="fDari" type="date" class="f-date" />
        <label class="date-label">s/d</label>
        <input v-model="fSampai" type="date" class="f-date" />
        <button class="btn-filter" @click="doFilter">Terapkan</button>
        <button v-if="hasFilter" class="btn-clear" @click="clearFilter">Reset</button>
        <span class="total-badge" v-if="meta.total">{{ meta.total.toLocaleString('id-ID') }} log</span>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Memuat log...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Penerima</th>
            <th>Subjek</th>
            <th>Modul</th>
            <th>Status</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!logs.length">
            <td colspan="6" class="empty">Belum ada email terkirim</td>
          </tr>
          <tr v-for="log in logs" :key="log.id_email_log">
            <td class="td-time">{{ fmtTime(log.created_at) }}</td>
            <td class="td-to mono">{{ log.to_address }}</td>
            <td class="td-subject">{{ log.subject }}</td>
            <td class="td-modul">{{ log.modul || '—' }}</td>
            <td>
              <span class="status-badge"
                :style="{ background: STATUS_STYLE[log.status]?.bg, color: STATUS_STYLE[log.status]?.color }">
                {{ STATUS_STYLE[log.status]?.label || log.status }}
              </span>
            </td>
            <td class="td-error">{{ log.error || '—' }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="meta.total_pages > 1" class="pagination">
        <button class="pg-btn" :disabled="page <= 1" @click="goPage(page - 1)">‹</button>
        <template v-for="p in meta.total_pages" :key="p">
          <button v-if="Math.abs(p - page) <= 2 || p === 1 || p === meta.total_pages"
            :class="['pg-btn', { active: p === page }]" @click="goPage(p)">{{ p }}</button>
          <span v-else-if="Math.abs(p - page) === 3" class="pg-dots">…</span>
        </template>
        <button class="pg-btn" :disabled="page >= meta.total_pages" @click="goPage(page + 1)">›</button>
      </div>

      <div class="table-foot" v-if="meta.total">
        Menampilkan {{ (page - 1) * meta.limit + 1 }}–{{ Math.min(page * meta.limit, meta.total) }}
        dari {{ meta.total.toLocaleString('id-ID') }} log
      </div>
    </div>

    <!-- Modal test kirim -->
    <div v-if="showTest" class="modal-overlay" @click.self="showTest = false">
      <div class="modal-card">
        <div class="modal-head">
          <h3>Kirim Email Test</h3>
          <button class="modal-x" @click="showTest = false">×</button>
        </div>
        <div class="modal-body">
          <p class="modal-hint">Email dikirim dari akun noreply sistem, lengkap dengan header &amp; footer brand.</p>

          <label class="fld-label">Email tujuan *</label>
          <input v-model="testTo" type="email" placeholder="nama@contoh.com" class="fld" @keyup.enter="sendTest" />

          <label class="fld-label">Subjek <span class="opt">(opsional)</span></label>
          <input v-model="testSubject" placeholder="Test Email — ERP Next1" class="fld" />

          <label class="fld-label">Pesan <span class="opt">(opsional)</span></label>
          <textarea v-model="testMessage" rows="3" placeholder="Pesan default akan dipakai bila dikosongkan" class="fld"></textarea>

          <div v-if="testOk" class="msg-ok">✓ {{ testOk }}</div>
          <div v-if="testErr" class="msg-err">{{ testErr }}</div>
        </div>
        <div class="modal-foot">
          <button class="btn-cancel" @click="showTest = false">Tutup</button>
          <button class="btn-send" :disabled="sending" @click="sendTest">
            {{ sending ? 'Mengirim...' : 'Kirim' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { margin-bottom: 20px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.btn-refresh { padding: 8px 14px; background: #f1f5f9; color: #334155; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-refresh:hover { background: #e2e8f0; }
.btn-test { padding: 8px 14px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
.modal-card { background: #fff; border-radius: 14px; width: 100%; max-width: 460px; box-shadow: 0 20px 50px rgba(0,0,0,0.25); overflow: hidden; }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
.modal-head h3 { margin: 0; font-size: 16px; color: #0f172a; }
.modal-x { background: none; border: none; font-size: 24px; color: #94a3b8; cursor: pointer; line-height: 1; }
.modal-x:hover { color: #374151; }
.modal-body { padding: 18px 20px; }
.modal-hint { margin: 0 0 14px; font-size: 12px; color: #64748b; }
.fld-label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin: 10px 0 4px; }
.fld-label .opt { color: #94a3b8; font-weight: 400; }
.fld { width: 100%; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; font-family: inherit; }
.fld:focus { border-color: #3b82f6; }
.msg-ok { margin-top: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 13px; padding: 9px 12px; border-radius: 8px; }
.msg-err { margin-top: 12px; background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 13px; padding: 9px 12px; border-radius: 8px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid #f1f5f9; }
.btn-cancel { padding: 8px 16px; background: #f1f5f9; color: #334155; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-send { padding: 8px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-send:disabled { opacity: 0.6; cursor: not-allowed; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }
.alert-warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; color: #a16207; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

/* Stat cards */
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 16px 18px; border-left: 3px solid #cbd5e1; }
.stat-card.ok { border-left-color: #22c55e; }
.stat-card.bad { border-left-color: #ef4444; }
.stat-label { font-size: 12px; color: #64748b; font-weight: 600; }
.stat-value { font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px; }

/* Filter */
.filter-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 16px 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
.filter-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.f-input { padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.f-input:focus { border-color: #3b82f6; }
.f-input.wide { flex: 1; min-width: 200px; }
.f-select { padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; background: #f8fafc; }
.f-select.narrow { max-width: 150px; }
.f-date { padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.date-label { font-size: 12px; color: #64748b; font-weight: 600; }
.btn-filter { padding: 8px 16px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-clear { padding: 8px 12px; background: #fef2f2; color: #dc2626; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.total-badge { margin-left: auto; font-size: 12px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 4px 12px; border-radius: 12px; }

/* Table */
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 11px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.4px; }
td { padding: 11px 12px; border-top: 1px solid #f1f5f9; vertical-align: top; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.td-time { font-size: 12px; color: #374151; white-space: nowrap; font-family: monospace; }
.td-to { font-size: 12px; color: #0f172a; }
.td-subject { font-size: 13px; color: #374151; max-width: 260px; }
.td-modul { font-size: 12px; color: #64748b; font-weight: 600; }
.status-badge { padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.td-error { font-size: 12px; color: #dc2626; max-width: 260px; word-break: break-word; }
.mono { font-family: monospace; }

/* Pagination */
.pagination { display: flex; gap: 4px; padding: 12px 16px; justify-content: center; border-top: 1px solid #f1f5f9; align-items: center; }
.pg-btn { min-width: 32px; height: 32px; padding: 0 8px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.pg-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pg-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; font-weight: 700; }
.pg-dots { padding: 0 4px; color: #94a3b8; }
.table-foot { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

@media (max-width: 768px) {
  .page { padding: 0; }
  .stat-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
