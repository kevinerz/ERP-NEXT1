<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { printInvoiceDoc } from '@/composables/usePrint'
import { fmtRupiah, fmtDate, statusLabel } from '@/composables/useFormat'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()
const finance = useFinanceStore()

const id = Number(route.params.id)
const loadError = ref('')

// Mekari sync
const mekariMode = ref<'live' | 'simulasi' | ''>('')
const syncing = ref(false)
const MEKARI_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Belum:      { bg: '#f1f5f9', color: '#64748b' },
  Tersinkron: { bg: '#f0fdf4', color: '#15803d' },
  Simulasi:   { bg: '#fefce8', color: '#a16207' },
  Gagal:      { bg: '#fef2f2', color: '#dc2626' },
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Draft:       { bg: '#f1f5f9', color: '#64748b' },
  Terkirim:    { bg: '#eff6ff', color: '#1d4ed8' },
  Sebagian:    { bg: '#fff7ed', color: '#c2410c' },
  Lunas:       { bg: '#f0fdf4', color: '#15803d' },
  Jatuh_Tempo: { bg: '#fef2f2', color: '#dc2626' },
  Batal:       { bg: '#e2e8f0', color: '#475569' },
}
const METODE_LIST = ['Transfer', 'Tunai', 'Virtual Account', 'Cek', 'Lainnya']

const inv = computed(() => finance.currentInvoice)
const sisa = computed(() => (Number(inv.value?.total) || 0) - (Number(inv.value?.jumlah_dibayar) || 0))
const canBayar = computed(() => inv.value && inv.value.status !== 'Lunas' && inv.value.status !== 'Batal')

const showBayarModal = ref(false)
const submitting = ref(false)
const processing = ref(false)
const formError = ref('')
const bayarForm = ref({
  tgl_bayar: new Date().toISOString().slice(0, 10),
  jumlah: 0,
  metode: 'Transfer',
  referensi: '',
  catatan: '',
})

onMounted(async () => {
  await load()
  // Kalau gagal dicek, anggap simulasi (asumsi paling aman — tombol & konfirmasi
  // jadi konsisten, tidak menyiratkan "live" padahal statusnya tak diketahui)
  try { mekariMode.value = (await api.get('/mekari/status')).data.data.mode } catch { mekariMode.value = 'simulasi' }
})

async function load() {
  loadError.value = ''
  try {
    await finance.fetchOne(id)
  } catch (err: any) {
    loadError.value = err?.response?.data?.message ?? 'Gagal memuat invoice'
  }
}

async function handleSyncMekari() {
  if (!inv.value) return
  const label = mekariMode.value === 'live' ? 'Mekari Jurnal' : 'Mekari (simulasi)'
  if (!confirm(`Sinkron invoice ${inv.value.nomor_invoice} ke ${label}?`)) return
  syncing.value = true
  try {
    await api.post(`/mekari/sync/invoice/${id}`)
    await load()
  } catch (err: any) {
    alert(err?.response?.data?.message ?? 'Gagal sinkron ke Mekari')
  } finally {
    syncing.value = false
  }
}

async function handleKirim() {
  if (!confirm('Kirim invoice ini? Status akan berubah menjadi Terkirim.')) return
  processing.value = true
  try {
    await finance.kirim(id)
  } catch (err: any) {
    alert(err?.response?.data?.message ?? 'Gagal mengirim invoice')
  } finally {
    processing.value = false
  }
}

async function handleBatal() {
  if (!confirm('Batalkan invoice ini?')) return
  processing.value = true
  try {
    await finance.batal(id)
  } catch (err: any) {
    alert(err?.response?.data?.message ?? 'Gagal membatalkan invoice')
  } finally {
    processing.value = false
  }
}

