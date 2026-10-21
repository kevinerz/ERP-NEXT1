<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import BasePagination from '@/components/BasePagination.vue'
import { useRouter } from 'vue-router'
import { useHrisStore } from '@/stores/hris'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const hris = useHrisStore()
const cfg = useSettingsStore()

const search = ref('')
const filterDept = ref('')
const filterStatus = ref('')
const page = ref(1)

let searchTimer: ReturnType<typeof setTimeout>

function goPage(p: number) { page.value = p; load() }

function load() {
  hris.fetchList({
    search: search.value || undefined,
    departemen: filterDept.value || undefined,
    status_aktif: filterStatus.value || undefined,
    page: page.value,
    limit: 20,
  })
}

function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; load() }, 400)
}

watch([filterDept, filterStatus], () => { page.value = 1; load() })

onMounted(() => {
  hris.fetchDepartemen()
  load()
})
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2>Karyawan</h2>
        <p>Data karyawan {{ cfg.settings.company_name || 'perusahaan' }}</p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-secondary" @click="router.push('/hris/undangan')">
          🔗 Undang Karyawan Baru
        </button>
        <button type="button" class="btn btn-primary" @click="router.push('/hris/karyawan/tambah')">
          + Tambah Karyawan
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <input
        v-model="search"
        @input="onSearch"
        type="text"
        placeholder="Cari nama, NIP, jabatan..."
        class="search-input"
      />
      <select v-model="filterDept" class="filter-select">
        <option value="">Semua Departemen</option>
        <option v-for="d in hris.departemenList" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-model="filterStatus" class="filter-select">
        <option value="">Semua Status</option>
        <option value="true">Aktif</option>
        <option value="false">Nonaktif</option>
      </select>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="hris.loading" class="loading-state">Memuat data...</div>
      <div v-else-if="hris.error" class="error-state">{{ hris.error }}</div>
      <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>NIP</th>
            <th>Nama Lengkap</th>
            <th>Jabatan</th>
            <th>Departemen</th>
            <th>No. HP</th>
            <th>Akun</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!hris.list?.length">
            <td colspan="8" class="empty">Tidak ada data karyawan</td>
          </tr>
          <tr v-for="k in hris.list" :key="k.id_karyawan">
            <td class="mono">{{ k.nip }}</td>
            <td class="bold">{{ k.nama_lengkap }}</td>
            <td>{{ k.jabatan }}</td>
            <td><span class="badge-dept">{{ k.departemen }}</span></td>
            <td>{{ k.no_hp || '—' }}</td>
            <td>
              <span v-if="k.user" class="badge-user">{{ k.user.username }}</span>
              <span v-else class="badge-no-user">Belum ada</span>
            </td>
            <td>
              <span :class="k.status_aktif ? 'badge-aktif' : 'badge-nonaktif'">
                {{ k.status_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-icon" @click="router.push(`/hris/karyawan/${k.id_karyawan}`)">
                Detail
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <!-- Pagination -->
      <BasePagination :page="page" :total-pages="hris.meta?.total_pages ?? 1" @change="goPage" />
      <div class="meta-info" v-if="!hris.loading">
        {{ hris.meta?.total ?? 0 }} karyawan ditemukan
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header h2 { margin: 0; font-size: 22px; color: var(--text-1); }
.page-header p { margin: 4px 0 0; font-size: 13px; color: var(--text-3); }

.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.search-input {
  flex: 1;
  min-width: 200px;
}
.filter-select { cursor: pointer; }

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.table th {
  background: #f8fafc;
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}
.table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  vertical-align: middle;
}
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: #f8fafc; }

.mono { font-family: monospace; font-size: 13px; }
.bold { font-weight: 600; color: #0f172a; }

.badge-dept {
  background: #eff6ff;
  color: #1d4ed8;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.badge-user {
  background: #f0fdf4;
  color: #16a34a;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.badge-no-user {
  background: #fef9c3;
  color: #a16207;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
}
.badge-aktif {
  background: #dcfce7;
  color: #15803d;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.badge-nonaktif {
  background: #fee2e2;
  color: #dc2626;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.actions { white-space: nowrap; }
.btn-icon {
  background: #f1f5f9;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 13px;
  cursor: pointer;
  color: #1e40af;
  font-weight: 600;
}
.btn-icon:hover { background: #e0e7ff; }

.loading-state, .error-state, .empty {
  padding: 48px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}
.error-state { color: #ef4444; }


.meta-info {
  padding: 10px 16px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
  border-top: 1px solid var(--border-light);
}
</style>
