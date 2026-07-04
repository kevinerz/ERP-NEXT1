<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

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
  if (!confirm('Hapus kontak ' + k.nama + '?')) return
  try {
    await api.delete('/master/kontak-teknisi/' + k.id_kontak)
    flash('Kontak dihapus')
    fetchData()
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus kontak')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Kontak Teknisi / Pemasang</h2>
        <p class="sub">Direktori orang pemasang & teknisi pihak ketiga</p>
      </div>
      <button class="btn-primary" @click="openAdd">+ Tambah Kontak</button>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama, HP, asal, keahlian..." class="input-search" />
      <div class="filter-group">
        <label class="filter-label">Status:</label>
        <select v-model="filterAktif" @change="doSearch" class="select-filter">
          <option value="">Semua</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </div>
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="error" class="alert-error">{{ error }}</div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Nama</th>
            <th style="width:140px">HP / WA</th>
            <th>Keahlian</th>
            <th>Rekening Bank</th>
            <th style="width:100px">Status</th>
            <th style="width:180px">Aksi</th>
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
          <tr v-for="k in rows" :key="k.id_kontak" class="table-row">
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
              <span :class="k.is_aktif ? 'badge-aktif' : 'badge-nonaktif'">
                {{ k.is_aktif ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-edit" @click="openEdit(k)">Edit</button>
              <button
                :class="k.is_aktif ? 'btn-nonaktif' : 'btn-aktif'"
                @click="handleToggle(k)"
              >{{ k.is_aktif ? 'Nonaktifkan' : 'Aktifkan' }}</button>
              <button
                v-if="!k.is_aktif"
                class="btn-hapus"
                @click="hapusKontak(k)"
              >Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="meta.total_pages > 1" class="pagination">
        <button
          v-for="p in meta.total_pages"
          :key="p"
          :class="['page-btn', { active: p === meta.page }]"
          @click="goPage(p)"
        >{{ p }}</button>
      </div>
      <div class="table-footer" v-if="meta.total">
        Total: {{ meta.total }} kontak
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ isEdit ? 'Edit Kontak' : 'Tambah Kontak' }}</h3>
        <div class="form-grid">
          <div class="field">
            <label>Nama <span class="req">*</span></label>
            <input v-model="form.nama" placeholder="Nama teknisi / pemasang" />
          </div>
          <div class="field">
            <label>No. HP / WA <span class="req">*</span></label>
            <input v-model="form.no_hp" placeholder="08xx-xxxx" />
          </div>
          <div class="field">
            <label>Asal / Perusahaan</label>
            <input v-model="form.asal_vendor" placeholder="Nama perusahaan / vendor asal" />
          </div>
          <div class="field">
            <label>Keahlian</label>
            <input v-model="form.keahlian" placeholder="FO splicing, wireless, CCTV…" />
          </div>
          <div class="field" v-if="isEdit">
            <label>Status</label>
            <select v-model="form.is_aktif">
              <option :value="true">Aktif</option>
              <option :value="false">Nonaktif</option>
            </select>
          </div>
          <div class="field full">
            <label>Alamat</label>
            <textarea v-model="form.alamat" rows="2" placeholder="Alamat lengkap"></textarea>
          </div>

          <div class="field full bank-divider">🏦 Rekening Bank (untuk pembayaran)</div>
          <div class="field">
            <label>Bank</label>
            <input v-model="form.bank_nama" placeholder="BCA / Mandiri / BNI ..." />
          </div>
          <div class="field">
            <label>No. Rekening</label>
            <input v-model="form.bank_no_rekening" placeholder="1234567890" />
          </div>
          <div class="field full">
            <label>Atas Nama</label>
            <input v-model="form.bank_atas_nama" placeholder="Nama pemilik rekening" />
          </div>

          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2" placeholder="Opsional"></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-label { font-size: 13px; color: #64748b; font-weight: 500; white-space: nowrap; }
.input-search {
  flex: 1; min-width: 180px; padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc;
}
.input-search:focus { border-color: #3b82f6; background: #fff; }
.select-filter { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; }
.btn-search { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 16px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 16px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.table-row { transition: background 0.15s; }
.table-row:hover { background: #f8fafc; }
.empty-state { text-align: center; padding: 52px 20px; }
.empty-icon { font-size: 36px; margin-bottom: 12px; }
.empty-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: #94a3b8; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw600 { font-weight: 600; }
.text-sm { font-size: 12px; }
.bank-divider {
  font-size: 12px; font-weight: 700; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.05em;
  border-top: 1px solid #f1f5f9; padding-top: 12px; margin-top: 4px;
}
.text-gray { color: #64748b; }

.wa-link { color: #15803d; font-weight: 600; text-decoration: none; }
.wa-link:hover { text-decoration: underline; }

.keahlian-badge { background: #eff6ff; color: #1d4ed8; padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.badge-aktif { background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-nonaktif { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 12px; }

.actions { display: flex; gap: 6px; align-items: center; }
.btn-edit { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-nonaktif { padding: 5px 12px; background: #fff7ed; color: #c2410c; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-aktif { padding: 5px 12px; background: #f0fdf4; color: #15803d; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-hapus { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem; }

.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.pagination { display: flex; gap: 6px; padding: 16px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 540px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea {
  padding: 9px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a;
}
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 4px 0 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