async function handleHapus() {
  if (!inv.value) return
  if (!confirm(`Hapus invoice ${inv.value.nomor_invoice}?`)) return
  processing.value = true
  try {
    await finance.remove(id)
    router.push('/finance/invoice')
  } catch (err: any) {
    alert(err?.response?.data?.message ?? 'Gagal menghapus invoice')
  } finally {
    processing.value = false
  }
}

function openBayar() {
  bayarForm.value = {
    tgl_bayar: new Date().toISOString().slice(0, 10),
    jumlah: sisa.value,
    metode: 'Transfer',
    referensi: '',
    catatan: '',
  }
  formError.value = ''
  showBayarModal.value = true
}

async function handleBayar() {
  if (!bayarForm.value.tgl_bayar || !bayarForm.value.jumlah) {
    formError.value = 'Tanggal bayar dan jumlah wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const payload: any = { ...bayarForm.value }
    if (!payload.referensi) delete payload.referensi
    if (!payload.catatan) delete payload.catatan
    await finance.addPembayaran(id, payload)
    showBayarModal.value = false
    await load()
  } catch (err: any) {
    formError.value = err?.response?.data?.message ?? 'Gagal mencatat pembayaran'
  } finally {
    submitting.value = false
  }
}

async function handleHapusPembayaran(idPembayaran: number) {
  if (!confirm('Hapus pembayaran ini?')) return
  try {
    await finance.removePembayaran(idPembayaran)
    await load()
  } catch (err: any) {
    alert(err?.response?.data?.message ?? 'Gagal menghapus pembayaran')
  }
}

</script>

