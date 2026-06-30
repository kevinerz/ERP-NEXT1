<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useProyekStore } from '@/stores/proyek'

const router = useRouter()
const route = useRoute()
const proyek = useProyekStore()
const id = Number(route.params.id)

// Edit project
const showEdit = ref(false)
const editForm = ref<any>({})
const editSubmitting = ref(false)
const editError = ref('')

// Add WO
const showAddWo = ref(false)
const woForm = ref({ jenis_wo: 'Instalasi', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, id_vendor_ketiga: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' })
const woSubmitting = ref(false)
const woError = ref('')

// Edit WO status
const showEditWo = ref(false)
const editWoId = ref(0)
const editWoNomor = ref('')
const editWoForm = ref({ status_wo: '', catatan_teknisi: '', status_pembayaran_fee: 'Belum_Dibayar' })
const editWoSubmitting = ref(false)

// Add BAST
const showAddBast = ref(false)
const bastForm = ref({ nama_penandatangan_pelanggan: '', jabatan_penandatangan_pelanggan: '', tgl_ditandatangani: '', catatan: '' })
const bastSubmitting = ref(false)
const bastError = ref('')

const successMsg = ref('')

const STATUS_PROJECT = ['Perencanaan', 'Instalasi', 'Testing', 'Selesai', 'Ditahan']
const STATUS_WO = ['Open', 'Dispatch', 'On-Site', 'Selesai', 'Ditunda', 'Dibatalkan']
const JENIS_WO = ['Instalasi', 'Maintenance', 'Troubleshoot', 'Survey', 'Demontasi', 'Upgrade']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Perencanaan: { bg: '#eff6ff', color: '#1d4ed8' },
  Instalasi:   { bg: '#fef9c3', color: '#a16207' },
  Testing:     { bg: '#fff7ed', color: '#c2410c' },
  Selesai:     { bg: '#f0fdf4', color: '#15803d' },
  Ditahan:     { bg: '#fef2f2', color: '#dc2626' },
}
const WO_STATUS_COLOR: Record<string, string> = {
  Open: '#64748b', Dispatch: '#3b82f6', 'On-Site': '#f59e0b',
  Selesai: '#22c55e', Ditunda: '#f97316', Dibatalkan: '#ef4444',
}

onMounted(async () => {
  await Promise.all([
    proyek.fetchOne(id),
    proyek.fetchPmList(),
    proyek.fetchTeknisiList(),
  ])
})

function openEdit() {
  const p = proyek.current!
  editForm.value = {
    id_pm: p.pm?.id_karyawan,
    id_kontrak: p.kontrak?.id_kontrak || null,
    status_project: p.status_project,
    tgl_mulai: p.tgl_mulai ? p.tgl_mulai.substring(0, 10) : '',
    tgl_target_selesai: p.tgl_target_selesai ? p.tgl_target_selesai.substring(0, 10) : '',
    tgl_actual_selesai: p.tgl_actual_selesai ? p.tgl_actual_selesai.substring(0, 10) : '',
    catatan: p.catatan || '',
  }
  editError.value = ''; showEdit.value = true
}

async function handleEdit() {
  editSubmitting.value = true; editError.value = ''
  try {
    await proyek.update(id, {
      ...editForm.value,
      id_kontrak: editForm.value.id_kontrak || undefined,
      tgl_mulai: editForm.value.tgl_mulai || undefined,
      tgl_target_selesai: editForm.value.tgl_target_selesai || undefined,
      tgl_actual_selesai: editForm.value.tgl_actual_selesai || undefined,
    })
    await proyek.fetchOne(id)
    showEdit.value = false; flash('Project diperbarui')
  } catch (e: any) { editError.value = e.response?.data?.message || 'Gagal' }
  finally { editSubmitting.value = false }
}

async function handleAddWo() {
  if (!woForm.value.tgl_jadwal || !woForm.value.deskripsi_tugas) {
    woError.value = 'Jadwal dan deskripsi wajib diisi'; return
  }
  woSubmitting.value = true; woError.value = ''
  try {
    await proyek.createWo({
      jenis_wo: woForm.value.jenis_wo,
      id_project: id,
      id_site: proyek.current!.site!.id_site,
      tipe_eksekutor: woForm.value.tipe_eksekutor,
      id_teknisi_internal: woForm.value.tipe_eksekutor === 'Internal_NEXT1' && woForm.value.id_teknisi_internal ? woForm.value.id_teknisi_internal : undefined,
      id_vendor_ketiga: woForm.value.tipe_eksekutor === 'Vendor_Ketiga' && woForm.value.id_vendor_ketiga ? woForm.value.id_vendor_ketiga : undefined,
      fee_vendor: woForm.value.fee_vendor || undefined,
      tgl_jadwal: new Date(woForm.value.tgl_jadwal).toISOString(),
      deskripsi_tugas: woForm.value.deskripsi_tugas,
    })
    await proyek.fetchOne(id)
    showAddWo.value = false
    woForm.value = { jenis_wo: 'Instalasi', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, id_vendor_ketiga: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' }
    flash('Work Order dibuat')
  } catch (e: any) { woError.value = e.response?.data?.message || 'Gagal' }
  finally { woSubmitting.value = false }
}

function openEditWo(wo: any) {
  editWoId.value = wo.id_wo
  editWoNomor.value = wo.nomor_wo
  editWoForm.value = {
    status_wo: wo.status_wo,
    catatan_teknisi: wo.catatan_teknisi || '',
    status_pembayaran_fee: wo.status_pembayaran_fee,
  }
  showEditWo.value = true
}

async function handleEditWo() {
  editWoSubmitting.value = true
  try {
    await proyek.updateWo(editWoId.value, editWoForm.value)
    await proyek.fetchOne(id)
    showEditWo.value = false; flash('WO diperbarui')
  } catch (e: any) { flash('Gagal update WO') }
  finally { editWoSubmitting.value = false }
}

async function handleAddBast() {
  bastSubmitting.value = true; bastError.value = ''
  try {
    await proyek.createBast({
      id_project: id,
      nama_penandatangan_pelanggan: bastForm.value.nama_penandatangan_pelanggan || undefined,
      jabatan_penandatangan_pelanggan: bastForm.value.jabatan_penandatangan_pelanggan || undefined,
      tgl_ditandatangani: bastForm.value.tgl_ditandatangani || undefined,
      catatan: bastForm.value.catatan || undefined,
    })
    await proyek.fetchOne(id)
    showAddBast.value = false
    bastForm.value = { nama_penandatangan_pelanggan: '', jabatan_penandatangan_pelanggan: '', tgl_ditandatangani: '', catatan: '' }
    flash('BAST dibuat')
  } catch (e: any) { bastError.value = e.response?.data?.message || 'Gagal' }
  finally { bastSubmitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }
function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
function fmtDt(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="page">
    <div v-if="proyek.loading && !proyek.current" class="loading-page">Memuat...</div>
    <template v-else-if="proyek.current">
      <!-- Header -->
      <div class="page-header">
        <div>
          <button class="btn-back" @click="router.push('/projects')">← Proyek</button>
          <h2>{{ proyek.current.nomor_project }}</h2>
          <p class="sub">{{ proyek.current.site?.nama_site }} · {{ proyek.current.site?.kota }}</p>
        </div>
        <div class="header-right">
          <span class="status-big"
            :style="{ background: STATUS_COLOR[proyek.current.status_project]?.bg, color: STATUS_COLOR[proyek.current.status_project]?.color }">
            {{ proyek.current.status_project }}
          </span>
          <button class="btn-edit" @click="openEdit">Edit</button>
        </div>
      </div>

      <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-chip">
          <span class="ic-label">Pelanggan / Opp</span>
          <span class="ic-value">{{ proyek.current.opportunity?.lead?.nama_perusahaan || proyek.current.opportunity?.lead?.nama_prospek }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Project Manager</span>
          <span class="ic-value fw">{{ proyek.current.pm?.nama_lengkap }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Tgl Mulai</span>
          <span class="ic-value">{{ fmtDate(proyek.current.tgl_mulai) }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Target Selesai</span>
          <span class="ic-value">{{ fmtDate(proyek.current.tgl_target_selesai) }}</span>
        </div>
        <div class="info-chip" v-if="proyek.current.tgl_actual_selesai">
          <span class="ic-label">Actual Selesai</span>
          <span class="ic-value" style="color:#15803d;font-weight:700">{{ fmtDate(proyek.current.tgl_actual_selesai) }}</span>
        </div>
        <div class="info-chip info-chip-link" v-if="proyek.current.kontrak"
          @click="router.push(`/contracts/${proyek.current.kontrak.id_kontrak}`)">
          <span class="ic-label">Kontrak</span>
          <span class="ic-value fw">{{ proyek.current.kontrak.nomor_kontrak }}</span>
          <span class="ic-status" :class="`kstatus-${proyek.current.kontrak.status_kontrak.toLowerCase()}`">
            {{ proyek.current.kontrak.status_kontrak.replace('_', ' ') }}
          </span>
        </div>
      </div>

      <div v-if="proyek.current.catatan" class="catatan-box">{{ proyek.current.catatan }}</div>

      <!-- Work Orders -->
      <div class="section-card mt16">
        <div class="section-header">
          <span class="card-title">Work Order ({{ proyek.current.work_orders?.length ?? 0 }})</span>
          <button class="btn-add-small" @click="showAddWo = true">+ Buat WO</button>
        </div>
        <div v-if="!proyek.current.work_orders?.length" class="empty-section">Belum ada Work Order</div>
        <div v-for="wo in proyek.current.work_orders" :key="wo.id_wo" class="wo-item">
          <div class="wo-left">
            <div class="wo-nomor">{{ wo.nomor_wo }}</div>
            <div class="wo-jenis">{{ wo.jenis_wo }}</div>
            <div class="wo-date">{{ fmtDt(wo.tgl_jadwal) }}</div>
          </div>
          <div class="wo-mid">
            <p class="wo-desc">{{ wo.deskripsi_tugas }}</p>
            <div class="wo-exec">
              {{ wo.tipe_eksekutor === 'Internal_NEXT1' ? (wo.teknisi?.nama_lengkap || 'Internal') : (wo.vendor?.nama_vendor || 'Vendor') }}
            </div>
          </div>
          <div class="wo-right">
            <span class="wo-status" :style="{ color: WO_STATUS_COLOR[wo.status_wo] || '#64748b' }">{{ wo.status_wo }}</span>
            <button class="btn-edit-small" @click="openEditWo(wo)">Update</button>
          </div>
        </div>
      </div>

      <!-- BAST -->
      <div class="section-card mt16">
        <div class="section-header">
          <span class="card-title">BAST ({{ proyek.current.bast?.length ?? 0 }})</span>
          <button class="btn-add-small" @click="showAddBast = true">+ Buat BAST</button>
        </div>
        <div v-if="!proyek.current.bast?.length" class="empty-section">Belum ada BAST</div>
        <div v-for="b in proyek.current.bast" :key="b.id_dokumen" class="bast-item">
          <div class="bast-nomor">{{ b.nomor_bast }}</div>
          <div class="bast-detail">
            <span>{{ b.nama_penandatangan_pelanggan || '—' }}</span>
            <span class="text-gray">{{ b.jabatan_penandatangan_pelanggan || '' }}</span>
          </div>
          <div class="bast-date">{{ fmtDate(b.tgl_ditandatangani) }}</div>
          <span :class="['bast-sync', b.status_sinkronisasi_finance === 'Sudah' ? 'sync-yes' : 'sync-no']">
            Finance: {{ b.status_sinkronisasi_finance }}
          </span>
        </div>
      </div>

      <!-- Modal Edit Project -->
      <div v-if="showEdit" class="modal-overlay" @click.self="showEdit = false">
        <div class="modal">
          <h3>Edit Project</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Status</label>
              <select v-model="editForm.status_project">
                <option v-for="s in STATUS_PROJECT" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Project Manager</label>
              <select v-model="editForm.id_pm">
                <option v-for="p in proyek.pmList" :key="p.id_karyawan" :value="p.id_karyawan">{{ p.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field full">
              <label>ID Kontrak <span class="field-hint">(opsional — nomor ID kontrak terkait)</span></label>
              <input v-model.number="editForm.id_kontrak" type="number" min="1" placeholder="Kosongkan jika tidak ada" />
            </div>
            <div class="field">
              <label>Tgl Mulai</label>
              <input v-model="editForm.tgl_mulai" type="date" />
            </div>
            <div class="field">
              <label>Target Selesai</label>
              <input v-model="editForm.tgl_target_selesai" type="date" />
            </div>
            <div class="field full" v-if="editForm.status_project === 'Selesai'">
              <label>Actual Selesai</label>
              <input v-model="editForm.tgl_actual_selesai" type="date" />
            </div>
            <div class="field full">
              <label>Catatan</label>
              <textarea v-model="editForm.catatan" rows="2"></textarea>
            </div>
          </div>
          <p v-if="editError" class="form-error">{{ editError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showEdit = false">Batal</button>
            <button class="btn-submit" @click="handleEdit" :disabled="editSubmitting">
              {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Buat WO -->
      <div v-if="showAddWo" class="modal-overlay" @click.self="showAddWo = false">
        <div class="modal">
          <h3>Buat Work Order</h3>
          <div class="form-grid">
            <div class="field">
              <label>Jenis WO</label>
              <select v-model="woForm.jenis_wo">
                <option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="field">
              <label>Tipe Eksekutor</label>
              <select v-model="woForm.tipe_eksekutor">
                <option value="Internal_NEXT1">Internal NEXT1</option>
                <option value="Vendor_Ketiga">Vendor Ketiga</option>
              </select>
            </div>
            <div class="field" v-if="woForm.tipe_eksekutor === 'Internal_NEXT1'">
              <label>Teknisi</label>
              <select v-model="woForm.id_teknisi_internal">
                <option :value="0">— Pilih —</option>
                <option v-for="t in proyek.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field" v-if="woForm.tipe_eksekutor === 'Vendor_Ketiga'">
              <label>Fee Vendor (Rp)</label>
              <input v-model.number="woForm.fee_vendor" type="number" placeholder="0" />
            </div>
            <div class="field full">
              <label>Jadwal <span class="req">*</span></label>
              <input v-model="woForm.tgl_jadwal" type="datetime-local" />
            </div>
            <div class="field full">
              <label>Deskripsi Tugas <span class="req">*</span></label>
              <textarea v-model="woForm.deskripsi_tugas" rows="3" placeholder="Tugas yang harus dilakukan..."></textarea>
            </div>
          </div>
          <p v-if="woError" class="form-error">{{ woError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showAddWo = false">Batal</button>
            <button class="btn-submit" @click="handleAddWo" :disabled="woSubmitting">
              {{ woSubmitting ? 'Membuat...' : 'Buat WO' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Update WO Status -->
      <div v-if="showEditWo" class="modal-overlay" @click.self="showEditWo = false">
        <div class="modal">
          <h3>Update WO — {{ editWoNomor }}</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Status WO</label>
              <select v-model="editWoForm.status_wo">
                <option v-for="s in STATUS_WO" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Status Bayar Fee Vendor</label>
              <select v-model="editWoForm.status_pembayaran_fee">
                <option value="Belum_Dibayar">Belum Dibayar</option>
                <option value="Sudah_Dibayar">Sudah Dibayar</option>
              </select>
            </div>
            <div class="field full">
              <label>Catatan Teknisi</label>
              <textarea v-model="editWoForm.catatan_teknisi" rows="3" placeholder="Hasil pekerjaan, kendala..."></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showEditWo = false">Batal</button>
            <button class="btn-submit" @click="handleEditWo" :disabled="editWoSubmitting">
              {{ editWoSubmitting ? 'Menyimpan...' : 'Update' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Buat BAST -->
      <div v-if="showAddBast" class="modal-overlay" @click.self="showAddBast = false">
        <div class="modal">
          <h3>Buat BAST</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Nama Penandatangan Pelanggan</label>
              <input v-model="bastForm.nama_penandatangan_pelanggan" placeholder="Nama lengkap" />
            </div>
            <div class="field">
              <label>Jabatan</label>
              <input v-model="bastForm.jabatan_penandatangan_pelanggan" placeholder="Direktur, Manager..." />
            </div>
            <div class="field">
              <label>Tgl Ditandatangani</label>
              <input v-model="bastForm.tgl_ditandatangani" type="date" />
            </div>
            <div class="field full">
              <label>Catatan</label>
              <textarea v-model="bastForm.catatan" rows="2"></textarea>
            </div>
          </div>
          <p v-if="bastError" class="form-error">{{ bastError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showAddBast = false">Batal</button>
            <button class="btn-submit" @click="handleAddBast" :disabled="bastSubmitting">
              {{ bastSubmitting ? 'Membuat...' : 'Buat BAST' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1000px; }
.loading-page { padding: 60px; text-align: center; color: #94a3b8; }
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-right { display: flex; align-items: center; gap: 10px; }
.status-big { padding: 5px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; }
.btn-edit { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }

.info-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.info-chip { background: #fff; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); flex: 1; min-width: 130px; }
.info-chip-link { cursor: pointer; transition: box-shadow 0.15s; }
.info-chip-link:hover { box-shadow: 0 2px 8px rgba(59,130,246,0.2); border: 1px solid #bfdbfe; }
.ic-label { display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
.ic-value { font-size: 14px; color: #0f172a; }
.ic-status { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-top: 4px; }
.kstatus-aktif { background: #f0fdf4; color: #15803d; }
.kstatus-akan_berakhir { background: #fef9c3; color: #a16207; }
.kstatus-berakhir { background: #f1f5f9; color: #64748b; }
.kstatus-terminasi { background: #fef2f2; color: #dc2626; }
.field-hint { font-size: 11px; color: #94a3b8; font-weight: 400; }
.fw { font-weight: 700; }

.catatan-box { background: #f8fafc; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #475569; margin-bottom: 4px; }

.section-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.mt16 { margin-top: 16px; }
.card-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.btn-add-small { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.empty-section { color: #94a3b8; font-size: 13px; padding: 12px 0; }

.wo-item { display: flex; gap: 16px; align-items: flex-start; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
.wo-left { min-width: 150px; }
.wo-nomor { font-size: 13px; font-weight: 700; color: #1d4ed8; }
.wo-jenis { font-size: 12px; color: #64748b; margin: 2px 0; }
.wo-date { font-size: 11px; color: #94a3b8; }
.wo-mid { flex: 1; }
.wo-desc { margin: 0 0 4px; font-size: 14px; color: #0f172a; }
.wo-exec { font-size: 12px; color: #64748b; }
.wo-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 90px; }
.wo-status { font-size: 13px; font-weight: 700; }
.btn-edit-small { padding: 4px 10px; background: #f1f5f9; color: #374151; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }

.bast-item { display: flex; align-items: center; gap: 16px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
.bast-nomor { font-size: 14px; font-weight: 700; color: #0f172a; min-width: 160px; }
.bast-detail { flex: 1; display: flex; flex-direction: column; font-size: 13px; }
.text-gray { color: #64748b; }
.bast-date { font-size: 12px; color: #64748b; min-width: 90px; text-align: right; }
.bast-sync { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.sync-yes { background: #f0fdf4; color: #15803d; }
.sync-no { background: #fef2f2; color: #dc2626; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 4px 0 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
