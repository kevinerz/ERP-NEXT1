<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMasterStore } from '@/stores/master'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import api from '@/services/api'
import BasePagination from '@/components/BasePagination.vue'

const master = useMasterStore()
const page = ref(1)
const search = ref('')
const viewMode = ref<'list' | 'grup'>('grup')
const expandedGrup = ref<Set<number>>(new Set())

// ─── Grup Modal ───────────────────────────────────────────
const showGrupModal = ref(false)
const grupEditId = ref(0)
const grupForm = ref({ kode_grup: '', nama_grup: '', deskripsi: '' })
const grupSubmitting = ref(false)
const grupFormError = ref('')

function openAddGrup() {
  grupEditId.value = 0
  grupForm.value = { kode_grup: '', nama_grup: '', deskripsi: '' }
  grupFormError.value = ''
  showGrupModal.value = true
}

function openEditGrup(g: any) {
  grupEditId.value = g.id_grup
  grupForm.value = { kode_grup: g.kode_grup, nama_grup: g.nama_grup, deskripsi: g.deskripsi || '' }
  grupFormError.value = ''
  showGrupModal.value = true
}

async function handleGrupSubmit() {
  if (!grupForm.value.kode_grup || !grupForm.value.nama_grup) {
    grupFormError.value = 'Kode dan Nama Grup wajib diisi'
    return
  }
  grupSubmitting.value = true
  grupFormError.value = ''
  try {
    const payload: any = { ...grupForm.value }
    if (!payload.deskripsi) delete payload.deskripsi
    if (grupEditId.value) {
      await master.updateGrup(grupEditId.value, payload)
      flash('Grup berhasil diperbarui')
    } else {
      await master.createGrup(payload)
      flash('Grup berhasil ditambahkan')
    }
    showGrupModal.value = false
    master.fetchGrupPelanggan()
  } catch (e: any) {
    grupFormError.value = e.response?.data?.message || 'Gagal menyimpan grup'
  } finally {
    grupSubmitting.value = false
  }
}

const confirmHapusGrup = ref(false)
const hapusGrupTarget = ref<{ id: number; nama: string } | null>(null)
const hapusGrupError = ref('')

function hapusGrup(id: number, nama: string) {
  hapusGrupTarget.value = { id, nama }
  hapusGrupError.value = ''
  confirmHapusGrup.value = true
}

async function doHapusGrup() {
  if (!hapusGrupTarget.value) return
  try {
    await master.removeGrup(hapusGrupTarget.value.id)
    confirmHapusGrup.value = false
    flash('Grup dihapus')
    master.fetchGrupPelanggan()
  } catch (e: any) {
    hapusGrupError.value = e.response?.data?.message || 'Gagal menghapus grup'
    confirmHapusGrup.value = false
  }
}

const showModal = ref(false)
const editId = ref(0)

function emptyForm() {
  return {
    kode_pelanggan: '',
    nama_pelanggan: '',
    id_grup: null as number | null,
    jenis_usaha: '',
    alamat_kantor: '',
    kota: '',
    no_telp: '',
    npwp: '',
    nama_pemilik: '',
    jabatan_pemilik: '',
    no_ktp_pemilik: '',
    no_ponsel_pemilik: '',
    nama_pic_teknis: '',
    jabatan_pic_teknis: '',
    no_telp_pic_teknis: '',
    no_ponsel_pic_teknis: '',
    email_pic_teknis: '',
    nama_pic_keuangan: '',
    jabatan_pic_keuangan: '',
    no_telp_pic_keuangan: '',
    no_ponsel_pic_keuangan: '',
    email_pic_keuangan: '',
    alamat_penagihan: '',
    email_billing: '',
    nama_pic_utama: '',
    no_hp_pic_utama: '',
  }
}

const form = ref(emptyForm())
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

onMounted(() => {
  fetchData()
  master.fetchGrupPelanggan()
})

