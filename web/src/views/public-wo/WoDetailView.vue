<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { printSuratTugas, printBeritaAcara, printSuratJalan } from '@/composables/usePrint'

const route  = useRoute()
const router = useRouter()
const id     = Number(route.params.id)

const loading = ref(true)
const wo      = ref<any>(null)
const error   = ref('')

// Update status
const updatingStatus = ref(false)
const STATUS_NEXT: Record<string, string> = {
  Open: 'Dispatch',
  Dispatch: 'On-Site',
  'On-Site': 'Selesai',
}
const STATUS_LABEL: Record<string, string> = {
  Open: 'Open', Dispatch: 'Dispatch', 'On-Site': 'On-Site',
  Selesai: 'Selesai', Ditunda: 'Ditunda', Dibatalkan: 'Dibatalkan',
}
const STATUS_STYLE: Record<string, string> = {
  Open: 'badge-blue', Dispatch: 'badge-blue', 'On-Site': 'badge-yellow',
  Selesai: 'badge-green', Ditunda: 'badge-yellow', Dibatalkan: 'badge-gray',
}

// Berita Acara modal
const showBaModal = ref(false)
const savingBa    = ref(false)
const baForm = ref({
  jenis_ba: 'Instalasi',
  nama_penandatangan_next1: '',
  nama_penandatangan_pelanggan: '',
  jabatan_penandatangan_pelanggan: '',
  catatan: '',
})
const JENIS_BA = ['Instalasi', 'Maintenance', 'Serah_Terima', 'Penarikan', 'Lainnya']

// Catatan teknisi inline edit
const editingCatatan = ref(false)
const catatanDraft   = ref('')
const savingCatatan  = ref(false)

async function fetchWo() {
  loading.value = true; error.value = ''
  try {
    const { data } = await api.get(`/public-wo/${id}`)
    wo.value = data.data
  } catch {
    error.value = 'Work Order tidak ditemukan'
  } finally {
    loading.value = false
  }
}

async function advanceStatus() {
  const next = STATUS_NEXT[wo.value?.status_wo]
  if (!next) return
  updatingStatus.value = true
  try {
    await api.patch(`/public-wo/${id}`, { status_wo: next })
    await fetchWo()
  } finally {
    updatingStatus.value = false
  }
}

async function cancelWo() {
  if (!confirm('Batalkan Work Order ini?')) return
  updatingStatus.value = true
  try {
    await api.patch(`/public-wo/${id}`, { status_wo: 'Dibatalkan' })
    await fetchWo()
  } finally {
    updatingStatus.value = false
  }
}

async function hapusWo() {
  if (!confirm('Hapus Work Order ini?')) return
  try {
    await api.delete(`/public-wo/${id}`)
    router.push('/public-wo')
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus Work Order')
  }
}

async function submitBa() {
  if (!baForm.value.jenis_ba) return
  savingBa.value = true
  try {
    await api.post(`/public-wo/${id}/berita-acara`, baForm.value)
    showBaModal.value = false
    await fetchWo()
  } catch (e: any) {
    alert(e?.response?.data?.message || 'Gagal membuat BA')
  } finally {
    savingBa.value = false
  }
}

function startEditCatatan() {
  catatanDraft.value = wo.value?.catatan_teknisi || ''
  editingCatatan.value = true
}

