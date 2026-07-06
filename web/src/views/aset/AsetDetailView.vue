<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsetStore } from '@/stores/aset'
import { useProyekStore } from '@/stores/proyek'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()
const aset = useAsetStore()
const proyek = useProyekStore()

const id = Number(route.params.id)

const showEditModal = ref(false)
const showMutasiModal = ref(false)
const showLinkSimModal = ref(false)
const submitting = ref(false)
const formError = ref('')
const sumberList = ref<any[]>([])
const linkSimId = ref<number | null>(null)
const linkSimSubmitting = ref(false)
const linkSimError = ref('')

const editForm = ref({ nama_perangkat: '', merk: '', tipe_model: '', kondisi: '', catatan: '' })
const mutasiForm = ref({ id_aset: id, jenis_mutasi: 'Deploy', jumlah: 1, id_site_asal: 0, id_site_tujuan: 0, id_gudang_tujuan: 0, keterangan: '' })

interface GudangOpt { id_gudang: number; kode_gudang: string; nama_gudang: string; kota?: string | null; is_aktif: boolean }
const gudangList = ref<GudangOpt[]>([])
const gudangLoaded = ref(false)

const KONDISI_LIST = ['Baru', 'Baik', 'Perlu_Perbaikan', 'Rusak']
// Opsi mutasi menyesuaikan tipe aset (sesuai guard backend):
// - Ber-serial: 1 unit berpindah status
// - Stok: jumlah berpindah, status tetap
const JENIS_SERIALIZED = ['Deploy', 'Return', 'Transfer', 'Pinjam', 'Rusak', 'Disposed']
const JENIS_STOK       = ['Masuk', 'Keluar', 'Deploy', 'Return', 'Transfer', 'Rusak', 'Disposed']
const JENIS_MUTASI = computed(() => (a.value?.is_serialized ? JENIS_SERIALIZED : JENIS_STOK))

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Di_Gudang:  { bg: '#f0fdf4', color: '#15803d' },
  Terpasang:  { bg: '#eff6ff', color: '#1d4ed8' },
  Dipinjam:   { bg: '#fef9c3', color: '#a16207' },
  Rusak:      { bg: '#fef2f2', color: '#dc2626' },
  Disposed:   { bg: '#f1f5f9', color: '#64748b' },
}

const a = computed(() => aset.current)

onMounted(async () => {
  await Promise.all([aset.fetchOne(id), proyek.fetchSiteList()])
})

async function openLinkSim() {
  linkSimId.value = null; linkSimError.value = ''
  const r = await api.get('/master/sumber-internet?unlinked_only=true')
  sumberList.value = r.data.data
  showLinkSimModal.value = true
}

async function handleLinkSim() {
  if (!linkSimId.value) { linkSimError.value = 'Pilih sumber internet terlebih dahulu'; return }
  linkSimSubmitting.value = true; linkSimError.value = ''
  try {
    await api.patch(`/master/sumber-internet/${linkSimId.value}`, { id_aset_sim: id })
    await aset.fetchOne(id)
    showLinkSimModal.value = false
  } catch (e: any) { linkSimError.value = e.response?.data?.message || 'Gagal menghubungkan' }
  finally { linkSimSubmitting.value = false }
}

async function handleUnlinkSim() {
  const sumber = (a.value as any)?.sumber_internet
  if (!sumber) return
  if (!confirm(`Putuskan SIM dari ${sumber.nomor_pelanggan_isp}?`)) return
  await api.patch(`/master/sumber-internet/${sumber.id_sumber}`, { id_aset_sim: null })
  await aset.fetchOne(id)
}

function openEdit() {
  if (!a.value) return
  editForm.value = {
    nama_perangkat: a.value.nama_perangkat,
    merk: a.value.merk || '',
    tipe_model: a.value.tipe_model || '',
    kondisi: a.value.kondisi,
    catatan: a.value.catatan || '',
  }
  showEditModal.value = true; formError.value = ''
}

async function handleEdit() {
  submitting.value = true; formError.value = ''
  try {
    // status & lokasi TIDAK diedit di sini — wajib lewat mutasi (jejak gudang)
    await aset.update(id, { ...editForm.value })
    showEditModal.value = false
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan perubahan' }
  finally { submitting.value = false }
}

function openMutasi() {
  mutasiForm.value = {
    id_aset: id,
    jenis_mutasi: 'Deploy',
    jumlah: 1,
    id_site_asal: a.value?.id_site || 0,
    id_site_tujuan: 0,
    id_gudang_tujuan: 0,
    keterangan: '',
  }
  showMutasiModal.value = true; formError.value = ''
  loadGudang()
}

async function loadGudang() {
  if (gudangLoaded.value) return
  try {
    const r = await api.get('/master/gudang')
    gudangList.value = r.data.data
    gudangLoaded.value = true
  } catch {}
}

async function handleMutasi() {
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...mutasiForm.value }
    if (!payload.id_site_asal) delete payload.id_site_asal
    if (!payload.id_site_tujuan) delete payload.id_site_tujuan
    if (!payload.id_gudang_tujuan) delete payload.id_gudang_tujuan
    await aset.createMutasi(payload)
    showMutasiModal.value = false
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal mencatat mutasi' }
  finally { submitting.value = false }
}