function fetchData() {
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  master.fetchPelanggan(params)
}
function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function toggleGrup(id: number) {
  if (expandedGrup.value.has(id)) expandedGrup.value.delete(id)
  else expandedGrup.value.add(id)
}

// Standalone = pelanggan tanpa grup
const standalonePelanggan = computed(() =>
  master.pelangganList.filter(p => !p.id_grup)
)

function openAdd() {
  editId.value = 0
  form.value = emptyForm()
  formError.value = ''
  showModal.value = true
}

function openEdit(p: any) {
  editId.value = p.id_pelanggan
  form.value = {
    kode_pelanggan: p.kode_pelanggan || '',
    nama_pelanggan: p.nama_pelanggan || '',
    id_grup: p.id_grup ?? null,
    jenis_usaha: p.jenis_usaha || '',
    alamat_kantor: p.alamat_kantor || '',
    kota: p.kota || '',
    no_telp: p.no_telp || '',
    npwp: p.npwp || '',
    nama_pemilik: p.nama_pemilik || '',
    jabatan_pemilik: p.jabatan_pemilik || '',
    no_ktp_pemilik: p.no_ktp_pemilik || '',
    no_ponsel_pemilik: p.no_ponsel_pemilik || '',
    nama_pic_teknis: p.nama_pic_teknis || '',
    jabatan_pic_teknis: p.jabatan_pic_teknis || '',
    no_telp_pic_teknis: p.no_telp_pic_teknis || '',
    no_ponsel_pic_teknis: p.no_ponsel_pic_teknis || '',
    email_pic_teknis: p.email_pic_teknis || '',
    nama_pic_keuangan: p.nama_pic_keuangan || '',
    jabatan_pic_keuangan: p.jabatan_pic_keuangan || '',
    no_telp_pic_keuangan: p.no_telp_pic_keuangan || '',
    no_ponsel_pic_keuangan: p.no_ponsel_pic_keuangan || '',
    email_pic_keuangan: p.email_pic_keuangan || '',
    alamat_penagihan: p.alamat_penagihan || '',
    email_billing: p.email_billing || '',
    nama_pic_utama: p.nama_pic_utama || '',
    no_hp_pic_utama: p.no_hp_pic_utama || '',
  }
  formError.value = ''
  showModal.value = true
}

// Edit dari grup view (hanya punya id)
async function openEditById(id: number) {
  try {
    const found = master.pelangganList.find(p => p.id_pelanggan === id)
    if (found) { openEdit(found); return }
    const { data } = await api.get(`/master/pelanggan/${id}`)
    openEdit(data.data ?? data)
  } catch {}
}

async function handleSubmit() {
  if (!form.value.kode_pelanggan || !form.value.nama_pelanggan) {
    formError.value = 'Kode dan Nama Perusahaan wajib diisi'
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const payload: any = { ...form.value }
    if (!payload.id_grup) delete payload.id_grup
    Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k] })
    if (editId.value) {
      await master.updatePelanggan(editId.value, payload)
      flash('Data pelanggan diperbarui')
    } else {
      await master.createPelanggan(payload)
      flash('Pelanggan berhasil ditambahkan')
    }
    showModal.value = false
    fetchData()
    master.fetchGrupPelanggan()
    master.pelangganDropdown = []
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Gagal menyimpan'
  } finally {
    submitting.value = false
  }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3500) }

const confirmHapus = ref(false)
const hapusTarget = ref<{ id: number; nama: string } | null>(null)
const hapusError = ref('')

function hapusPelanggan(id: number, nama: string) {
  hapusTarget.value = { id, nama }
  hapusError.value = ''
  confirmHapus.value = true
}

