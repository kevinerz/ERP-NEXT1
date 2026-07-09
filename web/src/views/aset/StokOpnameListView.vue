<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAsetStore } from '@/stores/aset'
import { fmtDateTime } from '@/composables/useFormat'
import api from '@/services/api'

const router = useRouter()
const aset = useAsetStore()

const filterGudang = ref(0)
const filterStatus = ref('')
const page = ref(1)

interface GudangOpt { id_gudang: number; kode_gudang: string; nama_gudang: string; kota?: string | null; is_aktif: boolean }
const gudangList = ref<GudangOpt[]>([])

const showModal = ref(false)
const formGudang = ref(0)
const formCatatan = ref('')
const submitting = ref(false)
const formError = ref('')

onMounted(async () => {
  await fetchGudang()
  fetchData()
})

async function fetchGudang() {
  try {
    const r = await api.get('/master/gudang')
    gudangList.value = r.data.data
  } catch {}
}

function fetchData() {
  const params: any = { page: page.value }
  if (filterGudang.value) params.id_gudang = filterGudang.value
  if (filterStatus.value) params.status_opname = filterStatus.value
  aset.fetchOpnameList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

async function mulaiOpname() {
  if (!formGudang.value) { formError.value = 'Pilih gudang dulu'; return }
  submitting.value = true; formError.value = ''
  try {
    const result = await aset.createOpname({ id_gudang: formGudang.value, catatan: formCatatan.value || undefined })
    showModal.value = false
    router.push(`/assets/stok-opname/${result.id_opname}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat sesi opname' }
  finally { submitting.value = false }
}

function persenSelesai(o: any) {
  const total = o._count?.items || 0
  if (!total) return 0
  return Math.round(((o.jumlah_ditemukan || 0) / total) * 100)
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Stok Opname</h2>
        <p class="sub">Audit fisik aset per gudang — cocokkan data sistem dengan barang di lapangan</p>
      </div>
      <button class="btn-primary" @click="showModal = true; formGudang = 0; formCatatan = ''; formError = ''">+ Mulai Opname</button>
    </div>

    <div class="filters">
      <select v-model.number="filterGudang" @change="doFilter" class="filter-select">
        <option :value="0">Semua Gudang</option>
        <option v-for="g in gudangList" :key="g.id_gudang" :value="g.id_gudang">[{{ g.kode_gudang }}] {{ g.nama_gudang }}</option>
      </select>
      <select v-model="filterStatus" @change="doFilter" class="filter-select">
        <option value="">Semua Status</option>
        <option value="Berjalan">Berjalan</option>
        <option value="Selesai">Selesai</option>
      </select>
    </div>

    <div v-if="aset.error" class="alert-error">{{ aset.error }}</div>

    <div class="table-card">
      <div v-if="aset.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>#</th>
            <th>Gudang</th>
            <th>Status</th>
            <th>Progres</th>
            <th>Dibuat oleh</th>
            <th>Tgl Mulai</th>
            <th>Tgl Selesai</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!aset.opnameList.length">
            <td colspan="7" class="empty">Belum ada sesi stok opname</td>
          </tr>
          <tr v-for="o in aset.opnameList" :key="o.id_opname" class="row-link" @click="router.push(`/assets/stok-opname/${o.id_opname}`)">
            <td class="kode">#{{ o.id_opname }}</td>
            <td>{{ o.gudang?.nama_gudang }}</td>
            <td>
              <span class="status-badge" :class="o.status_opname === 'Selesai' ? 'st-selesai' : 'st-berjalan'">
                {{ o.status_opname }}
              </span>
            </td>
            <td>
              <div class="progress-bar"><div class="progress-fill" :style="{ width: persenSelesai(o) + '%' }"></div></div>
              <div class="text-sm text-gray">{{ o.jumlah_ditemukan || 0 }} / {{ o._count?.items || 0 }} ({{ persenSelesai(o) }}%)</div>
            </td>
            <td>{{ o.user_buat?.karyawan?.nama_lengkap || '—' }}</td>
            <td class="text-sm">{{ fmtDateTime(o.tgl_mulai) }}</td>
            <td class="text-sm">{{ o.tgl_selesai ? fmtDateTime(o.tgl_selesai) : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="aset.opnameMeta.total_pages > 1" class="pagination">
        <button v-for="p in aset.opnameMeta.total_pages" :key="p"
          :class="['page-btn', { active: p === aset.opnameMeta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="aset.opnameMeta.total">Total: {{ aset.opnameMeta.total }} sesi</div>
    </div>

    <!-- Modal Mulai Opname -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Mulai Sesi Stok Opname</h3>
        <p class="modal-desc">Sistem akan mengambil snapshot semua aset berstatus "Di Gudang" di gudang yang dipilih saat ini juga.</p>
        <div class="field">
          <label>Gudang <span class="req">*</span></label>
          <select v-model.number="formGudang">
            <option :value="0">— Pilih gudang —</option>
            <option v-for="g in gudangList" :key="g.id_gudang" :value="g.id_gudang">
              [{{ g.kode_gudang }}] {{ g.nama_gudang }}{{ g.kota ? ' — ' + g.kota : '' }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Catatan (opsional)</label>
          <textarea v-model="formCatatan" rows="2" placeholder="Mis. opname rutin akhir bulan..."></textarea>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="mulaiOpname" :disabled="submitting">
            {{ submitting ? 'Memulai...' : 'Mulai Opname' }}
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

.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: top; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.kode { font-weight: 700; color: #1d4ed8; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.st-berjalan { background: #fef9c3; color: #a16207; }
.st-selesai { background: #f0fdf4; color: #15803d; }
.progress-bar { width: 120px; height: 6px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
.progress-fill { height: 100%; background: #3b82f6; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 460px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 8px; font-size: 18px; color: #0f172a; }
.modal-desc { margin: 0 0 18px; font-size: 13px; color: #64748b; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