<template>
  <div class="page">
    <div class="breadcrumb">
      <span class="link" @click="router.push('/finance')">Finance</span>
      <span class="sep">›</span>
      <span class="link" @click="router.push('/finance/invoice')">Invoice</span>
      <span class="sep">›</span>
      <span>{{ inv?.nomor_invoice || '...' }}</span>
    </div>

    <div v-if="finance.loading && !inv" class="loading-full">Memuat...</div>
    <div v-else-if="loadError" class="alert-error">{{ loadError }}</div>
    <template v-else-if="inv">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <div class="nomor">{{ inv.nomor_invoice }}</div>
          <h2>{{ inv.site?.pelanggan?.nama_pelanggan }}</h2>
          <div class="sub-row">
            <span class="sub">Periode {{ inv.periode }}</span>
            <span class="status-badge"
              :style="{ background: STATUS_COLOR[inv.status]?.bg, color: STATUS_COLOR[inv.status]?.color }">
              {{ statusLabel(inv.status) }}
            </span>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-print" @click="printInvoiceDoc(inv)">🖨 Cetak</button>
          <button v-if="inv.status === 'Draft'" class="btn-edit" :disabled="processing" @click="handleKirim">Kirim</button>
          <button v-if="inv.status !== 'Lunas' && inv.status !== 'Batal'" class="btn-danger" :disabled="processing" @click="handleBatal">Batal</button>
          <button v-if="inv.status === 'Draft' && !(inv.pembayaran?.length)" class="btn-danger" :disabled="processing" @click="handleHapus">Hapus</button>
          <button
            v-if="inv.status !== 'Draft' && inv.status !== 'Batal' && !inv.mekari_uid"
            class="btn-mekari"
            :disabled="syncing"
            @click="handleSyncMekari"
          >{{ syncing ? 'Sinkron…' : `⇅ Sinkron Mekari${mekariMode === 'simulasi' ? ' (simulasi)' : ''}` }}</button>
          <span
            v-else-if="inv.mekari_uid"
            class="mekari-badge"
            :style="{ background: (MEKARI_STATUS_COLOR[inv.mekari_status] || MEKARI_STATUS_COLOR.Belum).bg, color: (MEKARI_STATUS_COLOR[inv.mekari_status] || MEKARI_STATUS_COLOR.Belum).color }"
            :title="`Mekari UID: ${inv.mekari_uid}`"
          >Mekari: {{ inv.mekari_status }}</span>
        </div>
      </div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-item">
          <div class="info-label">Site</div>
          <div class="info-value">{{ inv.site?.kode_site }} — {{ inv.site?.nama_site }}</div>
        </div>
        <div class="info-item" v-if="inv.kontrak">
          <div class="info-label">Kontrak</div>
          <div class="info-value">
            <span class="qt-link" @click="router.push(`/contracts/${inv.kontrak.id_kontrak}`)">{{ inv.kontrak.nomor_kontrak }}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">Tgl Invoice</div>
          <div class="info-value">{{ fmtDate(inv.tgl_invoice) }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Jatuh Tempo</div>
          <div class="info-value">{{ fmtDate(inv.tgl_jatuh_tempo) }}</div>
        </div>
      </div>

      <!-- Nominal -->
      <div class="amount-card">
        <div class="amount-row">
          <span class="a-label">Subtotal</span>
          <span class="a-val">{{ fmtRupiah(inv.subtotal) }}</span>
        </div>
        <div class="amount-row">
          <span class="a-label">PPN {{ Number(inv.ppn_persen) }}%</span>
          <span class="a-val">{{ fmtRupiah(inv.ppn_nominal) }}</span>
        </div>
        <div class="amount-row total">
          <span class="a-label">Total</span>
          <span class="a-val">{{ fmtRupiah(inv.total) }}</span>
        </div>
        <div class="amount-row">
          <span class="a-label">Sudah Dibayar</span>
          <span class="a-val paid">{{ fmtRupiah(inv.jumlah_dibayar) }}</span>
        </div>
        <div class="amount-row sisa-row">
          <span class="a-label">Sisa Tagihan</span>
          <span class="a-val" :class="{ danger: sisa > 0 }">{{ fmtRupiah(sisa) }}</span>
        </div>
      </div>

      <div class="desc-box" v-if="inv.catatan">{{ inv.catatan }}</div>

      <!-- Pembayaran -->
      <div class="section-head">
        <div class="section-title">Riwayat Pembayaran</div>
        <button v-if="canBayar" class="btn-add" @click="openBayar">+ Catat Pembayaran</button>
      </div>
      <div class="pay-list" v-if="inv.pembayaran?.length">
        <div v-for="p in inv.pembayaran" :key="p.id_pembayaran" class="pay-item">
          <div class="pay-main">
            <div class="pay-amount">{{ fmtRupiah(p.jumlah) }}</div>
            <div class="pay-meta">
              <span class="pay-metode">{{ p.metode }}</span>
              <span class="pay-sep">·</span>
              <span>{{ fmtDate(p.tgl_bayar) }}</span>
              <template v-if="p.referensi"><span class="pay-sep">·</span><span>Ref: {{ p.referensi }}</span></template>
            </div>
            <div class="pay-by" v-if="p.user?.karyawan?.nama_lengkap">oleh {{ p.user.karyawan.nama_lengkap }}</div>
            <div class="pay-catatan" v-if="p.catatan">{{ p.catatan }}</div>
          </div>
          <button class="mini-btn hapus" @click="handleHapusPembayaran(p.id_pembayaran)">Hapus</button>
        </div>
      </div>
      <div v-else class="pay-empty">Belum ada pembayaran</div>

    </template>

    <!-- Modal Catat Pembayaran -->
    <div v-if="showBayarModal" class="modal-overlay" @click.self="showBayarModal = false">
      <div class="modal">
        <h3>Catat Pembayaran</h3>
        <p class="hint-text">Sisa tagihan: <strong>{{ fmtRupiah(sisa) }}</strong></p>
        <div class="form-grid">
          <div class="field">
            <label>Tanggal Bayar <span class="req">*</span></label>
            <input v-model="bayarForm.tgl_bayar" type="date" />
          </div>
          <div class="field">
            <label>Jumlah (Rp) <span class="req">*</span></label>
            <input v-model.number="bayarForm.jumlah" type="number" min="0" />
          </div>
          <div class="field">
            <label>Metode</label>
            <select v-model="bayarForm.metode">
              <option v-for="m in METODE_LIST" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="field">
            <label>Referensi</label>
            <input v-model="bayarForm.referensi" placeholder="No. transaksi (opsional)" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="bayarForm.catatan" rows="2" placeholder="Catatan (opsional)..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showBayarModal = false">Batal</button>
          <button class="btn-submit" @click="handleBayar" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan Pembayaran' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 900px; }
.breadcrumb { font-size: 13px; color: #64748b; margin-bottom: 16px; }
.link { cursor: pointer; color: #3b82f6; }
.link:hover { text-decoration: underline; }
.sep { margin: 0 6px; }
.loading-full { padding: 60px; text-align: center; color: #94a3b8; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
.header-left .nomor { font-size: 13px; font-weight: 700; color: #3b82f6; margin-bottom: 4px; }
.header-left h2 { margin: 0 0 8px; font-size: 22px; color: #0f172a; }
.sub-row { display: flex; align-items: center; gap: 8px; }
.sub { font-size: 14px; color: #64748b; }
.status-badge { padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-print { padding: 9px 18px; background: #f0fdf4; color: #15803d; border: 1.5px solid #bbf7d0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-print:hover { background: #dcfce7; }
.btn-edit { padding: 9px 18px; background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-edit:disabled, .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { padding: 9px 18px; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-mekari { padding: 9px 18px; background: #eef2ff; color: #4338ca; border: 1.5px solid #c7d2fe; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-mekari:hover:not(:disabled) { background: #e0e7ff; }
.btn-mekari:disabled { opacity: 0.5; cursor: not-allowed; }
.mekari-badge { display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; }

.info-bar { display: flex; flex-wrap: wrap; gap: 0; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; margin-bottom: 16px; }
.info-item { flex: 0 0 auto; min-width: 140px; padding: 8px 20px 8px 0; border-right: 1px solid #f1f5f9; margin-right: 20px; margin-bottom: 8px; }
.info-item:last-child { border-right: none; }
.info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px; }
.info-value { font-size: 14px; color: #0f172a; font-weight: 600; }
.qt-link { color: #1d4ed8; cursor: pointer; font-weight: 700; }
.qt-link:hover { text-decoration: underline; }

.amount-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; margin-bottom: 16px; }
.amount-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
.amount-row:last-child { border-bottom: none; }
.a-label { font-size: 14px; color: #64748b; }
.a-val { font-size: 14px; font-weight: 600; color: #0f172a; }
.amount-row.total .a-label, .amount-row.total .a-val { font-size: 16px; font-weight: 800; color: #1e40af; }
.a-val.paid { color: #15803d; }
.amount-row.sisa-row .a-label { font-weight: 700; }
.a-val.danger { color: #dc2626; font-weight: 800; }

.desc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #475569; margin-bottom: 16px; white-space: pre-wrap; }

.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.section-title { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.btn-add { padding: 7px 14px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.pay-empty { color: #94a3b8; font-size: 13px; }
.pay-list { display: flex; flex-direction: column; gap: 8px; }
.pay-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; }
.pay-amount { font-size: 15px; font-weight: 700; color: #15803d; }
.pay-meta { font-size: 12px; color: #64748b; margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap; }
.pay-metode { font-weight: 600; color: #1d4ed8; }
.pay-sep { color: #cbd5e1; }
.pay-by { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.pay-catatan { font-size: 12px; color: #475569; margin-top: 4px; }
.mini-btn { padding: 5px 10px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
.mini-btn.hapus { background: #fef2f2; color: #dc2626; }
.mini-btn.hapus:hover { background: #fee2e2; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 16px; font-size: 18px; color: #0f172a; }
.hint-text { font-size: 13px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
.hint-text strong { color: #dc2626; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
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