async function doHapusPelanggan() {
  if (!hapusTarget.value) return
  try {
    await api.delete(`/master/pelanggan/${hapusTarget.value.id}`)
    confirmHapus.value = false
    flash('Pelanggan dihapus')
    fetchData()
    master.fetchGrupPelanggan()
  } catch (e: any) {
    hapusError.value = e.response?.data?.message || 'Gagal menghapus pelanggan'
    confirmHapus.value = false
  }
}

// Warna per grup
const grupColors = ['#1d4ed8', '#0891b2', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#047857', '#c2410c']
function grupColor(idx: number) { return grupColors[idx % grupColors.length] }
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Pelanggan</h2>
        <p class="sub">Manajemen data perusahaan pelanggan</p>
      </div>
      <div class="header-actions">
        <div class="view-toggle">
          <button :class="['toggle-btn', viewMode === 'grup' && 'active']" @click="viewMode = 'grup'">
            Per Grup
          </button>
          <button :class="['toggle-btn', viewMode === 'list' && 'active']" @click="viewMode = 'list'">
            Daftar
          </button>
        </div>
        <button class="btn btn-outline" @click="openAddGrup">+ Tambah Grup</button>
        <button class="btn btn-primary" @click="openAdd">+ Tambah Pelanggan</button>
      </div>
    </div>

    <div v-if="successMsg" class="alert alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert alert-danger">{{ master.error }}</div>
    <div v-if="hapusError" class="alert alert-danger">{{ hapusError }}</div>
    <div v-if="hapusGrupError" class="alert alert-danger">{{ hapusGrupError }}</div>

    <!-- ═══════════════ GRUP VIEW ═══════════════ -->
    <div v-if="viewMode === 'grup'" class="grup-view">
      <div v-if="master.grupLoading" class="loading-state">Memuat data grup...</div>
      <template v-else>
        <!-- Group cards -->
        <div
          v-for="(grp, idx) in master.grupList"
          :key="grp.id_grup"
          class="grup-card"
        >
          <div
            class="grup-header"
            :style="{ borderLeftColor: grupColor(idx) }"
            @click="toggleGrup(grp.id_grup)"
          >
            <div class="grup-left">
              <span class="grup-kode" :style="{ color: grupColor(idx) }">{{ grp.kode_grup }}</span>
              <span class="grup-nama">{{ grp.nama_grup }}</span>
              <span v-if="grp.deskripsi" class="grup-desc">{{ grp.deskripsi }}</span>
            </div>
            <div class="grup-right">
              <span class="grup-stat">
                <b>{{ grp.pelanggan?.length ?? 0 }}</b> PT
              </span>
              <span class="grup-stat">
                <b>{{ grp.pelanggan?.reduce((s, p) => s + (p._count?.sites ?? 0), 0) }}</b> site
              </span>
              <div class="grup-actions" @click.stop>
                <button class="btn-edit-sm" @click="openEditGrup(grp)">Edit</button>
                <!-- <button class="btn-hapus" @click="hapusGrup(grp.id_grup, grp.nama_grup)">Hapus</button> -->
              </div>
              <span class="chevron" :class="{ open: expandedGrup.has(grp.id_grup) }">▾</span>
            </div>
          </div>

          <div v-if="expandedGrup.has(grp.id_grup)" class="grup-body">
            <table class="pt-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Perusahaan</th>
                  <th>Kota</th>
                  <th>Jenis Usaha</th>
                  <th class="th-center">Site</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pt in grp.pelanggan" :key="pt.id_pelanggan">
                  <td class="kode-cell">{{ pt.kode_pelanggan }}</td>
                  <td><span class="nama-pt">{{ pt.nama_pelanggan }}</span></td>
                  <td class="text-muted">{{ pt.kota || '—' }}</td>
                  <td class="text-muted">{{ pt.jenis_usaha || '—' }}</td>
                  <td class="center-cell">
                    <span class="site-badge">{{ pt._count?.sites ?? 0 }}</span>
                  </td>
                  <td>
                    <div class="action-btns">
                      <button class="btn-edit-sm" @click="openEditById(pt.id_pelanggan)">Edit</button>
                      <!-- <button class="btn-hapus" @click="hapusPelanggan(pt.id_pelanggan, pt.nama_pelanggan)">Hapus</button> -->
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Standalone (tanpa grup) -->
        <div v-if="master.pelangganList.some(p => !p.id_grup)" class="grup-card standalone">
          <div
            class="grup-header"
            style="border-left-color: #94a3b8"
            @click="toggleGrup(0)"
          >
            <div class="grup-left">
              <span class="grup-kode" style="color:#94a3b8">—</span>
              <span class="grup-nama" style="color:#64748b">Lainnya (Standalone)</span>
              <span class="grup-desc">Pelanggan tanpa grup / holding</span>
            </div>
            <div class="grup-right">
              <span class="grup-stat">
                <b>{{ master.pelangganList.filter(p => !p.id_grup).length }}</b> PT
              </span>
              <span class="chevron" :class="{ open: expandedGrup.has(0) }">▾</span>
            </div>
          </div>
          <div v-if="expandedGrup.has(0)" class="grup-body">
            <table class="pt-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Perusahaan</th>
                  <th>Kota</th>
                  <th>Jenis Usaha</th>
                  <th class="th-center">Site</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in master.pelangganList.filter(p => !p.id_grup)" :key="p.id_pelanggan">
                  <td class="kode-cell">{{ p.kode_pelanggan }}</td>
                  <td><span class="nama-pt">{{ p.nama_pelanggan }}</span></td>
                  <td class="text-muted">{{ p.kota || '—' }}</td>
                  <td class="text-muted">{{ p.jenis_usaha || '—' }}</td>
                  <td class="center-cell">
                    <span class="site-badge">{{ p._count?.sites ?? 0 }}</span>
                  </td>
                  <td>
                    <div class="action-btns">
                      <button class="btn-edit-sm" @click="openEdit(p)">Edit</button>
                      <!-- <button class="btn-hapus" @click="hapusPelanggan(p.id_pelanggan, p.nama_pelanggan)">Hapus</button> -->
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>

    <!-- ═══════════════ LIST VIEW ═══════════════ -->
    <template v-if="viewMode === 'list'">
      <div class="toolbar">
        <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama / kode..." class="search-input" />
        <button class="btn btn-secondary" @click="doSearch">Cari</button>
      </div>

      <div class="table-card">
        <div v-if="master.pelangganLoading" class="loading-state">Memuat data...</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Perusahaan</th>
              <th>Grup / Holding</th>
              <th>Kota</th>
              <th>PJ Teknis</th>
              <th>PJ Keuangan</th>
              <th>Site</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!master.pelangganList.length">
              <td colspan="8" class="empty">Belum ada pelanggan</td>
            </tr>
            <tr v-for="p in master.pelangganList" :key="p.id_pelanggan">
              <td class="kode-cell">{{ p.kode_pelanggan }}</td>
              <td>
                <div class="nama-perusahaan">{{ p.nama_pelanggan }}</div>
                <div v-if="p.npwp" class="meta-text">NPWP: {{ p.npwp }}</div>
              </td>
              <td>
                <span v-if="p.grup" class="grup-badge">{{ p.grup.nama_grup }}</span>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="text-muted">{{ p.kota || '—' }}</td>
              <td class="text-muted">{{ p.nama_pic_teknis || p.nama_pic_utama || '—' }}</td>
              <td class="text-muted">{{ p.nama_pic_keuangan || '—' }}</td>
              <td class="center-cell">{{ p._count?.sites ?? 0 }}</td>
              <td>
                <div class="action-btns">
                  <button class="btn-edit-sm" @click="openEdit(p)">Edit</button>
                  <!-- <button class="btn-hapus" @click="hapusPelanggan(p.id_pelanggan, p.nama_pelanggan)">Hapus</button> -->
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <BasePagination :page="page" :total-pages="master.pelangganMeta.total_pages" @change="goPage" />
        <div class="table-footer" v-if="master.pelangganMeta.total">
          Total: {{ master.pelangganMeta.total }} pelanggan
        </div>
      </div>
    </template>

    <ConfirmDialog
      v-model="confirmHapus"
      title="Hapus Pelanggan?"
      :message="`Pelanggan &quot;${hapusTarget?.nama}&quot; akan dihapus permanen.`"
      confirm-label="Ya, Hapus"
      variant="danger"
      @confirm="doHapusPelanggan"
      @cancel="confirmHapus = false"
    />

    <ConfirmDialog
      v-model="confirmHapusGrup"
      title="Hapus Grup?"
      :message="`Grup &quot;${hapusGrupTarget?.nama}&quot; akan dihapus. Pastikan tidak ada pelanggan di grup ini.`"
      confirm-label="Ya, Hapus"
      variant="danger"
      @confirm="doHapusGrup"
      @cancel="confirmHapusGrup = false"
    />

    <!-- Modal Grup -->
    <div v-if="showGrupModal" class="modal-overlay" @click.self="showGrupModal = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>{{ grupEditId ? 'Edit Grup / Holding' : 'Tambah Grup / Holding Baru' }}</h3>
          <button class="modal-close" @click="showGrupModal = false">✕</button>
        </div>
        <div class="form-section" style="border-top:none; padding-top:16px;">
          <div class="field">
            <label>Kode Grup <span class="req">*</span></label>
            <input v-model="grupForm.kode_grup" placeholder="MAP, SOURSALLY, dll" style="text-transform:uppercase" @input="grupForm.kode_grup = grupForm.kode_grup.toUpperCase()" />
            <span class="field-hint">Maks. 10 karakter, unik</span>
          </div>
          <div class="field" style="margin-top:12px;">
            <label>Nama Grup / Holding <span class="req">*</span></label>
            <input v-model="grupForm.nama_grup" placeholder="PT. Mitra Adi Perkasa Tbk" />
          </div>
          <div class="field" style="margin-top:12px;">
            <label>Deskripsi</label>
            <input v-model="grupForm.deskripsi" placeholder="Retail / F&B / Property, dll" />
          </div>
        </div>
        <p v-if="grupFormError" class="form-error" style="margin: 0 28px 8px;">{{ grupFormError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showGrupModal = false">Batal</button>
          <button class="btn btn-primary" @click="handleGrupSubmit" :disabled="grupSubmitting">
            {{ grupSubmitting ? 'Menyimpan...' : 'Simpan Grup' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Form -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>{{ editId ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru' }}</h3>
          <button class="modal-close" @click="showModal = false">✕</button>
        </div>

        <!-- SEKSI 1: INFORMASI PERUSAHAAN -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-num">1</span>
            Informasi Perusahaan
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Kode Pelanggan <span class="req">*</span></label>
              <input v-model="form.kode_pelanggan" placeholder="PLG-041" />
            </div>
            <div class="field">
              <label>Nama Perusahaan <span class="req">*</span></label>
              <input v-model="form.nama_pelanggan" placeholder="PT. ABC Indonesia" />
            </div>
            <div class="field">
              <label>Grup / Holding</label>
              <select v-model="form.id_grup">
                <option :value="null">— Standalone (tanpa grup) —</option>
                <option v-for="g in master.grupList" :key="g.id_grup" :value="g.id_grup">
                  {{ g.kode_grup }} — {{ g.nama_grup }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Jenis Usaha</label>
              <input v-model="form.jenis_usaha" placeholder="Ritel / F&B / dll" />
            </div>
            <div class="field">
              <label>Kota</label>
              <input v-model="form.kota" placeholder="Jakarta" />
            </div>
            <div class="field full">
              <label>Alamat Kantor Pusat</label>
              <textarea v-model="form.alamat_kantor" rows="2" placeholder="Jl. Sudirman No. 1..."></textarea>
            </div>
            <div class="field">
              <label>Telepon / Fax Kantor</label>
              <input v-model="form.no_telp" placeholder="021-..." />
            </div>
            <div class="field">
              <label>No. NPWP</label>
              <input v-model="form.npwp" placeholder="00.000.000.0-000.000" />
            </div>
            <div class="field">
              <label>Nama Pemilik Perusahaan</label>
              <input v-model="form.nama_pemilik" placeholder="Nama lengkap pemilik" />
            </div>
            <div class="field">
              <label>Jabatan Pemilik</label>
              <input v-model="form.jabatan_pemilik" placeholder="Direktur Utama" />
            </div>
            <div class="field">
              <label>No. KTP Pemilik</label>
              <input v-model="form.no_ktp_pemilik" placeholder="3271..." />
            </div>
            <div class="field">
              <label>No. Ponsel Pemilik</label>
              <input v-model="form.no_ponsel_pemilik" placeholder="08..." />
            </div>
          </div>
        </div>

        <!-- SEKSI 2: PJ TEKNIS -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-num">2</span>
            Penanggung Jawab Teknis
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Nama</label>
              <input v-model="form.nama_pic_teknis" placeholder="Nama PJ Teknis" />
            </div>
            <div class="field">
              <label>Jabatan</label>
              <input v-model="form.jabatan_pic_teknis" placeholder="Network Engineer" />
            </div>
            <div class="field">
              <label>Telepon / Fax</label>
              <input v-model="form.no_telp_pic_teknis" placeholder="021-..." />
            </div>
            <div class="field">
              <label>No. Ponsel</label>
              <input v-model="form.no_ponsel_pic_teknis" placeholder="08..." />
            </div>
            <div class="field">
              <label>Email</label>
              <input v-model="form.email_pic_teknis" type="email" placeholder="teknis@perusahaan.com" />
            </div>
          </div>
        </div>

        <!-- SEKSI 3: PJ KEUANGAN -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-num">3</span>
            Penanggung Jawab Keuangan
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Nama</label>
              <input v-model="form.nama_pic_keuangan" placeholder="Nama PJ Keuangan" />
            </div>
            <div class="field">
              <label>Jabatan</label>
              <input v-model="form.jabatan_pic_keuangan" placeholder="Finance Manager" />
            </div>
            <div class="field">
              <label>Telepon / Fax</label>
              <input v-model="form.no_telp_pic_keuangan" placeholder="021-..." />
            </div>
            <div class="field">
              <label>No. Ponsel</label>
              <input v-model="form.no_ponsel_pic_keuangan" placeholder="08..." />
            </div>
            <div class="field">
              <label>Email Billing</label>
              <input v-model="form.email_pic_keuangan" type="email" placeholder="billing@perusahaan.com" />
            </div>
            <div class="field full">
              <label>Alamat Penagihan</label>
              <textarea v-model="form.alamat_penagihan" rows="2" placeholder="Alamat pengiriman invoice / tagihan"></textarea>
            </div>
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal = false">Batal</button>
          <button class="btn btn-primary" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Simpan Data' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-actions { display: flex; align-items: center; gap: 10px; }

/* Toggle */
.view-toggle { display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; gap: 2px; }
.toggle-btn { padding: 6px 16px; border: none; background: none; border-radius: 6px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; transition: all .15s; }
.toggle-btn.active { background: #fff; color: #1d4ed8; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,.1); }

/* Grup view */
.grup-view { display: flex; flex-direction: column; gap: 10px; }
.grup-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.07); overflow: hidden; }
.grup-card.standalone { opacity: .85; }
.grup-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-left: 4px solid #1d4ed8; cursor: pointer; gap: 12px; user-select: none; }
.grup-header:hover { background: #f8fafc; }
.grup-left { display: flex; align-items: center; gap: 10px; flex: 1; flex-wrap: wrap; }
.grup-kode { font-size: 12px; font-weight: 700; background: #f1f5f9; border-radius: 5px; padding: 2px 8px; white-space: nowrap; }
.grup-nama { font-size: 14px; font-weight: 700; color: #0f172a; }
.grup-desc { font-size: 12px; color: #94a3b8; }
.grup-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.grup-stat { font-size: 13px; color: #64748b; }
.grup-stat b { color: #0f172a; }
.chevron { font-size: 14px; color: #94a3b8; transition: transform .2s; display: inline-block; }
.chevron.open { transform: rotate(180deg); }

/* PT table inside grup */
.grup-body { border-top: 1px solid #f1f5f9; overflow-x: auto; }
.pt-table { width: 100%; border-collapse: collapse; }
.pt-table th { padding: 9px 14px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: left; text-transform: uppercase; letter-spacing: .04em; background: #fafbfc; }
.pt-table th.th-center { text-align: center; }
.pt-table td { padding: 10px 14px; font-size: 13.5px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.nama-pt { font-weight: 600; }
.site-badge { background: #eff6ff; color: #1d4ed8; font-weight: 700; font-size: 12px; border-radius: 20px; padding: 2px 10px; }
.grup-badge { background: #f0f9ff; color: #0369a1; font-size: 12px; border-radius: 5px; padding: 2px 8px; font-weight: 600; }

/* List view */
.toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
.search-input { flex: 1; max-width: 320px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.07); overflow: hidden; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table thead tr { background: #f8fafc; }
.data-table th { padding: 11px 13px; font-size: 11.5px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: .04em; }
.data-table td { padding: 12px 13px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 48px; }
.loading-state { padding: 48px; text-align: center; color: #94a3b8; }
.kode-cell { font-weight: 700; color: #1d4ed8; font-size: 13px; white-space: nowrap; }
.nama-perusahaan { font-weight: 600; }
.meta-text { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.text-muted { color: #64748b; }
.center-cell { text-align: center; font-weight: 700; }
.btn-edit-sm { padding: 4px 12px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #334155; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.action-btns { display: flex; gap: 6px; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-start; justify-content: center; z-index: 100; padding: 24px 16px; overflow-y: auto; }
.modal { background: #fff; border-radius: 14px; width: 680px; max-width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,.2); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 22px 28px 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }
.modal-close { background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.modal-close:hover { background: #f1f5f9; color: #475569; }
.form-section { padding: 20px 28px; border-top: 1px solid #f1f5f9; }
.form-section:first-of-type { border-top: none; padding-top: 18px; }
.section-title { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 16px; }
.section-num { width: 22px; height: 22px; background: #1d4ed8; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 12.5px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field textarea, .field select {
  padding: 8px 11px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 13.5px; outline: none; background: #f8fafc; color: #0f172a; font-family: inherit;
}
.field input:focus, .field textarea:focus, .field select:focus { border-color: #3b82f6; background: #fff; }
.form-error { margin: 4px 28px 0; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 18px 28px; border-top: 1px solid #f1f5f9; }
.btn { padding: 9px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.btn-primary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; }
.btn-secondary { background: #f1f5f9; color: #475569; }
.btn-outline { background: #fff; color: #1d4ed8; border: 1.5px solid #bfdbfe; }
.btn-outline:hover { background: #eff6ff; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.modal-sm { width: 420px; }
.grup-actions { display: flex; gap: 6px; }
.field-hint { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.alert { border-radius: 8px; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
.alert-danger { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

@media (max-width: 768px) {
  .page { padding: 16px !important; }
  .modal { border-radius: 14px 14px 0 0; }
  .form-grid { grid-template-columns: 1fr !important; }
  .field.full { grid-column: 1; }
  .header-actions { flex-direction: column; align-items: flex-end; gap: 8px; }
}
</style>
