<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesStore } from '@/stores/sales'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { fmtRupiahPenuh, fmtDateShort } from '@/composables/useFormat'

const router = useRouter()
const sales = useSalesStore()
const auth = useAuthStore()
const canForce = computed(() => auth.hasRole('Admin') || auth.hasRole('Director'))

const filterStatus = ref('')
const page = ref(1)

const STATUS_OPTIONS = ['Draft', 'Approved', 'Rejected']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Draft:    { bg: '#f1f5f9', color: '#64748b' },
  Approved: { bg: '#f0fdf4', color: '#15803d' },
  Rejected: { bg: '#fef2f2', color: '#dc2626' },
}

// Approve modal
const showApprove = ref(false)
const approveId = ref(0)
const approveNomor = ref('')
const approveForm = ref({ status_approval: 'Approved', id_approver: 0, catatan_approval: '' })
const approveSubmitting = ref(false)
const successMsg = ref('')

onMounted(async () => {
  await sales.fetchSalesList()
  if (sales.salesList.length) approveForm.value.id_approver = sales.salesList[0].id_karyawan
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value) params.status_approval = filterStatus.value
  sales.fetchQuotations(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function openApprove(id: number, nomor: string) {
  approveId.value = id
  approveNomor.value = nomor
  approveForm.value = { status_approval: 'Approved', id_approver: sales.salesList[0]?.id_karyawan || 0, catatan_approval: '' }
  showApprove.value = true
}

async function handleApprove() {
  approveSubmitting.value = true
  try {
    await sales.approveQuotation(approveId.value, approveForm.value)
    showApprove.value = false
    successMsg.value = `Quotation ${approveForm.value.status_approval}`
    setTimeout(() => successMsg.value = '', 3000)
    fetchData()
  } catch (e: any) {
    successMsg.value = e.response?.data?.message || 'Gagal proses approval'
    setTimeout(() => successMsg.value = '', 4000)
  } finally { approveSubmitting.value = false }
}

async function hapusQuotation(id: number, nomor: string) {
  if (!confirm(`Hapus quotation "${nomor}" ini?`)) return
  try {
    await api.delete(`/sales/quotation/${id}`)
    fetchData()
  } catch (e: any) {
    const msg = e.response?.data?.message || 'Gagal menghapus quotation'
    // Quotation non-Draft → tawarkan force delete (Admin/Director)
    if (e.response?.status === 400 && String(msg).includes('force delete')) {
      if (!canForce.value) { alert(msg + '\n\nHubungi Admin untuk force delete.'); return }
      const ketik = prompt(
        `⚠️ PERINGATAN — Quotation "${nomor}" akan DIHAPUS PERMANEN.\n\n` +
        `Kontrak yang terhubung TIDAK ikut terhapus, hanya dilepas dari quotation ini.\n\n` +
        `Ketik nomor quotation "${nomor}" untuk konfirmasi:`,
      )
      if (ketik === null) return
      if (ketik.trim() !== nomor) { alert('Nomor quotation tidak cocok — dibatalkan.'); return }
      try {
        const r = await api.delete(`/sales/quotation/${id}?force=true`)
        fetchData()
        alert(r.data?.message || 'Quotation dihapus (force)')
      } catch (e2: any) {
        alert(e2.response?.data?.message || 'Force delete gagal')
      }
      return
    }
    alert(msg)
  }
}

const fmt = fmtRupiahPenuh
const fmtDate = fmtDateShort
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <button class="btn-back" @click="router.push('/sales')">← Sales</button>
        <h2>Quotation</h2>
      </div>
    </div>

    <!-- Filter status -->
    <div class="filter-bar">
      <div class="status-pills">
        <button :class="['pill', { active: filterStatus === '' }]" @click="filterStatus = ''; doFilter()">Semua</button>
        <button
          v-for="s in STATUS_OPTIONS" :key="s"
          :class="['pill', { active: filterStatus === s }]"
          @click="filterStatus = s; doFilter()"
        >{{ s }}</button>
      </div>
    </div>

    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="sales.error" class="alert-error">{{ sales.error }}</div>

    <div class="table-card">
      <div v-if="sales.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>No. Quotation</th>
            <th>Opportunity</th>
            <th>Prospek</th>
            <th>Sales</th>
            <th>Tgl</th>
            <th>MRC</th>
            <th>OTC</th>
            <th>Status</th>
            <th>Aksi</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!sales.quotationList.length">
            <td colspan="10" class="empty">Tidak ada quotation</td>
          </tr>
          <tr v-for="q in sales.quotationList" :key="q.id_quotation">
            <td>
              <span
                class="nomor-link"
                @click="router.push(`/sales/quotation/${q.id_quotation}`)"
              >{{ q.nomor_quotation }}</span>
            </td>
            <td class="fw600">{{ q.opportunity?.nama_opportunity }}</td>
            <td class="text-gray">{{ q.opportunity?.lead?.nama_prospek }}</td>
            <td class="text-gray">{{ q.sales_pic?.nama_lengkap }}</td>
            <td class="text-gray text-sm">{{ fmtDate(q.tgl_quotation) }}</td>
            <td class="fw600">{{ fmt(Number(q.harga_mrc)) }}</td>
            <td>{{ fmt(Number(q.harga_otc)) }}</td>
            <td>
              <span
                class="status-badge"
                :style="{ background: STATUS_COLOR[q.status_approval]?.bg, color: STATUS_COLOR[q.status_approval]?.color }"
              >{{ q.status_approval }}</span>
            </td>
            <td>
              <button
                v-if="q.status_approval === 'Draft'"
                class="btn-approve"
                @click="openApprove(q.id_quotation, q.nomor_quotation)"
              >Approve</button>
              <span v-else class="approver-name">{{ q.approver?.nama_lengkap || '—' }}</span>
            </td>
            <td @click.stop>
              <button
                v-if="q.status_approval === 'Draft' || canForce"
                class="btn-hapus"
                @click="hapusQuotation(q.id_quotation, q.nomor_quotation)"
              >Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="sales.quotationMeta.total_pages > 1" class="pagination">
        <button
          v-for="p in sales.quotationMeta.total_pages" :key="p"
          :class="['page-btn', { active: p === sales.quotationMeta.page }]"
          @click="goPage(p)"
        >{{ p }}</button>
      </div>
      <div class="table-footer" v-if="sales.quotationMeta.total">
        Total: {{ sales.quotationMeta.total }} quotation
      </div>
    </div>

    <!-- Modal Approve -->
    <div v-if="showApprove" class="modal-overlay" @click.self="showApprove = false">
      <div class="modal">
        <h3>Approval — {{ approveNomor }}</h3>
        <div class="form-grid">
          <div class="field">
            <label>Keputusan</label>
            <select v-model="approveForm.status_approval">
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div class="field">
            <label>Approver</label>
            <select v-model="approveForm.id_approver">
              <option v-for="s in sales.salesList" :key="s.id_karyawan" :value="s.id_karyawan">
                {{ s.nama_lengkap }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="approveForm.catatan_approval" rows="3" placeholder="Opsional"></textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showApprove = false">Batal</button>
          <button class="btn-submit" @click="handleApprove" :disabled="approveSubmitting">
            {{ approveSubmitting ? 'Menyimpan...' : 'Konfirmasi' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header h2 { margin: 0; font-size: 22px; color: #0f172a; }

.filter-bar { margin-bottom: 16px; }
.status-pills { display: flex; gap: 8px; }
.pill { padding: 6px 16px; border: 1.5px solid #e2e8f0; border-radius: 20px; font-size: 13px; font-weight: 600; background: #fff; color: #64748b; cursor: pointer; }
.pill.active { background: #1e40af; color: #fff; border-color: #1e40af; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }
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

.nomor-link { color: #1d4ed8; font-weight: 700; cursor: pointer; text-decoration: underline; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.btn-approve { padding: 5px 12px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.approver-name { font-size: 12px; color: #64748b; }

.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
