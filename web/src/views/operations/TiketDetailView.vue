<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOperationsStore } from '@/stores/operations'
import { useProyekStore } from '@/stores/proyek'

const router = useRouter()
const route = useRoute()
const ops = useOperationsStore()
const proyek = useProyekStore()
const id = Number(route.params.id)

const showEditModal = ref(false)
const editForm = ref<any>({})
const editSubmitting = ref(false)
const editError = ref('')

const showLogModal = ref(false)
const logForm = ref({ status_ke: '', catatan: '' })
const logSubmitting = ref(false)

const showWoModal = ref(false)
const woForm = ref({ jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' })
const woSubmitting = ref(false)
const woError = ref('')

const successMsg = ref('')

const STATUS_LIST = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed']
const PRIORITAS_LIST = ['Low', 'Medium', 'High', 'Critical']
const JENIS_WO = ['Troubleshoot', 'Maintenance', 'Instalasi', 'Survey', 'Upgrade']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Open:             { bg: '#eff6ff', color: '#1d4ed8' },
  In_Progress:      { bg: '#fef9c3', color: '#a16207' },
  Pending_Customer: { bg: '#fff7ed', color: '#c2410c' },
  Resolved:         { bg: '#f0fdf4', color: '#15803d' },
  Closed:           { bg: '#f1f5f9', color: '#64748b' },
}
const PRIORITAS_COLOR: Record<string, string> = {
  Low: '#64748b', Medium: '#3b82f6', High: '#f97316', Critical: '#ef4444',
}
const WO_STATUS_COLOR: Record<string, string> = {
  Open: '#64748b', Dispatch: '#3b82f6', 'On-Site': '#f59e0b',
  Selesai: '#22c55e', Ditunda: '#f97316', Dibatalkan: '#ef4444',
}

onMounted(async () => {
  await Promise.all([
    ops.fetchOne(id),
    ops.fetchTeknisiList(),
    proyek.fetchSiteList(),
  ])
})

function openEdit() {
  const t = ops.current!
  editForm.value = {
    judul_tiket: t.judul_tiket,
    deskripsi_masalah: t.deskripsi_masalah || '',
    prioritas: t.prioritas,
    status_tiket: t.status_tiket,
    id_teknisi_pic: t.teknisi?.id_karyawan || 0,
  }
  editError.value = ''; showEditModal.value = true
}

async function handleEdit() {
  editSubmitting.value = true; editError.value = ''
  try {
    const payload: any = { ...editForm.value }
    if (!payload.id_teknisi_pic) delete payload.id_teknisi_pic
    await ops.update(id, payload)
    await ops.fetchOne(id)
    showEditModal.value = false; flash('Tiket diperbarui')
  } catch (e: any) { editError.value = e.response?.data?.message || 'Gagal' }
  finally { editSubmitting.value = false }
}

async function handleAddLog() {
  logSubmitting.value = true
  try {
    await ops.addLog({
      id_ticket: id,
      status_ke: logForm.value.status_ke || undefined,
      catatan: logForm.value.catatan || undefined,
    })
    await ops.fetchOne(id)
    showLogModal.value = false
    logForm.value = { status_ke: '', catatan: '' }
    flash('Log ditambahkan')
  } catch { flash('Gagal tambah log') }
  finally { logSubmitting.value = false }
}

async function handleAddWo() {
  if (!woForm.value.tgl_jadwal || !woForm.value.deskripsi_tugas) {
    woError.value = 'Jadwal dan deskripsi wajib diisi'; return
  }
  woSubmitting.value = true; woError.value = ''
  try {
    await proyek.createWo({
      jenis_wo: woForm.value.jenis_wo,
      id_ticket: id,
      id_site: ops.current!.site!.id_site,
      tipe_eksekutor: woForm.value.tipe_eksekutor,
      id_teknisi_internal: woForm.value.tipe_eksekutor === 'Internal_NEXT1' && woForm.value.id_teknisi_internal ? woForm.value.id_teknisi_internal : undefined,
      fee_vendor: woForm.value.fee_vendor || undefined,
      tgl_jadwal: new Date(woForm.value.tgl_jadwal).toISOString(),
      deskripsi_tugas: woForm.value.deskripsi_tugas,
    })
    await ops.fetchOne(id)
    showWoModal.value = false
    woForm.value = { jenis_wo: 'Troubleshoot', tipe_eksekutor: 'Internal_NEXT1', id_teknisi_internal: 0, fee_vendor: 0, tgl_jadwal: '', deskripsi_tugas: '' }
    flash('Work Order dibuat')
  } catch (e: any) { woError.value = e.response?.data?.message || 'Gagal' }
  finally { woSubmitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }
function fmtDt(d?: string) {
  return d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}
function statusLabel(s: string) { return s.replace('_', ' ') }
function ageHours(d: string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  return h < 24 ? `${h} jam` : `${Math.floor(h / 24)} hari`
}
</script>

<template>
  <div class="page">
    <div v-if="ops.loading && !ops.current" class="loading-page">Memuat...</div>
    <template v-else-if="ops.current">
      <!-- Header -->
      <div class="page-header">
        <div>
          <button class="btn-back" @click="router.push('/operations')">← Operasional</button>
          <h2>{{ ops.current.nomor_tiket }}</h2>
          <p class="sub">{{ ops.current.judul_tiket }}</p>
        </div>
        <div class="header-right">
          <span class="prioritas-badge" :style="{ color: PRIORITAS_COLOR[ops.current.prioritas], background: PRIORITAS_COLOR[ops.current.prioritas] + '20' }">
            ● {{ ops.current.prioritas }}
          </span>
          <span class="status-big"
            :style="{ background: STATUS_COLOR[ops.current.status_tiket]?.bg, color: STATUS_COLOR[ops.current.status_tiket]?.color }">
            {{ statusLabel(ops.current.status_tiket) }}
          </span>
          <button class="btn-edit" @click="openEdit">Edit</button>
        </div>
      </div>

      <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-chip">
          <span class="ic-label">Pelanggan</span>
          <span class="ic-value fw">{{ ops.current.site?.pelanggan?.nama_pelanggan }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Site</span>
          <span class="ic-value">{{ ops.current.site?.nama_site }} <span class="text-gray">· {{ ops.current.site?.kota }}</span></span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Layanan</span>
          <span class="ic-value">{{ ops.current.site?.layanan?.nama_layanan || '—' }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Teknisi PIC</span>
          <span class="ic-value fw">{{ ops.current.teknisi?.nama_lengkap || 'Belum assigned' }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Sumber</span>
          <span class="ic-value">{{ ops.current.sumber_tiket }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Durasi</span>
          <span class="ic-value" style="color:#f97316;font-weight:700">{{ ageHours(ops.current.tgl_open) }}</span>
        </div>
      </div>

      <div v-if="ops.current.deskripsi_masalah" class="deskripsi-box">
        <strong>Deskripsi:</strong> {{ ops.current.deskripsi_masalah }}
      </div>

      <div class="two-col">
        <!-- Work Orders -->
        <div class="section-card">
          <div class="section-header">
            <span class="card-title">Surat Tugas ({{ ops.current.work_orders?.length ?? 0 }})</span>
            <button class="btn-add-small" @click="showWoModal = true; woError = ''">+ Surat Tugas</button>
          </div>
          <div v-if="!ops.current.work_orders?.length" class="empty-section">Belum ada surat tugas</div>
          <div v-for="wo in ops.current.work_orders" :key="wo.id_wo" class="wo-item">
            <div class="wo-left">
              <div class="wo-nomor">{{ wo.nomor_wo }}</div>
              <div class="wo-jenis">{{ wo.jenis_wo }}</div>
              <div class="wo-date">{{ fmtDt(wo.tgl_jadwal) }}</div>
            </div>
            <div class="wo-mid">
              <div class="wo-desc">{{ wo.deskripsi_tugas }}</div>
              <div class="wo-exec text-gray">{{ wo.teknisi?.nama_lengkap || wo.vendor?.nama_vendor || '—' }}</div>
            </div>
            <div class="wo-status" :style="{ color: WO_STATUS_COLOR[wo.status_wo] }">{{ wo.status_wo }}</div>
          </div>
        </div>

        <!-- Activity Log -->
        <div class="section-card">
          <div class="section-header">
            <span class="card-title">Log Aktivitas ({{ ops.current.logs?.length ?? 0 }})</span>
            <button class="btn-add-small" @click="showLogModal = true">+ Tambah Log</button>
          </div>
          <div v-if="!ops.current.logs?.length" class="empty-section">Belum ada log</div>
          <div v-for="log in ops.current.logs" :key="log.id_log" class="log-item">
            <div class="log-dot" :style="{ background: log.status_ke ? STATUS_COLOR[log.status_ke]?.color || '#64748b' : '#cbd5e1' }"></div>
            <div class="log-body">
              <div class="log-status" v-if="log.status_ke">
                <span class="log-badge" :style="{ background: STATUS_COLOR[log.status_ke]?.bg, color: STATUS_COLOR[log.status_ke]?.color }">
                  {{ statusLabel(log.status_ke) }}
                </span>
              </div>
              <div class="log-catatan" v-if="log.catatan">{{ log.catatan }}</div>
              <div class="log-meta">{{ log.user?.karyawan?.nama_lengkap || 'System' }} · {{ fmtDt(log.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tiket Lain di Site -->
      <template v-if="ops.current.related_tickets?.length">
        <div class="related-header">
          Tiket lain di <strong>{{ ops.current.site?.nama_site }}</strong>
        </div>
        <div class="related-list">
          <div v-for="t in ops.current.related_tickets" :key="t.id_ticket"
            class="related-item" @click="router.push(`/operations/${t.id_ticket}`)">
            <div class="rel-left">
              <div class="rel-nomor">{{ t.nomor_tiket }}</div>
              <div class="rel-judul">{{ t.judul_tiket }}</div>
            </div>
            <div class="rel-right">
              <span class="prio-dot" :style="{ color: PRIORITAS_COLOR[t.prioritas] }">● {{ t.prioritas }}</span>
              <span class="rel-status"
                :style="{ background: STATUS_COLOR[t.status_tiket]?.bg, color: STATUS_COLOR[t.status_tiket]?.color }">
                {{ statusLabel(t.status_tiket) }}
              </span>
              <span class="rel-arrow">›</span>
            </div>
          </div>
        </div>
      </template>

      <!-- Modal Edit -->
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal">
          <h3>Edit Tiket</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Judul Tiket</label>
              <input v-model="editForm.judul_tiket" />
            </div>
            <div class="field">
              <label>Status</label>
              <select v-model="editForm.status_tiket">
                <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
            </div>
            <div class="field">
              <label>Prioritas</label>
              <select v-model="editForm.prioritas">
                <option v-for="p in PRIORITAS_LIST" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Assign Teknisi</label>
              <select v-model="editForm.id_teknisi_pic">
                <option :value="0">— Belum di-assign —</option>
                <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Deskripsi Masalah</label>
              <textarea v-model="editForm.deskripsi_masalah" rows="3"></textarea>
            </div>
          </div>
          <p v-if="editError" class="form-error">{{ editError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showEditModal = false">Batal</button>
            <button class="btn-submit" @click="handleEdit" :disabled="editSubmitting">
              {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Tambah Log -->
      <div v-if="showLogModal" class="modal-overlay" @click.self="showLogModal = false">
        <div class="modal">
          <h3>Tambah Log</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Update Status (opsional)</label>
              <select v-model="logForm.status_ke">
                <option value="">— Tidak ubah status —</option>
                <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ statusLabel(s) }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Catatan</label>
              <textarea v-model="logForm.catatan" rows="3" placeholder="Update kondisi, tindakan yang dilakukan..."></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showLogModal = false">Batal</button>
            <button class="btn-submit" @click="handleAddLog" :disabled="logSubmitting">
              {{ logSubmitting ? 'Menyimpan...' : 'Tambah' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Buat Surat Tugas -->
      <div v-if="showWoModal" class="modal-overlay" @click.self="showWoModal = false">
        <div class="modal">
          <h3>Buat Surat Tugas</h3>
          <div class="form-grid">
            <div class="field">
              <label>Jenis Tugas</label>
              <select v-model="woForm.jenis_wo">
                <option v-for="j in JENIS_WO" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="field">
              <label>Eksekutor</label>
              <select v-model="woForm.tipe_eksekutor">
                <option value="Internal_NEXT1">Internal NEXT1</option>
                <option value="Vendor_Ketiga">Vendor Ketiga</option>
              </select>
            </div>
            <div class="field" v-if="woForm.tipe_eksekutor === 'Internal_NEXT1'">
              <label>Teknisi</label>
              <select v-model="woForm.id_teknisi_internal">
                <option :value="0">— Pilih —</option>
                <option v-for="t in ops.teknisiList" :key="t.id_karyawan" :value="t.id_karyawan">{{ t.nama_lengkap }}</option>
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
              <textarea v-model="woForm.deskripsi_tugas" rows="3" placeholder="Tugas teknisi..."></textarea>
            </div>
          </div>
          <p v-if="woError" class="form-error">{{ woError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showWoModal = false">Batal</button>
            <button class="btn-submit" @click="handleAddWo" :disabled="woSubmitting">
              {{ woSubmitting ? 'Membuat...' : 'Buat Surat Tugas' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.loading-page { padding: 60px; text-align: center; color: #94a3b8; }
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-right { display: flex; align-items: center; gap: 10px; }
.prioritas-badge { padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; }
.status-big { padding: 5px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; }
.btn-edit { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }

.info-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.info-chip { background: #fff; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); flex: 1; min-width: 130px; }
.ic-label { display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
.ic-value { font-size: 14px; color: #0f172a; }
.fw { font-weight: 700; }
.text-gray { color: #64748b; }

.deskripsi-box { background: #f8fafc; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #475569; margin-bottom: 16px; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.section-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.card-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
.btn-add-small { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.empty-section { color: #94a3b8; font-size: 13px; padding: 12px 0; }

.wo-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
.wo-left { min-width: 130px; }
.wo-nomor { font-size: 12px; font-weight: 700; color: #1d4ed8; }
.wo-jenis { font-size: 11px; color: #64748b; }
.wo-date { font-size: 11px; color: #94a3b8; }
.wo-mid { flex: 1; }
.wo-desc { font-size: 13px; color: #0f172a; margin-bottom: 2px; }
.wo-exec { font-size: 11px; }
.wo-status { font-size: 12px; font-weight: 700; min-width: 60px; text-align: right; }

.log-item { display: flex; gap: 10px; margin-bottom: 12px; }
.log-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.log-body { flex: 1; }
.log-status { margin-bottom: 4px; }
.log-badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.log-catatan { font-size: 13px; color: #374151; margin-bottom: 3px; }
.log-meta { font-size: 11px; color: #94a3b8; }

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
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

/* Related tickets */
.related-header { font-size: 13px; font-weight: 600; color: #64748b; margin: 20px 0 10px; }
.related-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.related-item { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; cursor: pointer; transition: border-color 0.15s; }
.related-item:hover { border-color: #3b82f6; }
.rel-left { flex: 1; min-width: 0; }
.rel-nomor { font-size: 13px; font-weight: 700; color: #0f172a; }
.rel-judul { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rel-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.prio-dot { font-size: 11px; font-weight: 700; }
.rel-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.rel-arrow { color: #94a3b8; font-size: 16px; }

@media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }
</style>
