<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsetStore } from '@/stores/aset'
import { useAuthStore } from '@/stores/auth'
import { fmtRupiah, fmtDateTime } from '@/composables/useFormat'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()
const aset = useAsetStore()
const auth = useAuthStore()

const id = Number(route.params.id)
const bisaApprove = computed(() => auth.hasRole('Director') || auth.hasRole('Manager_Ops'))

const processing = ref(false)
const catatanApproval = ref('')

interface GudangOpt { id_gudang: number; kode_gudang: string; nama_gudang: string }
const gudangList = ref<GudangOpt[]>([])
const showSelesaiForm = ref(false)
const formSelesai = ref({ serial_number: '', harga_aktual: 0, id_gudang: 0, tgl_terima: new Date().toISOString().slice(0, 10) })
const formError = ref('')

onMounted(async () => {
  await Promise.all([load(), fetchGudang()])
})

async function load() { await aset.fetchPengajuanOne(id) }
async function fetchGudang() {
  try { gudangList.value = (await api.get('/master/gudang')).data.data } catch {}
}

const p = computed(() => aset.pengajuanCurrent)

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Diajukan:  { bg: '#fef9c3', color: '#a16207' },
  Disetujui: { bg: '#eff6ff', color: '#1d4ed8' },
  Ditolak:   { bg: '#fef2f2', color: '#dc2626' },
  Selesai:   { bg: '#f0fdf4', color: '#15803d' },
}

