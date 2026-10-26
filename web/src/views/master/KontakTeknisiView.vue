<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { confirmDialog, alertError } from '@/composables/useDialog'
import api from '@/services/api'
import BasePagination from '@/components/BasePagination.vue'

interface KontakTeknisi {
  id_kontak: number
  nama: string
  no_hp: string
  alamat: string | null
  asal_vendor: string | null
  keahlian: string | null
  bank_nama: string | null
  bank_no_rekening: string | null
  bank_atas_nama: string | null
  catatan: string | null
  is_aktif: boolean
  created_at: string
}

const rows = ref<KontakTeknisi[]>([])
const meta = ref({ total: 0, page: 1, limit: 20, total_pages: 0 })
const loading = ref(false)
const error = ref('')

const search = ref('')
const filterAktif = ref('')
const page = ref(1)

// Modal
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const form = ref({
  nama: '', no_hp: '', asal_vendor: '', keahlian: '',
  alamat: '',
  bank_nama: '', bank_no_rekening: '', bank_atas_nama: '',
  catatan: '', is_aktif: true,
})
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

onMounted(() => {
  fetchData()
})

async function fetchData() {
  loading.value = true
  error.value = ''
  try {
    const params: any = { page: page.value }
    if (search.value) params.search = search.value
    if (filterAktif.value !== '') params.is_aktif = filterAktif.value
    const r = await api.get('/master/kontak-teknisi', { params })
    rows.value = r.data.data
    meta.value = r.data.meta
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Gagal memuat data'
  } finally {
    loading.value = false
  }
}

function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function waLink(noHp: string): string {
  let digits = noHp.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  return 'https://wa.me/' + digits
}

function flash(msg: string) {
  successMsg.value = msg
  setTimeout(() => successMsg.value = '', 3000)
}

function openAdd() {
  isEdit.value = false
  editId.value = null
  form.value = { nama: '', no_hp: '', asal_vendor: '', keahlian: '', alamat: '', bank_nama: '', bank_no_rekening: '', bank_atas_nama: '', catatan: '', is_aktif: true }
  formError.value = ''
  showModal.value = true
}

function openEdit(k: KontakTeknisi) {
  isEdit.value = true
  editId.value = k.id_kontak
  form.value = {
    nama: k.nama,
    no_hp: k.no_hp,
    asal_vendor: k.asal_vendor || '',
    keahlian: k.keahlian || '',
    alamat: k.alamat || '',
    bank_nama: k.bank_nama || '',
    bank_no_rekening: k.bank_no_rekening || '',
    bank_atas_nama: k.bank_atas_nama || '',
    catatan: k.catatan || '',
    is_aktif: k.is_aktif,
  }
  formError.value = ''
  showModal.value = true
}

async function handleSubmit() {
  if (!form.value.nama || !form.value.no_hp) {
    formError.value = 'Nama dan No. HP wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const payload: any = {
      nama: form.value.nama,
      no_hp: form.value.no_hp,
      asal_vendor: form.value.asal_vendor || undefined,
      keahlian: form.value.keahlian || undefined,
      alamat: form.value.alamat || undefined,
      bank_nama: form.value.bank_nama || undefined,
      bank_no_rekening: form.value.bank_no_rekening || undefined,
      bank_atas_nama: form.value.bank_atas_nama || undefined,
      catatan: form.value.catatan || undefined,
    }
    if (isEdit.value && editId.value) {
      payload.is_aktif = form.value.is_aktif
      await api.patch('/master/kontak-teknisi/' + editId.value, payload)
    } else {
      await api.post('/master/kontak-teknisi', payload)
    }
    showModal.value = false
    flash(isEdit.value ? 'Kontak diperbarui' : 'Kontak ditambahkan')
    fetchData()
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Terjadi kesalahan'
  } finally {
    submitting.value = false
  }
}

async function handleToggle(k: KontakTeknisi) {
  try {
    await api.patch('/master/kontak-teknisi/' + k.id_kontak + '/toggle')
    flash(`Kontak ${!k.is_aktif ? 'diaktifkan' : 'dinonaktifkan'}`)
    fetchData()
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Gagal ubah status'
  }
}

