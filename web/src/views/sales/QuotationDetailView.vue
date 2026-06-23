<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useSalesStore } from '@/stores/sales'

const route  = useRoute()
const router = useRouter()
const sales  = useSalesStore()

const id      = Number(route.params.id)
const qt      = ref<any>(null)
const loading = ref(true)
const error   = ref('')

// Approve modal
const showApprove    = ref(false)
const approveForm    = ref({ status_approval: 'Approved', id_approver: 0, catatan_approval: '' })
const approveSubmit  = ref(false)
const successMsg     = ref('')

onMounted(async () => {
  await sales.fetchSalesList()
  if (sales.salesList.length) approveForm.value.id_approver = sales.salesList[0].id_karyawan
  await fetchQuotation()
})

async function fetchQuotation() {
  loading.value = true
  error.value   = ''
  try {
    const r = await api.get(`/sales/quotation/${id}`)
    qt.value = r.data.data
  } catch {
    error.value = 'Quotation tidak ditemukan'
  } finally { loading.value = false }
}

function openApprove() {
  approveForm.value = {
    status_approval: 'Approved',
    id_approver: sales.salesList[0]?.id_karyawan || 0,
    catatan_approval: '',
  }
  showApprove.value = true
}

async function handleApprove() {
  approveSubmit.value = true
  try {
    await sales.approveQuotation(id, approveForm.value)
    showApprove.value = false
    successMsg.value  = `Quotation ${approveForm.value.status_approval}`
    setTimeout(() => successMsg.value = '', 3000)
    await fetchQuotation()
  } catch {
    successMsg.value = 'Gagal proses approval'
  } finally { approveSubmit.value = false }
}

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Draft:    { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Approved: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  Rejected: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const statusStyle = computed(() => STATUS_STYLE[qt.value?.status_approval] || STATUS_STYLE['Draft'])

function fmt(n: number | string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0)
}
function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtDateTime(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const prospekName = computed(() => {
  const lead = qt.value?.opportunity?.lead
  if (!lead) return '—'
  return lead.nama_perusahaan
    ? `${lead.nama_prospek} (${lead.nama_perusahaan})`
    : lead.nama_prospek || '—'
})
const kodeProspek = computed(() => null)
</script>

<template>
  <div class="page">

    <!-- Back -->
    <button class="btn-back" @click="router.push('/sales/quotation')">← Kembali ke Quotation</button>

    <!-- Loading / Error -->
    <div v-if="loading" class="state-box">Memuat quotation...</div>
    <div v-else-if="error" class="state-box error">{{ error }}</div>

    <template v-else-if="qt">
      <!-- Header -->
      <div class="header-row">
        <div class="header-left">
          <div class="nomor">{{ qt.nomor_quotation }}</div>
          <span class="status-badge"
            :style="{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }">
            {{ qt.status_approval }}
          </span>
        </div>
        <div class="header-actions" v-if="qt.status_approval === 'Draft'">
          <button class="btn-approve" @click="openApprove">✓ Approve / Reject</button>
        </div>
      </div>

      <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>

      <!-- Info bar -->
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Opportunity</div>
          <div class="info-value">{{ qt.opportunity?.nama_opportunity || '—' }}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Prospek / Pelanggan</div>
          <div class="info-value">{{ prospekName }}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Layanan</div>
          <div class="info-value">{{ qt.opportunity?.layanan?.nama_layanan || '—' }}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Sales PIC</div>
          <div class="info-value">
            {{ qt.sales_pic?.nama_lengkap || '—' }}
            <span v-if="qt.sales_pic?.jabatan" class="sub-text">{{ qt.sales_pic.jabatan }}</span>
          </div>
        </div>
        <div class="info-card">
          <div class="info-label">Tanggal Quotation</div>
          <div class="info-value">{{ fmtDate(qt.tgl_quotation) }}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Berlaku Sampai</div>
          <div class="info-value" :class="{ 'text-warn': qt.tgl_berlaku_sampai && new Date(qt.tgl_berlaku_sampai) < new Date() }">
            {{ fmtDate(qt.tgl_berlaku_sampai) }}
          </div>
        </div>
      </div>

      <!-- Pricing -->
      <div class="section-title">Harga Penawaran</div>
      <div class="pricing-row">
        <div class="price-card mrc">
          <div class="price-label">Monthly Recurring Cost (MRC)</div>
          <div class="price-value">{{ fmt(qt.harga_mrc) }}</div>
          <div class="price-sub">per bulan</div>
        </div>
        <div class="price-card otc">
          <div class="price-label">One-Time Cost (OTC)</div>
          <div class="price-value">{{ fmt(qt.harga_otc) }}</div>
          <div class="price-sub">biaya satu kali</div>
        </div>
      </div>

      <!-- Catatan -->
      <template v-if="qt.catatan">
        <div class="section-title">Catatan</div>
        <div class="note-box">{{ qt.catatan }}</div>
      </template>

      <!-- Approval section (if not Draft) -->
      <template v-if="qt.status_approval !== 'Draft'">
        <div class="section-title">Approval</div>
        <div class="approval-card" :class="qt.status_approval === 'Approved' ? 'approved' : 'rejected'">
          <div class="approval-header">
            <span class="approval-icon">{{ qt.status_approval === 'Approved' ? '✓' : '✗' }}</span>
            <span class="approval-status">{{ qt.status_approval }}</span>
            <span class="approval-time">{{ fmtDateTime(qt.tgl_approval) }}</span>
          </div>
          <div class="approval-body">
            <div class="approval-by">
              <span class="al">Approver:</span>
              {{ qt.approver?.nama_lengkap || '—' }}
              <span v-if="qt.approver?.jabatan" class="sub-text">{{ qt.approver.jabatan }}</span>
            </div>
            <div v-if="qt.catatan_approval" class="approval-note">
              <span class="al">Catatan:</span> {{ qt.catatan_approval }}
            </div>
          </div>
        </div>
      </template>

      <!-- Meta -->
      <div class="meta-row">
        <span>Dibuat: {{ fmtDateTime(qt.created_at) }}</span>
        <span>Diperbarui: {{ fmtDateTime(qt.updated_at) }}</span>
      </div>
    </template>

    <!-- Modal Approve -->
    <div v-if="showApprove" class="modal-overlay" @click.self="showApprove = false">
      <div class="modal">
        <h3>Approval — {{ qt?.nomor_quotation }}</h3>
        <div class="field">
          <label>Keputusan</label>
          <div class="radio-row">
            <label class="radio-opt" :class="{ active: approveForm.status_approval === 'Approved' }">
              <input type="radio" v-model="approveForm.status_approval" value="Approved" />
              ✓ Approved
            </label>
            <label class="radio-opt rejected" :class="{ active: approveForm.status_approval === 'Rejected' }">
              <input type="radio" v-model="approveForm.status_approval" value="Rejected" />
              ✗ Rejected
            </label>
          </div>
        </div>
        <div class="field">
          <label>Approver</label>
          <select v-model="approveForm.id_approver">
            <option v-for="s in sales.salesList" :key="s.id_karyawan" :value="s.id_karyawan">
              {{ s.nama_lengkap }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Catatan Approval</label>
          <textarea v-model="approveForm.catatan_approval" rows="3" placeholder="Opsional..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showApprove = false">Batal</button>
          <button class="btn-submit" @click="handleApprove" :disabled="approveSubmit">
            {{ approveSubmit ? 'Menyimpan...' : 'Konfirmasi' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 900px; }

.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 20px; display: inline-block; }
.btn-back:hover { text-decoration: underline; }

.state-box { padding: 60px; text-align: center; color: #94a3b8; font-size: 15px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.state-box.error { color: #dc2626; }

/* Header */
.header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.header-left { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.nomor { font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
.status-badge { padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; }
.btn-approve { padding: 9px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
.btn-approve:hover { opacity: 0.9; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 16px; }

/* Info grid */
.info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
.info-card { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.info-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
.info-value { font-size: 14px; font-weight: 600; color: #0f172a; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sub-text { font-size: 12px; color: #64748b; font-weight: 400; display: block; }
.kode-chip { background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }
.text-warn { color: #b45309; }

/* Pricing */
.section-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.pricing-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.price-card { border-radius: 12px; padding: 20px 24px; }
.price-card.mrc { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: #fff; }
.price-card.otc { background: #fff; border: 2px solid #e2e8f0; color: #0f172a; }
.price-label { font-size: 12px; font-weight: 600; opacity: 0.8; margin-bottom: 8px; }
.price-card.otc .price-label { color: #64748b; }
.price-value { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
.price-sub { font-size: 12px; opacity: 0.7; margin-top: 4px; }
.price-card.otc .price-sub { color: #94a3b8; }

/* Catatan */
.note-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 16px; font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 24px; }

/* Approval */
.approval-card { border-radius: 12px; padding: 18px 20px; margin-bottom: 24px; }
.approval-card.approved { background: #f0fdf4; border: 1.5px solid #bbf7d0; }
.approval-card.rejected { background: #fef2f2; border: 1.5px solid #fecaca; }
.approval-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.approval-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; }
.approved .approval-icon { background: #15803d; color: #fff; }
.rejected .approval-icon { background: #dc2626; color: #fff; }
.approval-status { font-size: 15px; font-weight: 700; }
.approved .approval-status { color: #15803d; }
.rejected .approval-status { color: #dc2626; }
.approval-time { font-size: 12px; color: #94a3b8; margin-left: auto; }
.approval-body { display: flex; flex-direction: column; gap: 6px; }
.approval-by { font-size: 14px; color: #374151; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.approval-note { font-size: 13px; color: #64748b; }
.al { font-weight: 700; color: #374151; }

/* Meta */
.meta-row { display: flex; gap: 24px; font-size: 12px; color: #94a3b8; padding-top: 8px; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 440px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 22px; font-size: 18px; color: #0f172a; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.radio-row { display: flex; gap: 10px; }
.radio-opt { display: flex; align-items: center; gap: 6px; padding: 9px 16px; border: 1.5px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: #64748b; background: #f8fafc; flex: 1; justify-content: center; }
.radio-opt.active { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.radio-opt.rejected.active { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
.radio-opt input { display: none; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 700px) {
  .info-grid { grid-template-columns: 1fr 1fr; }
  .pricing-row { grid-template-columns: 1fr; }
}
</style>
