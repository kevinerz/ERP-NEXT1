<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route  = useRoute()
const router = useRouter()
const id     = Number(route.params.id)

const pic     = ref<any>(null)
const loading = ref(true)
const err     = ref('')

// Edit form
const showEdit  = ref(false)
const editForm  = ref<any>({})
const editErr   = ref('')
const editSave  = ref(false)

const MEDIA_LIST   = ['WhatsApp', 'Email', 'Telepon', 'Tatap Muka']
const RENCANA_LIST = ['Internet', 'Belum ada rencana', 'Masih dipertimbangkan']

onMounted(fetchDetail)

async function fetchDetail() {
  loading.value = true; err.value = ''
  try {
    const res = await api.get(`/crm/pic/${id}`)
    pic.value = res.data.data
  } catch { err.value = 'Data PIC tidak ditemukan' }
  finally { loading.value = false }
}

function openEdit() {
  const p = pic.value
  editForm.value = {
    id_site: p.id_site,
    nama_pic: p.nama_pic,
    jabatan: p.jabatan || '',
    no_kontak: p.no_kontak || '',
    email: p.email || '',
    is_utama: p.is_utama,
    tempat_lahir: p.tempat_lahir || '',
    tgl_lahir: p.tgl_lahir ? p.tgl_lahir.split('T')[0] : '',
    media_komunikasi: p.media_komunikasi || '',
    rencana_tambah_layanan: p.rencana_tambah_layanan || '',
    catatan_update: '',
  }
  editErr.value = ''
  showEdit.value = true
}

async function handleEdit() {
  editSave.value = true; editErr.value = ''
  try {
    await api.put(`/crm/pic/${id}`, editForm.value)
    showEdit.value = false
    await fetchDetail()
  } catch (e: any) { editErr.value = e.response?.data?.message || 'Gagal' }
  finally { editSave.value = false }
}

