<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'

const route = useRoute()
const router = useRouter()
const contracts = useContractsStore()

const id = Number(route.params.id)

const showEditModal = ref(false)
const showTerminasiModal = ref(false)
const submitting = ref(false)
const formError = ref('')

const editForm = ref({ tgl_berakhir: '', durasi_bulan: 12, harga_mrc: 0, harga_otc: 0, status_kontrak: '' })
const terminasiForm = ref({ tanggal_terminasi: '', alasan_terminasi: '' })

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif:          { bg: '#f0fdf4', color: '#15803d' },
  Akan_Berakhir:  { bg: '#fef9c3', color: '#a16207' },
  Berakhir:       { bg: '#f1f5f9', color: '#64748b' },
  Terminasi:      { bg: '#fef2f2', color: '#dc2626' },
}

const k = computed(() => contracts.current)

onMounted(() => contracts.fetchOne(id))

function openEdit() {
  if (!k.value) return
  editForm.value = {
    tgl_berakhir: k.value.tgl_berakhir ? k.value.tgl_berakhir.split('T')[0] : '',
    durasi_bulan: k.value.durasi_bulan,
    harga_mrc: k.value.harga_mrc,
    harga_otc: k.value.harga_otc,
    status_kontrak: k.value.status_kontrak,
  }
  showEditModal.value = true; formError.value = ''
}

async function handleEdit() {
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...editForm.value }
    if (!payload.tgl_berakhir) delete payload.tgl_berakhir
    await contracts.update(id, payload)
    showEditModal.value = false
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { submitting.value = false }
}

