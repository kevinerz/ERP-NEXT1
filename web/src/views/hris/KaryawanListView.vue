<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useHrisStore } from '@/stores/hris'

const router = useRouter()
const hris = useHrisStore()

const search = ref('')
const filterDept = ref('')
const filterStatus = ref('')
const page = ref(1)

let searchTimer: ReturnType<typeof setTimeout>

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
        <p>Data karyawan PT. Perdana Global Internet</p>
      </div>
      <button class="btn-primary" @click="router.push('/hris/karyawan/tambah')">
        + Tambah Karyawan
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input
        v-model="search"
        @input="onSearch"
        type="text"
        placeholder="Cari nama, NIP, jabatan..."
        class="search-input"
      />
      <select v-model="filterDept" class="select-filter">
        <option value="">Semua Departemen</option>
        <option v-for="d in hris.departemenList" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-model="filterStatus" class="select-filter">
        <option value="">Semua Status</option>
        <option value="true">Aktif</option>
        <option value="false">Nonaktif</option>
      </select>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <div v-if="hris.loading" class="loading-state">Memuat data...</div>
      <div v-else-if="hris.error" class="error-state">{{ hris.error }}</div>
      <table v-else class="table">
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
          <tr v-if="!hris.list.length">
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
    <div class="pagination" v-if="hris.meta.total_pages > 1">
      <button :disabled="page <= 1" @click="page--; load()">‹ Prev</button>
      <span>Halaman {{ page }} dari {{ hris.meta.total_pages }} ({{ hris.meta.total }} total)</span>
      <button :disabled="page >= hris.meta.total_pages" @click="page++; load()">Next ›</button>
    </div>
    <div class="meta-info" v-else-if="!hris.loading">
      {{ hris.meta.total }} karyawan ditemukan
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.page-header h2 { margin: 0; font-size: 22px; color: #0f172a; }
.page-header p { margin: 4px 0 0; font-size: 13px; color: #64748b; }

.btn-primary {
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.btn-primary:hover { opacity: 0.9; }

.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 200px;
  padding: 9px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.search-input:focus { border-color: #3b82f6; }
.select-filter {
  padding: 9px 12px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  outline: none;
  cursor: pointer;
}

.table-wrap {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  overflow: auto;
}
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

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
  font-size: 14px;
  color: #64748b;
}
.pagination button {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 14px;
}
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination button:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; }

.meta-info {
  margin-top: 12px;
  font-size: 13px;
  color: #94a3b8;
  text-align: right;
}
</style>
