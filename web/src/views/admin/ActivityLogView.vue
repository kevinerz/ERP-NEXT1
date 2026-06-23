<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '@/services/api'

const logs    = ref<any[]>([])
const meta    = ref({ total: 0, page: 1, limit: 50, total_pages: 0 })
const users   = ref<any[]>([])
const loading = ref(false)

// Filter state
const fUser    = ref('')
const fAksi    = ref('')
const fModul   = ref('')
const fDari    = ref('')
const fSampai  = ref('')
const fSearch  = ref('')
const page     = ref(1)

const AKSI_LIST  = ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE']
const MODUL_LIST = ['auth', 'hris', 'master', 'sales', 'projects', 'operations', 'assets', 'contracts', 'reports', 'admin']

const AKSI_STYLE: Record<string, { bg: string; color: string }> = {
  LOGIN:   { bg: '#f0fdf4', color: '#15803d' },
  LOGOUT:  { bg: '#f1f5f9', color: '#64748b' },
  CREATE:  { bg: '#eff6ff', color: '#1d4ed8' },
  UPDATE:  { bg: '#fefce8', color: '#a16207' },
  DELETE:  { bg: '#fef2f2', color: '#dc2626' },
}

onMounted(async () => {
  await Promise.all([loadUsers(), fetchLogs()])
})

async function loadUsers() {
  try {
    const r = await api.get('/admin/users')
    users.value = r.data.data
  } catch {}
}

async function fetchLogs() {
  loading.value = true
  try {
    const params: any = { page: page.value, limit: 50 }
    if (fUser.value)   params.id_user   = fUser.value
    if (fAksi.value)   params.aksi      = fAksi.value
    if (fModul.value)  params.modul     = fModul.value
    if (fDari.value)   params.tgl_dari  = fDari.value
    if (fSampai.value) params.tgl_sampai = fSampai.value
    if (fSearch.value) params.search    = fSearch.value

    const r = await api.get('/admin/logs', { params })
    logs.value  = r.data.data
    meta.value  = r.data.meta
  } catch {}
  finally { loading.value = false }
}

function doFilter() { page.value = 1; fetchLogs() }
function goPage(p: number) { page.value = p; fetchLogs() }
function clearFilter() {
  fUser.value = ''; fAksi.value = ''; fModul.value = ''
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
  fUser.value || fAksi.value || fModul.value || fDari.value || fSampai.value || fSearch.value
)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Activity Log</h2>
        <p class="sub">Riwayat aktivitas semua user — login, logout, dan setiap perubahan data</p>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="filter-card">
      <div class="filter-row">
        <input v-model="fSearch" placeholder="Cari user / deskripsi..." class="f-input wide"
          @keyup.enter="doFilter" />

        <select v-model="fUser" class="f-select">
          <option value="">Semua User</option>
          <option v-for="u in users" :key="u.id_user" :value="u.id_user">
            {{ u.nama_lengkap }} ({{ u.username }})
          </option>
        </select>

        <select v-model="fAksi" class="f-select narrow">
          <option value="">Semua Aksi</option>
          <option v-for="a in AKSI_LIST" :key="a" :value="a">{{ a }}</option>
        </select>

        <select v-model="fModul" class="f-select narrow">
          <option value="">Semua Modul</option>
          <option v-for="m in MODUL_LIST" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <div class="filter-row">
        <label class="date-label">Dari</label>
        <input v-model="fDari"   type="date" class="f-date" />
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
            <th>User</th>
            <th>Aksi</th>
            <th>Modul</th>
            <th>Entitas</th>
            <th>Deskripsi</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!logs.length">
            <td colspan="7" class="empty">Belum ada log aktivitas</td>
          </tr>
          <tr v-for="log in logs" :key="log.id_log">
            <td class="td-time">{{ fmtTime(log.created_at) }}</td>
            <td>
              <div class="td-nama">{{ log.nama || log.username }}</div>
              <div class="td-username">{{ log.username }}</div>
            </td>
            <td>
              <span class="aksi-badge"
                :style="{ background: AKSI_STYLE[log.aksi]?.bg, color: AKSI_STYLE[log.aksi]?.color }">
                {{ log.aksi }}
              </span>
            </td>
            <td class="td-modul">{{ log.modul || '—' }}</td>
            <td class="td-entitas">{{ log.entitas || '—' }}</td>
            <td class="td-desc">{{ log.deskripsi || '—' }}</td>
            <td class="td-ip mono">{{ log.ip_address || '—' }}</td>
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
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

/* Filter */
.filter-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 16px 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
.filter-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.f-input { padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
.f-input:focus { border-color: #3b82f6; }
.f-input.wide { flex: 1; min-width: 200px; }
.f-select { padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; background: #f8fafc; }
.f-select.narrow { max-width: 130px; }
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
.td-nama { font-size: 13px; font-weight: 600; color: #0f172a; }
.td-username { font-size: 11px; color: #94a3b8; font-family: monospace; }
.aksi-badge { padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.td-modul { font-size: 12px; color: #64748b; font-weight: 600; }
.td-entitas { font-size: 12px; color: #374151; }
.td-desc { font-size: 12px; color: #374151; max-width: 260px; }
.td-ip { font-size: 11px; color: #94a3b8; white-space: nowrap; }
.mono { font-family: monospace; }

/* Pagination */
.pagination { display: flex; gap: 4px; padding: 12px 16px; justify-content: center; border-top: 1px solid #f1f5f9; align-items: center; }
.pg-btn { min-width: 32px; height: 32px; padding: 0 8px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.pg-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pg-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; font-weight: 700; }
.pg-dots { padding: 0 4px; color: #94a3b8; }
.table-foot { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }
</style>