function fmtDt(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtRupiah(n: number) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID')
}
function statusLabel(s: string) { return s.replace('_', ' ') }

const mutasiColor: Record<string, string> = {
  Masuk: '#15803d', Deploy: '#1d4ed8', Return: '#0891b2', Transfer: '#0369a1',
  Pinjam: '#a16207', Keluar: '#c2410c', Rusak: '#dc2626', Disposed: '#64748b',
}
</script>

<template>
  <div class="page">
    <div class="breadcrumb">
      <span class="link" @click="router.push('/assets')">Aset</span>
      <span class="sep">›</span>
      <span>{{ a?.kode_aset || '...' }}</span>
    </div>

    <div v-if="aset.loading && !a" class="loading-full">Memuat...</div>
    <div v-else-if="aset.error" class="alert-error">{{ aset.error }}</div>
    <template v-else-if="a">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <div class="kode">{{ a.kode_aset }}</div>
          <h2>{{ a.nama_perangkat }}</h2>
          <div class="sub-row">
            <span v-if="a.merk || a.tipe_model" class="sub">{{ a.merk }} {{ a.tipe_model }}</span>
            <span class="status-badge" :style="{ background: STATUS_COLOR[a.status_aset]?.bg, color: STATUS_COLOR[a.status_aset]?.color }">
              {{ statusLabel(a.status_aset) }}
            </span>
            <span class="kondisi-badge">{{ a.kondisi?.replace('_', ' ') }}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" @click="openMutasi">+ Mutasi</button>
          <button class="btn-edit" @click="openEdit">Edit</button>
        </div>
      </div>

      <!-- Info bar -->
      <div class="info-bar">
        <div class="info-item">
          <div class="info-label">Kategori</div>
          <div class="info-value">{{ a.kategori }}</div>
        </div>
        <div class="info-item" v-if="a.serial_number">
          <div class="info-label">Serial Number</div>
          <div class="info-value mono">{{ a.serial_number }}</div>
        </div>
        <div class="info-item" v-if="!a.is_serialized">
          <div class="info-label">Stok</div>
          <div class="info-value">{{ a.stok_jumlah }} unit</div>
        </div>
        <div class="info-item">
          <div class="info-label">Lokasi</div>
          <div class="info-value">{{ a.site ? a.site.nama_site : (a.status_aset === 'Di_Gudang' ? (a.gudang?.nama_gudang ?? 'Gudang') : 'Gudang') }}</div>
        </div>
        <div class="info-item" v-if="a.site?.pelanggan">
          <div class="info-label">Pelanggan</div>
          <div class="info-value">{{ a.site.pelanggan.nama_pelanggan }}</div>
        </div>
        <div class="info-item" v-if="a.tgl_perolehan">
          <div class="info-label">Tgl Perolehan</div>
          <div class="info-value">{{ fmtDate(a.tgl_perolehan) }}</div>
        </div>
        <div class="info-item" v-if="a.harga_perolehan">
          <div class="info-label">Harga Perolehan</div>
          <div class="info-value">{{ fmtRupiah(a.harga_perolehan) }}</div>
        </div>
        <div class="info-item" v-if="a.catatan">
          <div class="info-label">Catatan</div>
          <div class="info-value">{{ a.catatan }}</div>
        </div>
      </div>

      <!-- SIM / Sumber Internet Link -->
      <div class="section sim-section" v-if="(a as any).sumber_internet || a.kategori?.toLowerCase().includes('sim')">
        <div class="sim-header">
          <h3>SIM Card — Sumber Internet</h3>
          <button v-if="!(a as any).sumber_internet" class="btn-link-sim" @click="openLinkSim">+ Link ke Sumber Internet</button>
          <button v-else class="btn-unlink-sim" @click="handleUnlinkSim">Putuskan Link</button>
        </div>
        <div v-if="(a as any).sumber_internet" class="sim-info">
          <div class="sim-row">
            <span class="sim-label">Nomor / ISP ID</span>
            <span class="sim-val mono">{{ (a as any).sumber_internet.nomor_pelanggan_isp || '—' }}</span>
          </div>
          <div class="sim-row" v-if="(a as any).sumber_internet.vendor">
            <span class="sim-label">Operator</span>
            <span class="sim-val">{{ (a as any).sumber_internet.vendor.nama_vendor }}</span>
          </div>
          <div class="sim-row" v-if="(a as any).sumber_internet.site">
            <span class="sim-label">Site</span>
            <span class="sim-val link" @click="router.push(`/master/site/${(a as any).sumber_internet.site.id_site || 0}`)">
              {{ (a as any).sumber_internet.site.kode_site }} — {{ (a as any).sumber_internet.site.nama_site }}
            </span>
          </div>
        </div>
        <div v-else class="empty-state">Belum dihubungkan ke Sumber Internet</div>
      </div>

      <!-- Mutasi History -->
      <div class="section">
        <h3>Riwayat Mutasi</h3>
        <div class="timeline" v-if="a.mutasi?.length">
          <div v-for="m in a.mutasi" :key="m.id_mutasi" class="timeline-item">
            <div class="tl-dot" :style="{ background: mutasiColor[m.jenis_mutasi] || '#94a3b8' }"></div>
            <div class="tl-content">
              <div class="tl-header">
                <span class="tl-jenis" :style="{ color: mutasiColor[m.jenis_mutasi] || '#94a3b8' }">{{ m.jenis_mutasi }}</span>
                <span v-if="!a.is_serialized" class="tl-qty">{{ m.jumlah }} unit</span>
                <span class="tl-time">{{ fmtDt(m.created_at) }}</span>
              </div>
              <div class="tl-ket" v-if="m.keterangan">{{ m.keterangan }}</div>
              <div class="tl-user" v-if="m.user?.karyawan?.nama_lengkap">oleh {{ m.user.karyawan.nama_lengkap }}</div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">Belum ada riwayat mutasi</div>
      </div>
    </template>

    <!-- Modal Edit Aset -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h3>Edit Aset</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Nama Perangkat</label>
            <input v-model="editForm.nama_perangkat" />
          </div>
          <div class="field">
            <label>Merk</label>
            <input v-model="editForm.merk" />
          </div>
          <div class="field">
            <label>Tipe / Model</label>
            <input v-model="editForm.tipe_model" />
          </div>
          <div class="field">
            <label>Kondisi</label>
            <select v-model="editForm.kondisi">
              <option v-for="k in KONDISI_LIST" :key="k" :value="k">{{ k.replace('_', ' ') }}</option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="editForm.catatan" rows="2"></textarea>
          </div>
          <p class="field full edit-hint">ℹ️ Status & lokasi aset diubah lewat tombol <strong>+ Mutasi</strong> (Deploy/Return/dll) agar riwayat gudang tercatat.</p>
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

    <!-- Modal Link SIM -->
    <div v-if="showLinkSimModal" class="modal-overlay" @click.self="showLinkSimModal = false">
      <div class="modal">
        <h3>Link SIM ke Sumber Internet</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Sumber Internet (belum ada SIM) <span class="req">*</span></label>
            <select v-model="linkSimId">
              <option :value="null">— Pilih sumber internet —</option>
              <option v-for="s in sumberList" :key="s.id_sumber" :value="s.id_sumber">
                [{{ s.site?.kode_site }}] {{ s.site?.nama_site }} — {{ s.nomor_pelanggan_isp || s.vendor?.nama_vendor }}
              </option>
            </select>
          </div>
        </div>
        <p v-if="linkSimError" class="form-error">{{ linkSimError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showLinkSimModal = false">Batal</button>
          <button class="btn-submit" @click="handleLinkSim" :disabled="linkSimSubmitting">
            {{ linkSimSubmitting ? 'Menghubungkan...' : 'Hubungkan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Mutasi -->
    <div v-if="showMutasiModal" class="modal-overlay" @click.self="showMutasiModal = false">
      <div class="modal">
        <h3>Catat Mutasi Aset</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Jenis Mutasi <span class="req">*</span></label>
            <select v-model="mutasiForm.jenis_mutasi">
              <option v-for="j in JENIS_MUTASI" :key="j" :value="j">{{ j }}</option>
            </select>
          </div>
          <div class="field" v-if="!a?.is_serialized">
            <label>Jumlah</label>
            <input v-model.number="mutasiForm.jumlah" type="number" min="1" />
          </div>
          <div class="field full" v-if="['Deploy', 'Return', 'Pinjam'].includes(mutasiForm.jenis_mutasi)">
            <label>Site Asal</label>
            <select v-model="mutasiForm.id_site_asal">
              <option :value="0">— Gudang —</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">
                [{{ s.kode_site }}] {{ s.nama_site }}
              </option>
            </select>
          </div>
          <div class="field full" v-if="['Deploy', 'Pinjam', 'Keluar'].includes(mutasiForm.jenis_mutasi)">
            <label>Site Tujuan</label>
            <select v-model="mutasiForm.id_site_tujuan">
              <option :value="0">— Gudang —</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">
                [{{ s.kode_site }}] {{ s.nama_site }}
              </option>
            </select>
          </div>
          <div class="field full" v-if="mutasiForm.jenis_mutasi === 'Transfer'">
            <label>Gudang Tujuan <span class="req">*</span></label>
            <select v-model.number="mutasiForm.id_gudang_tujuan">
              <option :value="0">— Pilih gudang tujuan —</option>
              <option v-for="g in gudangList.filter(g => g.id_gudang !== a?.gudang?.id_gudang)" :key="g.id_gudang" :value="g.id_gudang">
                [{{ g.kode_gudang }}] {{ g.nama_gudang }}{{ g.kota ? ' — ' + g.kota : '' }}
              </option>
            </select>
          </div>
          <div class="field full" v-if="mutasiForm.jenis_mutasi === 'Return'">
            <label>Kembali ke Gudang</label>
            <select v-model.number="mutasiForm.id_gudang_tujuan">
              <option :value="0">— gudang asal —</option>
              <option v-for="g in gudangList" :key="g.id_gudang" :value="g.id_gudang">
                [{{ g.kode_gudang }}] {{ g.nama_gudang }}{{ g.kota ? ' — ' + g.kota : '' }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Keterangan</label>
            <textarea v-model="mutasiForm.keterangan" rows="2" placeholder="Alasan / detail mutasi..."></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showMutasiModal = false">Batal</button>
          <button class="btn-submit" @click="handleMutasi" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Catat Mutasi' }}
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
.header-left .kode { font-size: 13px; font-weight: 700; color: #3b82f6; margin-bottom: 4px; }
.header-left h2 { margin: 0 0 8px; font-size: 22px; color: #0f172a; }
.sub-row { display: flex; align-items: center; gap: 8px; }
.sub { font-size: 14px; color: #64748b; }
.status-badge { padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; }
.kondisi-badge { padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; background: #f1f5f9; color: #475569; }
.header-actions { display: flex; gap: 10px; }
.btn-secondary { padding: 9px 18px; background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-edit { padding: 9px 18px; background: #f1f5f9; color: #374151; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.info-bar { display: flex; flex-wrap: wrap; gap: 0; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; margin-bottom: 24px; }
.info-item { flex: 0 0 auto; min-width: 160px; padding: 8px 20px 8px 0; border-right: 1px solid #f1f5f9; margin-right: 20px; margin-bottom: 8px; }
.info-item:last-child { border-right: none; }
.info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px; }
.info-value { font-size: 14px; color: #0f172a; font-weight: 600; }
.mono { font-family: monospace; font-size: 13px; }

.section { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); padding: 20px 24px; }
.section h3 { margin: 0 0 16px; font-size: 16px; color: #0f172a; }
.timeline { display: flex; flex-direction: column; gap: 0; }
.timeline-item { display: flex; gap: 16px; position: relative; padding-bottom: 16px; }
.timeline-item:not(:last-child)::after { content: ''; position: absolute; left: 7px; top: 18px; width: 2px; height: calc(100% - 2px); background: #e2e8f0; }
.tl-dot { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; border: 2px solid #fff; box-shadow: 0 0 0 2px #e2e8f0; }
.tl-content { flex: 1; }
.tl-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tl-jenis { font-weight: 700; font-size: 14px; }
.tl-qty { font-size: 12px; background: #f1f5f9; padding: 2px 8px; border-radius: 10px; color: #475569; font-weight: 600; }
.tl-time { font-size: 12px; color: #94a3b8; margin-left: auto; }
.tl-ket { font-size: 13px; color: #374151; margin-top: 4px; }
.tl-user { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.empty-state { text-align: center; color: #94a3b8; padding: 32px; font-size: 14px; }

.sim-section { margin-bottom: 20px; }
.sim-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.sim-header h3 { margin: 0; font-size: 16px; color: #0f172a; }
.btn-link-sim { padding: 7px 14px; background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-unlink-sim { padding: 7px 14px; background: #fff1f2; color: #be123c; border: 1.5px solid #fecdd3; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.sim-info { display: flex; flex-direction: column; gap: 10px; }
.sim-row { display: flex; align-items: center; gap: 12px; }
.sim-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.4px; min-width: 100px; }
.sim-val { font-size: 14px; color: #0f172a; font-weight: 600; }
.sim-val.link { color: #3b82f6; cursor: pointer; }
.sim-val.link:hover { text-decoration: underline; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 500px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.edit-hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; color: #1e40af; font-size: 12px; padding: 8px 12px; margin: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