async function saveCatatan() {
  savingCatatan.value = true
  try {
    await api.patch(`/public-wo/${id}`, { catatan_teknisi: catatanDraft.value })
    await fetchWo()
    editingCatatan.value = false
  } finally {
    savingCatatan.value = false
  }
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtDateTime(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

onMounted(fetchWo)
</script>

<template>
  <div class="page">
    <div class="breadcrumb">
      <span class="bc-link" @click="router.push('/public-wo')">Work Order</span>
      <span class="bc-sep">›</span>
      <span>{{ wo?.nomor_wo || '…' }}</span>
    </div>

    <div v-if="loading" class="state">Memuat…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>

    <template v-else-if="wo">
      <!-- Header -->
      <div class="detail-header">
        <div>
          <div class="wo-nomor">{{ wo.nomor_wo }}</div>
          <div class="wo-meta">
            <span :class="['badge', STATUS_STYLE[wo.status_wo]]">{{ STATUS_LABEL[wo.status_wo] }}</span>
            <span class="badge badge-outline">{{ wo.jenis_wo }}</span>
            <span class="meta-sep">·</span>
            <span class="meta-text">Jadwal: {{ fmtDate(wo.tgl_jadwal) }}</span>
            <span v-if="wo.ticket" class="meta-sep">·</span>
            <span v-if="wo.ticket" class="meta-link" @click="router.push(`/operations/${wo.ticket.id_ticket}`)">
              ↳ Tiket {{ wo.ticket.nomor_tiket }}
            </span>
          </div>
        </div>
        <div class="action-group">
          <button class="btn-print" @click="printSuratTugas(wo)" title="Cetak Surat Tugas">🖨 Surat Tugas</button>
          <button
            v-if="STATUS_NEXT[wo.status_wo]"
            class="btn-primary"
            :disabled="updatingStatus"
            @click="advanceStatus"
          >
            {{ updatingStatus ? '…' : `→ ${STATUS_LABEL[STATUS_NEXT[wo.status_wo]]}` }}
          </button>
          <button
            v-if="wo.status_wo !== 'Selesai' && wo.status_wo !== 'Dibatalkan'"
            class="btn-danger"
            :disabled="updatingStatus"
            @click="cancelWo"
          >Batalkan</button>
          <button
            v-if="wo.status_wo === 'Open' || wo.status_wo === 'Dibatalkan'"
            class="btn-hapus"
            @click="hapusWo"
          >Hapus</button>
        </div>
      </div>

      <div class="grid-layout">
        <!-- Kolom kiri -->
        <div class="left-col">
          <!-- Info WO -->
          <div class="card">
            <div class="card-title">Informasi Work Order</div>
            <dl class="info-list">
              <dt>Jenis</dt><dd>{{ wo.jenis_wo }}</dd>
              <dt>Eksekutor</dt><dd>{{ wo.tipe_eksekutor.replace('_', ' ') }}</dd>
              <dt>Teknisi</dt><dd>{{ wo.teknisi?.nama_lengkap || '-' }}</dd>
              <dt>Vendor</dt><dd>{{ wo.vendor?.nama_vendor || '-' }}</dd>
              <dt v-if="wo.vendor">Fee Vendor</dt><dd v-if="wo.vendor">{{ fmtRp(Number(wo.fee_vendor)) }}</dd>
              <dt v-if="wo.vendor">Status Fee</dt>
              <dd v-if="wo.vendor">
                <span :class="['badge', wo.status_pembayaran_fee === 'Sudah_Dibayar' ? 'badge-green' : 'badge-yellow']">
                  {{ wo.status_pembayaran_fee?.replace('_', ' ') }}
                </span>
              </dd>
              <dt>Dibuat</dt><dd>{{ fmtDateTime(wo.created_at) }}</dd>
              <dt v-if="wo.completed_at">Selesai</dt><dd v-if="wo.completed_at">{{ fmtDateTime(wo.completed_at) }}</dd>
            </dl>
          </div>

          <!-- Site & Pelanggan -->
          <div class="card">
            <div class="card-title">Site & Pelanggan</div>
            <dl class="info-list">
              <dt>Kode Site</dt><dd>{{ wo.site?.kode_site }}</dd>
              <dt>Nama Site</dt><dd>{{ wo.site?.nama_site }}</dd>
              <dt>Kota</dt><dd>{{ wo.site?.kota || '-' }}</dd>
              <dt>Alamat</dt><dd>{{ wo.site?.alamat_lengkap || '-' }}</dd>
              <dt>Pelanggan</dt><dd>{{ wo.site?.pelanggan?.nama_pelanggan }}</dd>
              <dt>PIC</dt><dd>{{ wo.site?.pelanggan?.nama_pic_utama || '-' }}</dd>
              <dt>Telp</dt><dd>{{ wo.site?.pelanggan?.no_telp || '-' }}</dd>
            </dl>
          </div>

          <!-- Deskripsi Tugas -->
          <div class="card">
            <div class="card-title">Deskripsi Tugas</div>
            <p class="desc-text">{{ wo.deskripsi_tugas }}</p>
          </div>

          <!-- Catatan Teknisi -->
          <div class="card">
            <div class="card-title-row">
              <span class="card-title" style="margin-bottom:0">Catatan Teknisi</span>
              <button v-if="!editingCatatan && wo.status_wo !== 'Selesai' && wo.status_wo !== 'Dibatalkan'" class="btn-sm" @click="startEditCatatan">Edit</button>
            </div>
            <div v-if="!editingCatatan">
              <p v-if="wo.catatan_teknisi" class="desc-text">{{ wo.catatan_teknisi }}</p>
              <p v-else class="desc-text empty">Belum ada catatan dari teknisi.</p>
            </div>
            <div v-else>
              <textarea v-model="catatanDraft" rows="4" class="form-control" placeholder="Tuliskan catatan pekerjaan…" />
              <div class="edit-actions">
                <button class="btn-secondary" @click="editingCatatan = false">Batal</button>
                <button class="btn-primary" :disabled="savingCatatan" @click="saveCatatan">
                  {{ savingCatatan ? 'Menyimpan…' : 'Simpan' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Kolom kanan -->
        <div class="right-col">
          <!-- Berita Acara -->
          <div class="card">
            <div class="card-title-row">
              <span class="card-title" style="margin-bottom:0">Berita Acara ({{ wo.berita_acara?.length ?? 0 }})</span>
              <button v-if="wo.status_wo !== 'Dibatalkan'" class="btn-sm" @click="showBaModal = true">+ Buat BA</button>
            </div>
            <div v-if="!wo.berita_acara?.length" class="empty-section">Belum ada Berita Acara</div>
            <div v-else class="ba-list">
              <div v-for="ba in wo.berita_acara" :key="ba.id_ba" class="ba-item">
                <div class="ba-item-header">
                  <div class="ba-nomor">{{ ba.nomor_ba }}</div>
                  <button class="btn-print-sm" @click="printBeritaAcara(wo, ba)" title="Cetak BA">🖨</button>
                </div>
                <div class="ba-meta">
                  <span class="badge badge-outline">{{ ba.jenis_ba }}</span>
                  <span :class="['badge', ba.status_ba === 'Signed' ? 'badge-green' : 'badge-gray']">{{ ba.status_ba }}</span>
                </div>
                <div v-if="ba.nama_penandatangan_next1 || ba.nama_penandatangan_pelanggan" class="ba-signs">
                  <span v-if="ba.nama_penandatangan_next1">NEXT1: {{ ba.nama_penandatangan_next1 }}</span>
                  <span v-if="ba.nama_penandatangan_pelanggan">Pelanggan: {{ ba.nama_penandatangan_pelanggan }}</span>
                </div>
                <div v-if="ba.material?.length" class="ba-material">
                  {{ ba.material.length }} item material
                </div>
                <div class="ba-time">{{ fmtDateTime(ba.created_at) }}</div>
              </div>
            </div>
          </div>

          <!-- Pengiriman Perangkat -->
          <div class="card">
            <div class="card-title">Pengiriman Perangkat ({{ wo.pengiriman?.length ?? 0 }})</div>
            <div v-if="!wo.pengiriman?.length" class="empty-section">Belum ada pengiriman</div>
            <div v-else class="ba-list">
              <div v-for="p in wo.pengiriman" :key="p.id_pengiriman" class="ba-item">
                <div class="ba-item-header">
                  <div class="ba-nomor">{{ p.jenis_pengiriman.replace('_', ' ') }}</div>
                  <button class="btn-print-sm" @click="printSuratJalan(wo, p)" title="Cetak Surat Jalan">🖨</button>
                </div>
                <div class="ba-meta">
                  <span class="badge badge-outline">{{ p.jenis_pengiriman.replace('_', ' ') }}</span>
                  <span :class="['badge', p.status_pengiriman === 'Diterima' ? 'badge-green' : 'badge-yellow']">
                    {{ p.status_pengiriman }}
                  </span>
                </div>
                <div v-if="p.nomor_resi" class="ba-signs">Resi: {{ p.nomor_resi }}</div>
                <div v-if="p.items?.length" class="ba-material">{{ p.items.length }} item perangkat</div>
                <div class="ba-time">{{ fmtDateTime(p.created_at) }}</div>
              </div>
            </div>
          </div>

          <!-- Foto -->
          <div class="card">
            <div class="card-title">Foto ({{ wo.foto?.length ?? 0 }})</div>
            <div v-if="!wo.foto?.length" class="empty-section">Belum ada foto</div>
            <div v-else class="foto-grid">
              <div v-for="f in wo.foto" :key="f.id_foto" class="foto-item">
                <img :src="f.file_path" :alt="f.jenis_foto" class="foto-img" @error="(e: any) => e.target.style.display='none'" />
                <div class="foto-label">{{ f.jenis_foto }}</div>
              </div>
            </div>
          </div>

          <!-- Koordinat -->
          <div v-if="wo.koordinat_checkin" class="card">
            <div class="card-title">Check-in Lokasi</div>
            <p class="desc-text">{{ wo.koordinat_checkin }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal Berita Acara -->
    <div v-if="showBaModal" class="modal-overlay" @click.self="showBaModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Buat Berita Acara</h3>
          <button class="btn-close" @click="showBaModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Jenis BA *</label>
            <select v-model="baForm.jenis_ba" class="form-control">
              <option v-for="j in JENIS_BA" :key="j" :value="j">{{ j.replace('_', ' ') }}</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Penandatangan NEXT1</label>
              <input v-model="baForm.nama_penandatangan_next1" class="form-control" placeholder="Nama…" />
            </div>
            <div class="form-group">
              <label>Penandatangan Pelanggan</label>
              <input v-model="baForm.nama_penandatangan_pelanggan" class="form-control" placeholder="Nama…" />
            </div>
          </div>
          <div class="form-group">
            <label>Jabatan Pelanggan</label>
            <input v-model="baForm.jabatan_penandatangan_pelanggan" class="form-control" placeholder="Jabatan…" />
          </div>
          <div class="form-group">
            <label>Catatan</label>
            <textarea v-model="baForm.catatan" rows="3" class="form-control" placeholder="Catatan tambahan…" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showBaModal = false">Batal</button>
          <button class="btn-primary" :disabled="savingBa" @click="submitBa">
            {{ savingBa ? 'Menyimpan…' : 'Buat Berita Acara' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; }
.breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; margin-bottom: 16px; }
.bc-link { cursor: pointer; color: #2563eb; }
.bc-link:hover { text-decoration: underline; }
.bc-sep { color: #cbd5e1; }

.state { padding: 60px 20px; text-align: center; color: #94a3b8; font-size: 14px; }
.state.error { color: #ef4444; }

.detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.wo-nomor { font-size: 22px; font-weight: 700; color: #0f172a; font-family: monospace; margin-bottom: 8px; }
.wo-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.meta-sep { color: #cbd5e1; }
.meta-text { font-size: 13px; color: #64748b; }
.meta-link { font-size: 13px; color: #2563eb; cursor: pointer; }
.meta-link:hover { text-decoration: underline; }
.action-group { display: flex; gap: 8px; }

.badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.badge-blue   { background: #eff6ff; color: #2563eb; }
.badge-yellow { background: #fffbeb; color: #d97706; }
.badge-green  { background: #f0fdf4; color: #16a34a; }
.badge-gray   { background: #f1f5f9; color: #64748b; }
.badge-outline { border: 1px solid #e2e8f0; background: transparent; color: #475569; }

.grid-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.left-col, .right-col { display: flex; flex-direction: column; gap: 16px; }

.card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 18px 20px; }
.card-title { font-size: 13px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 14px; }
.card-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }

.info-list { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; font-size: 13px; }
.info-list dt { color: #64748b; font-weight: 500; white-space: nowrap; }
.info-list dd { color: #1e293b; margin: 0; }

.desc-text { margin: 0; font-size: 13px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
.desc-text.empty { color: #94a3b8; font-style: italic; }
.empty-section { font-size: 13px; color: #94a3b8; text-align: center; padding: 16px 0; }

.ba-list { display: flex; flex-direction: column; gap: 10px; }
.ba-item { padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; }
.ba-nomor { font-family: monospace; font-size: 13px; font-weight: 700; color: #1d4ed8; margin-bottom: 6px; }
.ba-meta { display: flex; gap: 6px; margin-bottom: 6px; }
.ba-signs { font-size: 12px; color: #64748b; display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; }
.ba-material { font-size: 12px; color: #475569; }
.ba-time { font-size: 11px; color: #94a3b8; margin-top: 4px; }

.foto-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.foto-item { background: #f8fafc; border-radius: 8px; overflow: hidden; text-align: center; }
.foto-img { width: 100%; height: 80px; object-fit: cover; }
.foto-label { font-size: 11px; color: #64748b; padding: 4px; }

.btn-primary { padding: 8px 18px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary:hover:not(:disabled) { background: #1e40af; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { padding: 8px 16px; background: #f1f5f9; color: #374151; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-danger { padding: 8px 16px; background: #fff; color: #dc2626; border: 1.5px solid #fca5a5; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-danger:hover:not(:disabled) { background: #fef2f2; }
.btn-sm { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-print { padding: 7px 14px; background: #f0fdf4; color: #15803d; border: 1.5px solid #bbf7d0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-print:hover { background: #dcfce7; }
.btn-print-sm { padding: 3px 8px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-print-sm:hover { background: #dcfce7; }
.ba-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.btn-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; padding: 4px 8px; border-radius: 6px; }

.edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.form-control { padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; width: 100%; box-sizing: border-box; }
.form-control:focus { outline: none; border-color: #93c5fd; }
textarea.form-control { resize: vertical; font-family: inherit; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group label { font-size: 13px; font-weight: 600; color: #374151; }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,0.18); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px 0; }
.modal-header h3 { margin: 0; font-size: 17px; color: #0f172a; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid #f1f5f9; }

@media (max-width: 900px) {
  .grid-layout { grid-template-columns: 1fr; }
}
</style>
