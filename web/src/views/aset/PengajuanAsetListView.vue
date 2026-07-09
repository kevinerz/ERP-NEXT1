<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAsetStore } from '@/stores/aset'
import { useAuthStore } from '@/stores/auth'
import { fmtRupiah, fmtDateTime } from '@/composables/useFormat'
import api from '@/services/api'

const router = useRouter()
const aset = useAsetStore()
const auth = useAuthStore()

const filterStatus = ref('')
const page = ref(1)
const bisaApprove = computed(() => auth.hasRole('Director') || auth.hasRole('Manager_Ops'))

interface GudangOpt { id_gudang: number; kode_gudang: string; nama_gudang: string; kota?: string | null }
const gudangList = ref<GudangOpt[]>([])

const showModal = ref(false)
const submitting = ref(false)
const formError = ref('')
const form = ref({ nama_item: '', kategori: '', jumlah: 1, alasan: '', estimasi_harga: 0, id_gudang_tujuan: 0 })

onMounted(async () => {
  await fetchGudang()
  fetchData()
})

async function fetchGudang() {
  try { gudangList.value = (await api.get('/master/gudang')).data.data } catch {}
}

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value) params.status_pengajuan = filterStatus.value
  aset.fetchPengajuanList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function resetForm() {
  form.value = { nama_item: '', kategori: '', jumlah: 1, alasan: '', estimasi_harga: 0, id_gudang_tujuan: 0 }
}

async function handleSubmit() {
  if (!form.value.nama_item || !form.value.kategori || !form.value.alasan) {
    formError.value = 'Nama barang, kategori, dan alasan wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value }
    if (!payload.id_gudang_tujuan) delete payload.id_gudang_tujuan
    const result = await aset.createPengajuan(payload)
    showModal.value = false
    router.push(`/assets/pengajuan/${result.id_pengajuan}`)
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal membuat pengajuan' }
  finally { submitting.value = false }
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Diajukan:  { bg: '#fef9c3', color: '#a16207' },
  Disetujui: { bg: '#eff6ff', color: '#1d4ed8' },
  Ditolak:   { bg: '#fef2f2', color: '#dc2626' },
  Selesai:   { bg: '#f0fdf4', color: '#15803d' },
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Pengajuan Aset</h2>
        <p class="sub">Ajukan pembelian aset baru — perlu approval sebelum dibeli</p>
      </div>
      <button class="btn-primary" @click="showModal = true; resetForm(); formError = ''">+ Ajukan Aset Baru</button>
    </div>

    <div class="filters">
      <select v-model="filterStatus" @change="doFilter" class="filter-select">
        <option value="">Semua Status</option>
        <option value="Diajukan">Diajukan</option>
        <option value="Disetujui">Disetujui</option>
        <option value="Ditolak">Ditolak</option>
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
            <th>Nama Barang</th>
            <th>Jumlah</th>
            <th>Estimasi Harga</th>
            <th>Status</th>
            <th>Pemohon</th>
            <th>Tgl Diajukan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!aset.pengajuanList.length">
            <td colspan="7" class="empty">Belum ada pengajuan aset</td>
          </tr>
          <tr v-for="p in aset.pengajuanList" :key="p.id_pengajuan" class="row-link" @click="router.push(`/assets/pengajuan/${p.id_pengajuan}`)">
            <td class="kode">#{{ p.id_pengajuan }}</td>
            <td>
              <div class="fw600">{{ p.nama_item }}</div>
              <div class="text-gray text-sm">{{ p.kategori }}</div>
            </td>
            <td class="center">{{ p.jumlah }}</td>
            <td>{{ fmtRupiah(p.estimasi_harga) }}</td>
            <td>
              <span class="status-badge" :style="{ background: STATUS_COLOR[p.status_pengajuan]?.bg, color: STATUS_COLOR[p.status_pengajuan]?.color }">
                {{ p.status_pengajuan }}
              </span>
            </td>
            <td class="text-sm">{{ p.pemohon?.karyawan?.nama_lengkap || '—' }}</td>
            <td class="text-sm">{{ fmtDateTime(p.tgl_diajukan) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="aset.pengajuanMeta.total_pages > 1" class="pagination">
        <button v-for="p in aset.pengajuanMeta.total_pages" :key="p"
          :class="['page-btn', { active: p === aset.pengajuanMeta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="aset.pengajuanMeta.total">Total: {{ aset.pengajuanMeta.total }} pengajuan</div>
    </div>

    <!-- Modal Ajukan -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Ajukan Pembelian Aset Baru</h3>
        <p class="modal-desc" v-if="bisaApprove">Sebagai Director/Manager Ops, pengajuanmu sendiri tetap perlu disetujui pihak lain yang berwenang.</p>
        <div class="field">
          <label>Nama Barang <span class="req">*</span></label>
          <input v-model="form.nama_item" placeholder="Mikrotik hEX S, Switch 24 Port, ..." />
        </div>
        <div class="field">
          <label>Kategori <span class="req">*</span></label>
          <input v-model="form.kategori" placeholder="Router, Switch, ONU, ..." />
        </div>
        <div class="field">
          <label>Jumlah</label>
          <input v-model.number="form.jumlah" type="number" min="1" />
        </div>
        <div class="field">
          <label>Estimasi Harga (Rp)</label>
          <input v-model.number="form.estimasi_harga" type="number" min="0" placeholder="0" />
        </div>
        <div class="field">
          <label>Gudang Tujuan (opsional)</label>
          <select v-model.number="form.id_gudang_tujuan">
            <option :value="0">— Belum ditentukan —</option>
            <option v-for="g in gudangList" :key="g.id_gudang" :value="g.id_gudang">[{{ g.kode_gudang }}] {{ g.nama_gudang }}</option>
          </select>
        </div>
        <div class="field">
          <label>Alasan / Justifikasi <span class="req">*</span></label>
          <textarea v-model="form.alasan" rows="3" placeholder="Kenapa barang ini dibutuhkan..."></textarea>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Mengajukan...' : 'Ajukan' }}
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
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.center { text-align: center; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 8px; font-size: 18px; color: #0f172a; }
.modal-desc { margin: 0 0 18px; font-size: 12px; color: #94a3b8; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
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