async function handleTerminasi() {
  if (!terminasiForm.value.tanggal_terminasi) { formError.value = 'Tanggal terminasi wajib diisi'; return }
  submitting.value = true; formError.value = ''
  try {
    await contracts.terminasi(id, terminasiForm.value)
    showTerminasiModal.value = false
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal terminasi' }
  finally { submitting.value = false }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtRupiah(n: number) { return 'Rp ' + (n || 0).toLocaleString('id-ID') }
function statusLabel(s: string) { return s.replace('_', ' ') }

function sisaHari(d?: string) {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

const STATUS_LIST = ['Aktif', 'Akan_Berakhir', 'Berakhir', 'Terminasi']
</script>

<template>
  <div class="page">
    <div class="breadcrumb">
      <span class="link" @click="router.push('/contracts')">Kontrak</span>
      <span class="sep">›</span>
      <span>{{ k?.nomor_kontrak || '...' }}</span>
    </div>

    <div v-if="contracts.loading && !k" class="loading-full">Memuat...</div>
    <div v-else-if="contracts.error" class="alert-error">{{ contracts.error }}</div>
    <template v-else-if="k">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <div class="nomor">{{ k.nomor_kontrak }}</div>
          <h2>{{ k.site?.pelanggan?.nama_pelanggan }}</h2>
          <div class="sub-row">
            <span class="sub">{{ k.site?.nama_site }}</span>
            <span class="status-badge"
              :style="{ background: STATUS_COLOR[k.status_kontrak]?.bg, color: STATUS_COLOR[k.status_kontrak]?.color }">
              {{ statusLabel(k.status_kontrak) }}
            </span>
          </div>
        </div>
        <div class="header-actions">
          <button v-if="k.status_kontrak === 'Aktif'" class="btn-danger" @click="showTerminasiModal = true; formError = ''">
            Terminasi
          </button>
          <button class="btn-edit" @click="openEdit">Edit</button>
        </div>
      </div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-item">
          <div class="info-label">Layanan</div>
          <div class="info-value">{{ k.layanan?.nama_layanan }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">MRC / Bulan</div>
          <div class="info-value mrc">{{ fmtRupiah(k.harga_mrc) }}</div>
        </div>
        <div class="info-item" v-if="k.harga_otc">
          <div class="info-label">OTC</div>
          <div class="info-value">{{ fmtRupiah(k.harga_otc) }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Durasi</div>
          <div class="info-value">{{ k.durasi_bulan }} bulan</div>
        </div>
        <div class="info-item">
          <div class="info-label">Tgl Mulai</div>
          <div class="info-value">{{ fmtDate(k.tgl_mulai) }}</div>
        </div>
        <div class="info-item" v-if="k.tgl_berakhir">
          <div class="info-label">Tgl Berakhir</div>
          <div class="info-value">{{ fmtDate(k.tgl_berakhir) }}</div>
          <div class="sisa" v-if="k.status_kontrak === 'Aktif'"
            :class="{ warn: (sisaHari(k.tgl_berakhir) ?? 999) <= 30 }">
            {{ sisaHari(k.tgl_berakhir) }} hari lagi
          </div>
        </div>
        <div class="info-item" v-if="k.quotation">
          <div class="info-label">Quotation</div>
          <div class="info-value">{{ k.quotation.nomor_quotation }}</div>
        </div>
      </div>

      <!-- Terminasi info -->
      <div class="terminasi-card" v-if="k.status_kontrak === 'Terminasi'">
        <div class="t-icon">⚠️</div>
        <div>
          <div class="t-label">Kontrak diterminasi pada {{ fmtDate(k.tanggal_terminasi!) }}</div>
          <div class="t-alasan" v-if="k.alasan_terminasi">{{ k.alasan_terminasi }}</div>
        </div>
      </div>

    </template>

    <!-- Modal Edit -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h3>Edit Kontrak</h3>
        <div class="form-grid">
          <div class="field">
            <label>Tgl Berakhir</label>
            <input v-model="editForm.tgl_berakhir" type="date" />
          </div>
          <div class="field">
            <label>Durasi (bulan)</label>
            <input v-model.number="editForm.durasi_bulan" type="number" min="1" />
          </div>
          <div class="field">
            <label>Harga MRC (Rp)</label>
            <input v-model.number="editForm.harga_mrc" type="number" min="0" />
          </div>
          <div class="field">
            <label>Harga OTC (Rp)</label>
            <input v-model.number="editForm.harga_otc" type="number" min="0" />
          </div>
          <div class="field full">
            <label>Status</label>
            <select v-model="editForm.status_kontrak">
              <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
            </select>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEditModal = false">Batal</button>
          <button class="btn-submit" @click="handleEdit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Terminasi -->
    <div v-if="showTerminasiModal" class="modal-overlay" @click.self="showTerminasiModal = false">
      <div class="modal">
        <h3>Terminasi Kontrak</h3>
        <p class="warn-text">Kontrak akan ditandai sebagai Terminasi. Tindakan ini tidak dapat dibatalkan.</p>
        <div class="form-grid">
          <div class="field full">
            <label>Tanggal Terminasi <span class="req">*</span></label>
            <input v-model="terminasiForm.tanggal_terminasi" type="date" />
          </div>
          <div class="field full">
            <label>Alasan Terminasi</label>
            <textarea v-model="terminasiForm.alasan_terminasi" rows="3" placeholder="Alasan terminasi..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showTerminasiModal = false">Batal</button>
          <button class="btn-danger-submit" @click="handleTerminasi" :disabled="submitting">
            {{ submitting ? 'Memproses...' : 'Terminasi Kontrak' }}
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

.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.header-left .nomor { font-size: 13px; font-weight: 700; color: #3b82f6; margin-bottom: 4px; }
.header-left h2 { margin: 0 0 8px; font-size: 22px; color: #0f172a; }
.sub-row { display: flex; align-items: center; gap: 8px; }
.sub { font-size: 14px; color: #64748b; }
.status-badge { padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; }
.header-actions { display: flex; gap: 10px; }
.btn-edit { padding: 9px 18px; background: #f1f5f9; color: #374151; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-danger { padding: 9px 18px; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.info-bar { display: flex; flex-wrap: wrap; gap: 0; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; margin-bottom: 24px; }
.info-item { flex: 0 0 auto; min-width: 140px; padding: 8px 20px 8px 0; border-right: 1px solid #f1f5f9; margin-right: 20px; margin-bottom: 8px; }
.info-item:last-child { border-right: none; }
.info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px; }
.info-value { font-size: 14px; color: #0f172a; font-weight: 600; }
.info-value.mrc { color: #1d4ed8; font-size: 16px; }
.sisa { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.sisa.warn { color: #ea580c; font-weight: 700; }

.terminasi-card { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px 20px; display: flex; align-items: flex-start; gap: 12px; }
.t-icon { font-size: 20px; }
.t-label { font-weight: 600; color: #dc2626; font-size: 14px; }
.t-alasan { color: #64748b; font-size: 13px; margin-top: 4px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 16px; font-size: 18px; color: #0f172a; }
.warn-text { color: #dc2626; font-size: 13px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
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
.btn-danger-submit { padding: 9px 22px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-danger-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
