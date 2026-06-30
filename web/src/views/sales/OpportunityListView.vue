<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSalesStore } from '@/stores/sales'
import api from '@/services/api'

const router = useRouter()
const route = useRoute()
const sales = useSalesStore()

const search = ref('')
const filterTahapan = ref((route.query.tahapan as string) || '')
const page = ref(1)

const TAHAPAN = ['Prospecting', 'Presentasi', 'Survey', 'Negosiasi', 'Penawaran', 'Won', 'Lost']
const TAHAPAN_COLOR: Record<string, string> = {
  Prospecting: '#3b82f6', Presentasi: '#8b5cf6', Survey: '#f59e0b',
  Negosiasi: '#f97316', Penawaran: '#06b6d4', Won: '#22c55e', Lost: '#ef4444',
}

onMounted(() => fetchData())

function fetchData() {
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  if (filterTahapan.value) params.tahapan = filterTahapan.value
  sales.fetchOpportunities(params)
}
function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

async function hapusOpportunity(id: number, nama: string) {
  if (!confirm(`Hapus opportunity "${nama}" ini?`)) return
  try {
    await api.delete(`/sales/opportunity/${id}`)
    fetchData()
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus opportunity')
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string) {
  return d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <button class="btn-back" @click="router.push('/sales')">← Sales</button>
        <h2>Opportunity</h2>
      </div>
    </div>

    <!-- Tahapan filter pills -->
    <div class="tahapan-pills">
      <button :class="['pill', { active: filterTahapan === '' }]" @click="filterTahapan = ''; doSearch()">Semua</button>
      <button
        v-for="t in TAHAPAN" :key="t"
        :class="['pill', { active: filterTahapan === t }]"
        :style="filterTahapan === t ? { background: TAHAPAN_COLOR[t], color: '#fff', borderColor: TAHAPAN_COLOR[t] } : {}"
        @click="filterTahapan = t; doSearch()"
      >{{ t }}</button>
    </div>

    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama opportunity..." class="input-search" />
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <div v-if="sales.error" class="alert-error">{{ sales.error }}</div>

    <div class="table-card">
      <div v-if="sales.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Lead / Perusahaan</th>
            <th>Layanan</th>
            <th>Sales</th>
            <th>Tahapan</th>
            <th>Estimasi Nilai</th>
            <th>Target Close</th>
            <th>QT</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!sales.oppList.length">
            <td colspan="9" class="empty">Tidak ada opportunity</td>
          </tr>
          <tr
            v-for="o in sales.oppList" :key="o.id_opportunity"
            class="row-link"
            @click="router.push(`/sales/opportunity/${o.id_opportunity}`)"
          >
            <td class="fw600">{{ o.nama_opportunity }}</td>
            <td>
              <div>{{ o.lead?.nama_prospek }}</div>
              <div class="text-gray text-sm">{{ o.lead?.nama_perusahaan || '' }}</div>
            </td>
            <td>
              <span v-if="o.layanan" class="kode-badge">{{ o.layanan.kode_layanan }}</span>
              <span v-else class="text-gray">—</span>
            </td>
            <td class="text-gray">{{ o.sales_pic?.nama_lengkap }}</td>
            <td>
              <span class="tahapan-chip"
                :style="{ background: (TAHAPAN_COLOR[o.tahapan] || '#94a3b8') + '20', color: TAHAPAN_COLOR[o.tahapan] || '#94a3b8' }">
                {{ o.tahapan }}
              </span>
            </td>
            <td class="fw600">{{ fmt(Number(o.estimasi_nilai)) }}</td>
            <td class="text-gray text-sm">{{ fmtDate(o.tgl_target_close || '') }}</td>
            <td class="center">{{ o._count?.quotations ?? 0 }}</td>
            <td @click.stop>
              <button class="btn-hapus" @click="hapusOpportunity(o.id_opportunity, o.nama_opportunity)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="sales.oppMeta.total_pages > 1" class="pagination">
        <button v-for="p in sales.oppMeta.total_pages" :key="p"
          :class="['page-btn', { active: p === sales.oppMeta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="sales.oppMeta.total">Total: {{ sales.oppMeta.total }} opportunity</div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header h2 { margin: 0; font-size: 22px; color: #0f172a; }

.tahapan-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.pill { padding: 6px 14px; border: 1.5px solid #e2e8f0; border-radius: 20px; font-size: 13px; font-weight: 600; background: #fff; color: #64748b; cursor: pointer; transition: all 0.15s; }
.pill.active { background: #1e40af; color: #fff; border-color: #1e40af; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; }
.input-search { flex: 1; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; }
.input-search:focus { border-color: #3b82f6; background: #fff; }
.btn-search { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; }

.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.center { text-align: center; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }

.kode-badge { background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }
.tahapan-chip { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }

.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
</style>