async function approve(status: 'Disetujui' | 'Ditolak') {
  if (!confirm(`${status} pengajuan "${p.value?.nama_item}" ini?`)) return
  processing.value = true
  try {
    await aset.approvePengajuan(id, { status_approval: status, catatan_approval: catatanApproval.value || undefined })
    await load()
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal memproses approval') }
  finally { processing.value = false }
}

function openSelesaiForm() {
  formSelesai.value.id_gudang = p.value?.id_gudang_tujuan || gudangList.value[0]?.id_gudang || 0
  formSelesai.value.harga_aktual = Number(p.value?.estimasi_harga) || 0
  showSelesaiForm.value = true
  formError.value = ''
}

async function submitSelesai() {
  processing.value = true; formError.value = ''
  try {
    const payload: any = { ...formSelesai.value }
    if (!payload.serial_number) delete payload.serial_number
    if (!payload.id_gudang) delete payload.id_gudang
    await aset.selesaikanPengajuan(id, payload)
    showSelesaiForm.value = false
    await load()
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyelesaikan pengajuan' }
  finally { processing.value = false }
}

async function batalkan() {
  if (!confirm('Batalkan pengajuan ini?')) return
  try {
    await aset.removePengajuan(id)
    router.push('/assets/pengajuan')
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal membatalkan pengajuan') }
}
</script>

<template>
  <div class="page" v-if="p">
    <div class="breadcrumb"><span @click="router.push('/assets/pengajuan')">Pengajuan Aset</span> › #{{ p.id_pengajuan }}</div>
    <div class="page-header">
      <div>
        <h2>{{ p.nama_item }}</h2>
        <span class="status-badge" :style="{ background: STATUS_COLOR[p.status_pengajuan]?.bg, color: STATUS_COLOR[p.status_pengajuan]?.color }">
          {{ p.status_pengajuan }}
        </span>
      </div>
      <div class="actions">
        <button v-if="p.status_pengajuan === 'Diajukan'" class="btn-secondary" @click="batalkan">Batalkan</button>
        <template v-if="p.status_pengajuan === 'Diajukan' && bisaApprove">
          <button class="btn-reject" @click="approve('Ditolak')" :disabled="processing">Tolak</button>
          <button class="btn-approve" @click="approve('Disetujui')" :disabled="processing">Setujui</button>
        </template>
        <button v-if="p.status_pengajuan === 'Disetujui'" class="btn-primary" @click="openSelesaiForm">📦 Barang Sudah Tiba</button>
      </div>
    </div>

    <div class="info-card">
      <div class="info-row"><span class="info-label">Kategori</span><span>{{ p.kategori }}</span></div>
      <div class="info-row"><span class="info-label">Jumlah</span><span>{{ p.jumlah }}</span></div>
      <div class="info-row"><span class="info-label">Estimasi Harga</span><span>{{ fmtRupiah(p.estimasi_harga) }}</span></div>
      <div class="info-row"><span class="info-label">Gudang Tujuan</span><span>{{ p.gudang_tujuan?.nama_gudang || '— Belum ditentukan —' }}</span></div>
      <div class="info-row full"><span class="info-label">Alasan</span><p class="alasan">{{ p.alasan }}</p></div>
      <div class="info-row"><span class="info-label">Pemohon</span><span>{{ p.pemohon?.karyawan?.nama_lengkap || '—' }}</span></div>
      <div class="info-row"><span class="info-label">Tgl Diajukan</span><span>{{ fmtDateTime(p.tgl_diajukan) }}</span></div>
      <template v-if="p.tgl_approval">
        <div class="info-row"><span class="info-label">Diproses oleh</span><span>{{ p.approver?.karyawan?.nama_lengkap || '—' }}</span></div>
        <div class="info-row"><span class="info-label">Tgl Diproses</span><span>{{ fmtDateTime(p.tgl_approval) }}</span></div>
        <div class="info-row full" v-if="p.catatan_approval"><span class="info-label">Catatan Approval</span><p class="alasan">{{ p.catatan_approval }}</p></div>
      </template>
      <div class="info-row" v-if="p.aset_hasil">
        <span class="info-label">Aset Tercatat</span>
        <span class="link" @click="router.push(`/assets/${p.aset_hasil.id_aset}`)">{{ p.aset_hasil.kode_aset }} →</span>
      </div>
    </div>

    <div class="info-card" v-if="p.status_pengajuan === 'Diajukan' && bisaApprove">
      <label class="catatan-label">Catatan Approval (opsional)</label>
      <textarea v-model="catatanApproval" rows="2" placeholder="Alasan tolak / catatan tambahan..."></textarea>
    </div>

    <!-- Modal Barang Sudah Tiba -->
    <div v-if="showSelesaiForm" class="modal-overlay" @click.self="showSelesaiForm = false">
      <div class="modal">
        <h3>Barang Sudah Tiba</h3>
        <p class="modal-desc">Isi detail barang aktual — akan tercatat sebagai aset baru di gudang.</p>
        <div class="field">
          <label>Serial Number (kosongkan jika barang non-serial/stok)</label>
          <input v-model="formSelesai.serial_number" placeholder="SN perangkat" />
        </div>
        <div class="field">
          <label>Harga Aktual (Rp)</label>
          <input v-model.number="formSelesai.harga_aktual" type="number" min="0" />
        </div>
        <div class="field">
          <label>Gudang</label>
          <select v-model.number="formSelesai.id_gudang">
            <option :value="0">— Pilih gudang —</option>
            <option v-for="g in gudangList" :key="g.id_gudang" :value="g.id_gudang">[{{ g.kode_gudang }}] {{ g.nama_gudang }}</option>
          </select>
        </div>
        <div class="field">
          <label>Tanggal Terima</label>
          <input v-model="formSelesai.tgl_terima" type="date" />
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showSelesaiForm = false">Batal</button>
          <button class="btn-submit" @click="submitSelesai" :disabled="processing">
            {{ processing ? 'Menyimpan...' : 'Catat Sebagai Aset' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="aset.loading" class="page"><p>Memuat...</p></div>
  <div v-else class="page"><p>Pengajuan tidak ditemukan.</p></div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 800px; }
.breadcrumb { font-size: 12px; color: #94a3b8; margin-bottom: 8px; cursor: pointer; }
.breadcrumb span:hover { text-decoration: underline; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 8px; font-size: 22px; color: #0f172a; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.actions { display: flex; gap: 10px; }
.btn-primary { padding: 10px 18px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-secondary { padding: 10px 18px; background: #fff; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-approve { padding: 10px 18px; background: #15803d; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-approve:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-reject { padding: 10px 18px; background: #fff; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-reject:disabled { opacity: 0.5; cursor: not-allowed; }

.info-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; margin-bottom: 16px; }
.info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
.info-row:last-child { border-bottom: none; }
.info-row.full { flex-direction: column; gap: 6px; }
.info-label { color: #64748b; font-weight: 600; font-size: 13px; }
.alasan { margin: 0; color: #0f172a; white-space: pre-wrap; }
.link { color: #1d4ed8; font-weight: 700; cursor: pointer; }
.link:hover { text-decoration: underline; }
.catatan-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
.info-card textarea { width: 100%; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 440px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 8px; font-size: 18px; color: #0f172a; }
.modal-desc { margin: 0 0 18px; font-size: 13px; color: #64748b; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