async function hapusKontak(k: KontakTeknisi) {
  if (!(await confirmDialog({ title: 'Hapus Kontak?', message: 'Hapus kontak ' + k.nama + '?', variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  try {
    await api.delete('/master/kontak-teknisi/' + k.id_kontak)
    flash('Kontak dihapus')
    fetchData()
  } catch (e: any) {
    await alertError(e, 'Gagal menghapus kontak')
  }
}

// ── SET PIN VENDOR ───────────────────────────────────────────────
const showPinModal = ref(false)
const pinTarget = ref<KontakTeknisi | null>(null)
const pinValue = ref('')
const pinSubmitting = ref(false)
const pinError = ref('')

function openSetPin(k: KontakTeknisi) {
  pinTarget.value = k
  pinValue.value = ''
  pinError.value = ''
  showPinModal.value = true
}

async function submitPin() {
  if (!pinValue.value || pinValue.value.length < 4) { pinError.value = 'PIN minimal 4 karakter'; return }
  pinSubmitting.value = true; pinError.value = ''
  try {
    await api.patch(`/master/kontak-teknisi/${pinTarget.value!.id_kontak}/set-pin`, { pin: pinValue.value })
    showPinModal.value = false
    flash('PIN berhasil diset untuk ' + pinTarget.value!.nama)
  } catch (e: any) { pinError.value = e.response?.data?.message || 'Gagal set PIN' }
  finally { pinSubmitting.value = false }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Kontak Teknisi / Pemasang</h2>
        <p class="sub">Direktori orang pemasang & teknisi pihak ketiga</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openAdd">+ Tambah Kontak</button>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama, HP, asal, keahlian..." class="search-input" />
      <div class="filter-group">
        <label class="filter-label">Status:</label>
        <select v-model="filterAktif" @change="doSearch" class="filter-select">
          <option value="">Semua</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </div>
      <button type="button" class="btn btn-secondary" @click="doSearch">Cari</button>
    </div>

    <div v-if="successMsg" class="alert alert-success">{{ successMsg }}</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading-state">Memuat...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Nama</th>
            <th style="width:140px">HP / WA</th>
            <th>Keahlian</th>
            <th>Rekening Bank</th>
            <th style="width:100px">Status</th>
            <th style="width:240px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td colspan="6">
              <div class="empty-state">
                <div class="empty-icon">🧰</div>
                <div class="empty-title">Belum ada kontak teknisi</div>
                <div class="empty-desc">Tambahkan kontak pemasang atau teknisi pertama Anda</div>
              </div>
            </td>
          </tr>
          <tr v-for="k in rows" :key="k.id_kontak">
            <td>
              <div class="fw600">{{ k.nama }}</div>
              <div class="text-gray text-sm" v-if="k.asal_vendor">{{ k.asal_vendor }}</div>
            </td>
            <td>
              <a :href="waLink(k.no_hp)" target="_blank" rel="noopener" class="wa-link">{{ k.no_hp }}</a>
            </td>
            <td>
              <span v-if="k.keahlian" class="keahlian-badge">{{ k.keahlian }}</span>
              <span v-else class="text-gray">—</span>
            </td>
            <td>
              <template v-if="k.bank_no_rekening">
                <div class="fw600">{{ k.bank_nama }} · {{ k.bank_no_rekening }}</div>
                <div class="text-gray text-sm">a.n. {{ k.bank_atas_nama || '—' }}</div>
              </template>
              <span v-else class="text-gray">—</span>
            </td>
            <td>
              <span :class="['badge', k.is_aktif ? 'badge-green' : 'badge-red']">
                {{ k.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td>
              <div class="actions">
                <button type="button" class="btn btn-sm btn-soft-blue" @click="openEdit(k)">Edit</button>
                <button type="button" class="btn btn-sm btn-soft-pin" @click="openSetPin(k)">🔑 Set PIN</button>
                <button
                  type="button"
                  :class="['btn btn-sm', k.is_aktif ? 'btn-soft-warning' : 'btn-soft-success']"
                  @click="handleToggle(k)"
                >{{ k.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
                <button
                  v-if="!k.is_aktif"
                  type="button"
                  class="btn btn-sm btn-soft-danger"
                  @click="hapusKontak(k)"
                >Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <BasePagination :page="page" :total-pages="meta.total_pages" @change="goPage" />
      <div class="table-footer" v-if="meta.total">
        Total: {{ Number(meta.total).toLocaleString('id-ID') }} kontak
      </div>
    </div>

    <!-- Modal Set PIN -->
    <div v-if="showPinModal" class="modal-overlay" @click.self="showPinModal = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3 class="modal-title">Set PIN Login Vendor</h3>
          <button type="button" class="btn-modal-close" @click="showPinModal = false">×</button>
        </div>
        <div class="modal-body">
          <p class="pin-info">PIN untuk <b>{{ pinTarget?.nama }}</b> agar bisa login di aplikasi mobile vendor.</p>
          <div class="form-group">
            <label class="form-label">PIN (4–10 digit)</label>
            <input type="password" v-model="pinValue" class="form-input" placeholder="••••" maxlength="10" @keyup.enter="submitPin" />
          </div>
          <div v-if="pinError" class="alert alert-danger modal-alert">{{ pinError }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showPinModal = false">Batal</button>
          <button type="button" class="btn btn-primary" @click="submitPin" :disabled="pinSubmitting">
            {{ pinSubmitting ? 'Menyimpan...' : 'Set PIN' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ isEdit ? 'Edit Kontak' : 'Tambah Kontak' }}</h3>
          <button type="button" class="btn-modal-close" @click="showModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label form-required">Nama</label>
              <input v-model="form.nama" class="form-input" placeholder="Nama teknisi / pemasang" />
            </div>
            <div class="form-group">
              <label class="form-label form-required">No. HP / WA</label>
              <input v-model="form.no_hp" class="form-input" placeholder="08xx-xxxx" />
            </div>
            <div class="form-group">
              <label class="form-label">Asal / Perusahaan</label>
              <input v-model="form.asal_vendor" class="form-input" placeholder="Nama perusahaan / vendor asal" />
            </div>
            <div class="form-group">
              <label class="form-label">Keahlian</label>
              <input v-model="form.keahlian" class="form-input" placeholder="FO splicing, wireless, CCTV…" />
            </div>
            <div class="form-group" v-if="isEdit">
              <label class="form-label">Status</label>
              <select v-model="form.is_aktif" class="form-select">
                <option :value="true">Aktif</option>
                <option :value="false">Nonaktif</option>
              </select>
            </div>
            <div class="form-group full">
              <label class="form-label">Alamat</label>
              <textarea v-model="form.alamat" class="form-textarea" rows="2" placeholder="Alamat lengkap"></textarea>
            </div>

            <div class="full bank-divider">🏦 Rekening Bank (untuk pembayaran)</div>
            <div class="form-group">
              <label class="form-label">Bank</label>
              <input v-model="form.bank_nama" class="form-input" placeholder="BCA / Mandiri / BNI ..." />
            </div>
            <div class="form-group">
              <label class="form-label">No. Rekening</label>
              <input v-model="form.bank_no_rekening" class="form-input" placeholder="1234567890" />
            </div>
            <div class="form-group full">
              <label class="form-label">Atas Nama</label>
              <input v-model="form.bank_atas_nama" class="form-input" placeholder="Nama pemilik rekening" />
            </div>

            <div class="form-group full">
              <label class="form-label">Catatan</label>
              <textarea v-model="form.catatan" class="form-textarea" rows="2" placeholder="Opsional"></textarea>
            </div>
          </div>
          <div v-if="formError" class="alert alert-danger modal-alert">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showModal = false">Batal</button>
          <button type="button" class="btn btn-primary" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1100px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-1); }
.sub { margin: 0; font-size: 13px; color: var(--text-3); }

.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-label { font-size: 13px; color: var(--text-3); font-weight: 500; white-space: nowrap; }
.filter-bar .search-input { flex: 1; min-width: 180px; }

.alert { margin-bottom: 12px; }
.modal-alert { margin: 14px 0 0; }

.fw600 { font-weight: 600; color: var(--text-1); }
.text-sm { font-size: 12px; }
.bank-divider {
  font-size: 12px; font-weight: 700; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.05em;
  border-top: 1px solid var(--border-light); padding-top: 12px; margin-top: 4px;
}
.text-gray { color: var(--text-3); }

.wa-link { color: var(--success); font-weight: 600; text-decoration: none; white-space: nowrap; }
.wa-link:hover { text-decoration: underline; }

.keahlian-badge { display: inline-block; background: var(--primary-light); color: var(--primary); padding: 3px 10px; border-radius: var(--r-sm); font-size: 12px; font-weight: 600; }

.actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.btn-soft-blue { background: var(--primary-light); color: var(--primary); }
.btn-soft-blue:hover { background: #dbeafe; }
.btn-soft-pin { background: #fefce8; color: #854d0e; }
.btn-soft-pin:hover { background: #fef9c3; }
.btn-soft-warning { background: #fff7ed; color: #c2410c; }
.btn-soft-warning:hover { background: #ffedd5; }
.btn-soft-success { background: var(--success-light); color: var(--success); }
.btn-soft-success:hover { background: #dcfce7; }
.btn-soft-danger { background: var(--danger-light); color: var(--danger); border: 1px solid #fecaca; }
.btn-soft-danger:hover { background: #fee2e2; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
.pin-info { font-size: 13px; color: var(--text-2); margin: 0 0 14px; }

.table-footer { padding: 10px 16px; font-size: 12px; color: var(--text-muted); text-align: right; border-top: 1px solid var(--border-light); }

/* Modal */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-group.full, .bank-divider.full { grid-column: 1 / -1; }

@media (max-width: 768px) {
  .filter-group { flex: 1 1 140px; }
  .filter-group .filter-select { flex: 1; width: 100%; }
}
</style>