async function handleDelete() {
  if (!confirm('Hapus PIC ini? Aksi tidak bisa dibatalkan.')) return
  try {
    await api.delete(`/crm/pic/${id}`)
    router.push('/crm/pic')
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal hapus') }
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtDatetime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function parseSnapshot(s: string) {
  try { return JSON.parse(s) } catch { return {} }
}
</script>

<template>
  <div class="page">
    <div class="breadcrumb">
      <span class="crumb" @click="router.push('/crm/pic')">CRM / PIC</span>
      <span class="sep">›</span>
      <span class="crumb-active">Detail PIC</span>
    </div>

    <div v-if="loading" class="loading">Memuat...</div>
    <div v-else-if="err" class="err-msg">{{ err }}</div>

    <div v-else-if="pic">
      <div class="header-row">
        <div>
          <h2>{{ pic.nama_pic }}</h2>
          <p class="sub">{{ pic.jabatan || '—' }} · {{ pic.site?.pelanggan?.nama_pelanggan }} / {{ pic.site?.nama_site }}</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-edit" @click="openEdit">Edit</button>
          <button class="btn-del" @click="handleDelete">Hapus</button>
        </div>
      </div>

      <div class="card-grid">
        <!-- Kontak -->
        <div class="card">
          <div class="card-title">Informasi Kontak</div>
          <dl class="dl">
            <div class="dl-row"><dt>No. HP / WA</dt><dd>{{ pic.no_kontak || '—' }}</dd></div>
            <div class="dl-row"><dt>Email</dt><dd>{{ pic.email || '—' }}</dd></div>
            <div class="dl-row"><dt>Media Komunikasi</dt><dd>{{ pic.media_komunikasi || '—' }}</dd></div>
            <div class="dl-row"><dt>PIC Utama</dt><dd>{{ pic.is_utama ? 'Ya' : 'Tidak' }}</dd></div>
          </dl>
        </div>

        <!-- Data Pribadi -->
        <div class="card">
          <div class="card-title">Data Pribadi</div>
          <dl class="dl">
            <div class="dl-row"><dt>Tempat Lahir</dt><dd>{{ pic.tempat_lahir || '—' }}</dd></div>
            <div class="dl-row"><dt>Tanggal Lahir</dt><dd>{{ fmtDate(pic.tgl_lahir) }}</dd></div>
          </dl>
        </div>

        <!-- CRM -->
        <div class="card">
          <div class="card-title">Informasi CRM</div>
          <dl class="dl">
            <div class="dl-row"><dt>Rencana Tambah Layanan</dt><dd>{{ pic.rencana_tambah_layanan || '—' }}</dd></div>
            <div class="dl-row"><dt>Update Terakhir</dt><dd>{{ fmtDatetime(pic.tgl_update_data) }}</dd></div>
          </dl>
        </div>
      </div>

      <!-- Riwayat Update -->
      <div class="card-full">
        <div class="card-title">Riwayat Update Data</div>
        <div v-if="!pic.history?.length" class="empty-history">Belum ada riwayat update.</div>
        <div v-else>
          <div v-for="h in pic.history" :key="h.id_log" class="history-item">
            <div class="history-meta">
              <span class="badge-sumber">{{ h.sumber }}</span>
              <span class="history-time">{{ fmtDatetime(h.created_at) }}</span>
            </div>
            <div v-if="h.catatan" class="history-catatan">{{ h.catatan }}</div>
            <div class="snapshot-grid">
              <div v-for="(val, key) in parseSnapshot(h.data_snapshot)" :key="String(key)" class="snap-row">
                <span class="snap-key">{{ String(key) }}</span>
                <span class="snap-val">{{ val ?? '—' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Edit -->
    <div v-if="showEdit" class="modal-overlay" @click.self="showEdit = false">
      <div class="modal">
        <h3>Edit Data PIC</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Nama PIC <span class="req">*</span></label>
            <input v-model="editForm.nama_pic" />
          </div>
          <div class="field">
            <label>Jabatan</label>
            <input v-model="editForm.jabatan" />
          </div>
          <div class="field">
            <label>No. HP / WhatsApp</label>
            <input v-model="editForm.no_kontak" />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="editForm.email" type="email" />
          </div>
          <div class="field">
            <label>Tempat Lahir</label>
            <input v-model="editForm.tempat_lahir" />
          </div>
          <div class="field">
            <label>Tanggal Lahir</label>
            <input v-model="editForm.tgl_lahir" type="date" />
          </div>
          <div class="field">
            <label>Media Komunikasi</label>
            <select v-model="editForm.media_komunikasi">
              <option value="">— Pilih —</option>
              <option v-for="m in MEDIA_LIST" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="field">
            <label>Rencana Tambah Layanan</label>
            <select v-model="editForm.rencana_tambah_layanan">
              <option value="">— Pilih —</option>
              <option v-for="r in RENCANA_LIST" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan Update (opsional)</label>
            <textarea v-model="editForm.catatan_update" rows="2" placeholder="Keterangan perubahan data..."></textarea>
          </div>
        </div>
        <p v-if="editErr" class="form-error">{{ editErr }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEdit = false">Batal</button>
          <button class="btn-submit" @click="handleEdit" :disabled="editSave">{{ editSave ? 'Menyimpan...' : 'Simpan' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.breadcrumb { display: flex; gap: 6px; align-items: center; font-size: 13px; color: #64748b; margin-bottom: 20px; }
.crumb { cursor: pointer; color: #3b82f6; }
.crumb:hover { text-decoration: underline; }
.sep { color: #cbd5e1; }
.crumb-active { color: #0f172a; font-weight: 600; }
.loading { color: #94a3b8; padding: 40px; text-align: center; }
.err-msg  { color: #dc2626; padding: 20px; background: #fef2f2; border-radius: 10px; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.header-row h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-edit { padding: 9px 18px; background: #f0f9ff; color: #0369a1; border: 1.5px solid #bae6fd; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-del  { padding: 9px 18px; background: #fff1f2; color: #be123c; border: 1.5px solid #fecdd3; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
.card, .card-full { background: #fff; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.card-full { margin-bottom: 16px; }
.card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 14px; }
.dl { display: flex; flex-direction: column; gap: 10px; margin: 0; }
.dl-row { display: flex; gap: 12px; }
dt { font-size: 12px; font-weight: 600; color: #64748b; width: 140px; flex-shrink: 0; }
dd { font-size: 14px; color: #0f172a; margin: 0; }

.empty-history { color: #94a3b8; font-size: 13px; padding: 20px 0; text-align: center; }
.history-item { border-top: 1px solid #f1f5f9; padding: 14px 0; }
.history-item:first-child { border-top: none; }
.history-meta { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
.badge-sumber { padding: 2px 10px; background: #eff6ff; color: #1d4ed8; border-radius: 10px; font-size: 11px; font-weight: 700; }
.history-time { font-size: 12px; color: #94a3b8; }
.history-catatan { font-size: 13px; color: #374151; margin-bottom: 10px; font-style: italic; }
.snapshot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px; }
.snap-row { display: flex; gap: 8px; font-size: 12px; }
.snap-key { color: #64748b; font-weight: 600; min-width: 130px; }
.snap-val { color: #0f172a; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 18px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; resize: vertical; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 10px 0 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
