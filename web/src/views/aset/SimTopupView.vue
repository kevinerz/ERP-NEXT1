<template>
  <div class="page sim-page">

    <!-- KPI strip -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-val">{{ simCards.length }}</div>
        <div class="kpi-label">Total Link Internet</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">{{ simCards.filter(s => s.status_link === 'Aktif').length }}</div>
        <div class="kpi-label">Link Aktif</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-val">{{ fmtRp(meta.total_nominal) }}</div>
        <div class="kpi-label">Total Topup</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">{{ meta.total }}</div>
        <div class="kpi-label">Jumlah Transaksi</div>
      </div>
    </div>

    <div class="page-body">
      <!-- Kiri: daftar sumber internet / SIM -->
      <div class="card sim-list-card">
        <div class="card-header">
          <span class="card-title">Sumber Internet</span>
          <input v-model="simSearch" class="search-sm" placeholder="Cari…" @input="fetchSimCards" />
        </div>

        <div class="sim-list">
          <div
            v-for="sim in simCards" :key="sim.id_sumber"
            class="sim-item"
            :class="{ selected: selectedSim?.id_sumber === sim.id_sumber }"
            @click="selectSim(sim)"
          >
            <div class="sim-icon">📡</div>
            <div class="sim-info">
              <div class="sim-name">{{ sim.vendor?.nama_vendor }}</div>
              <div class="sim-sub">{{ sim.site?.nama_site }}</div>
              <div class="sim-sub">{{ sim.site?.pelanggan?.nama_pelanggan }} · {{ sim.peruntukan_link }}</div>
              <div class="sim-sub">{{ sim.nomor_pelanggan_isp || '—' }}</div>
            </div>
            <div class="sim-meta">
              <div class="sim-badge" :class="sim.status_link === 'Aktif' ? 'green' : 'gray'">
                {{ sim.status_link }}
              </div>
              <div class="sim-count">{{ sim._count?.topup || 0 }}x topup</div>
            </div>
          </div>
          <div v-if="simCards.length === 0" class="empty-state">Tidak ada data sumber internet</div>
        </div>
      </div>

      <!-- Kanan: history + tambah -->
      <div class="right-panel">
        <!-- Filter + Tambah -->
        <div class="card filter-card">
          <div class="filter-row">
            <select v-model="filterJenis" @change="fetchTopup">
              <option value="">Semua Jenis</option>
              <option v-for="j in JENIS_TOPUP" :key="j" :value="j">{{ j }}</option>
            </select>
            <input v-model="filterDari" type="date" @change="fetchTopup" />
            <span class="filter-sep">s/d</span>
            <input v-model="filterSampai" type="date" @change="fetchTopup" />
            <button class="btn-reset" @click="resetFilter">Reset</button>
            <button v-if="digiConfigured" class="btn-beli" @click="openBeliModal">⚡ Beli Haybi H2H</button>
            <button type="button" class="btn btn-primary" @click="openModal">+ Tambah Topup</button>
            <button v-if="bisaKelolaDigiflazz" class="btn-config" @click="openConfigModal" title="Konfigurasi Haybi H2H">⚙️</button>
          </div>
          <p v-if="digiConfigured && digiSaldo !== null" class="saldo-info">💰 Saldo Haybi H2H: {{ fmtRp(digiSaldo) }}</p>
        </div>

        <!-- History table -->
        <div class="card table-card">
          <div class="card-header">
            <span class="card-title">
              History Topup
              <span v-if="selectedSim" class="card-sub"> — {{ selectedSim.vendor?.nama_vendor }} ({{ selectedSim.site?.nama_site }})</span>
            </span>
            <span class="total-badge">Total: {{ fmtRp(meta.total_nominal) }}</span>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Site</th>
                  <th>Operator/Vendor</th>
                  <th>No. Pelanggan</th>
                  <th>Jenis</th>
                  <th>Nominal</th>
                  <th>Status</th>
                  <th>Keterangan</th>
                  <th>Oleh</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in topups" :key="t.id_topup">
                  <td class="nowrap">{{ fmtDate(t.tgl_topup) }}</td>
                  <td>
                    <div class="cell-main">{{ t.site?.nama_site }}</div>
                    <div class="cell-sub">{{ t.site?.pelanggan?.nama_pelanggan }}</div>
                  </td>
                  <td>{{ t.sumber?.vendor?.nama_vendor || '—' }}</td>
                  <td class="cell-sub">{{ t.sumber?.nomor_pelanggan_isp || '—' }}</td>
                  <td><span class="jenis-chip" :class="jenisClass(t.jenis_topup)">{{ t.jenis_topup }}</span></td>
                  <td class="nominal">{{ fmtRp(t.nominal) }}</td>
                  <td>
                    <span v-if="t.metode === 'Haybi'" class="status-chip" :class="statusClass(t.status_transaksi)">
                      {{ t.status_transaksi }}
                    </span>
                    <span v-else class="cell-sub">Manual</span>
                  </td>
                  <td class="ket">{{ t.keterangan || '—' }}</td>
                  <td>{{ t.user?.karyawan?.nama_lengkap || '—' }}</td>
                  <td class="nowrap">
                    <button v-if="t.metode === 'Haybi' && t.status_transaksi === 'Pending'" class="btn-cek-sm" @click="cekStatus(t.id_topup)">Cek Status</button>
                    <button class="btn-hapus-sm" @click="deleteTopup(t.id_topup)">Hapus</button>
                  </td>
                </tr>
                <tr v-if="topups.length === 0">
                  <td colspan="10" class="empty-cell">Belum ada data topup</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <BasePagination :page="page" :total-pages="meta.total_pages" @change="changePage" />
        </div>
      </div>
    </div>

    <!-- Modal Tambah Topup -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Tambah Topup SIM</h3>
            <button type="button" class="btn-modal-close" @click="showModal = false">✕</button>
          </div>

          <div class="modal-body">
            <div class="form-row">
              <label>Sumber Internet / SIM *</label>
              <select v-model="form.id_sumber">
                <option value="">Pilih sumber internet</option>
                <option v-for="s in simCards" :key="s.id_sumber" :value="s.id_sumber">
                  {{ s.vendor?.nama_vendor }} — {{ s.site?.nama_site }}
                  {{ s.nomor_pelanggan_isp ? '(' + s.nomor_pelanggan_isp + ')' : '' }}
                </option>
              </select>
            </div>
            <div class="form-row">
              <label>Tanggal Topup *</label>
              <input v-model="form.tgl_topup" type="date" />
            </div>
            <div class="form-row">
              <label>Jenis Topup *</label>
              <select v-model="form.jenis_topup">
                <option value="">Pilih jenis</option>
                <option v-for="j in JENIS_TOPUP" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="form-row">
              <label>Nominal (Rp) *</label>
              <input v-model.number="form.nominal" type="number" min="0" step="1000" placeholder="50000" />
            </div>
            <div class="form-row">
              <label>Keterangan</label>
              <input v-model="form.keterangan" type="text" placeholder="Opsional" />
            </div>
            <p v-if="formError" class="form-error">{{ formError }}</p>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showModal = false">Batal</button>
            <button type="button" class="btn btn-primary" :disabled="submitting" @click="submitTopup">
              {{ submitting ? 'Menyimpan…' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Beli Digiflazz -->
    <Teleport to="body">
      <div v-if="showBeliModal" class="modal-overlay" @click.self="showBeliModal = false">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h3>⚡ Beli Pulsa/Paket Data — Haybi H2H</h3>
            <button type="button" class="btn-modal-close" @click="showBeliModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div v-if="beliError" class="beli-error-banner">⚠️ {{ beliError }}</div>
            <div class="form-row">
              <label>Sumber Internet / SIM (nomor tujuan) *</label>
              <select v-model="beliForm.id_sumber">
                <option value="">Pilih sumber internet</option>
                <option v-for="s in simCards" :key="s.id_sumber" :value="s.id_sumber" :disabled="!s.nomor_pelanggan_isp">
                  {{ s.vendor?.nama_vendor }} — {{ s.site?.nama_site }}
                  {{ s.nomor_pelanggan_isp ? '(' + s.nomor_pelanggan_isp + ')' : '(nomor belum diisi)' }}
                </option>
              </select>
            </div>
            <div class="form-row">
              <label>Kategori</label>
              <div class="kategori-chips">
                <button class="chip" :class="{ active: produkKategori === '' }" @click="produkKategori = ''">Semua</button>
                <button v-for="k in kategoriList" :key="k" class="chip" :class="{ active: produkKategori === k }" @click="produkKategori = k">{{ k }}</button>
              </div>
            </div>
            <div class="form-row">
              <label>Cari Produk</label>
              <input v-model="produkSearch" type="text" placeholder="Telkomsel, Indosat, 10RB, dst..." />
            </div>
            <div class="produk-list">
              <div v-if="loadingProduk" class="empty-state">Memuat daftar produk...</div>
              <div v-else-if="!produkFiltered.length" class="empty-state">Tidak ada produk cocok</div>
              <div v-for="p in produkFiltered" :key="p.kode_produk"
                class="produk-item" :class="{ selected: beliForm.buyer_sku_code === p.kode_produk }"
                @click="beliForm.buyer_sku_code = p.kode_produk">
                <div class="produk-info">
                  <div class="produk-name">{{ p.nama_produk }}</div>
                  <div class="produk-sub">{{ p.operator }} · {{ p.kategori }}</div>
                </div>
                <div class="produk-price">{{ fmtRp(parseFloat(p.harga_jual) || 0) }}</div>
              </div>
            </div>
            <div class="form-row">
              <label>Keterangan</label>
              <input v-model="beliForm.keterangan" type="text" placeholder="Opsional" />
            </div>
            <div v-if="beliConfirm && beliProduk" class="beli-confirm">
              <div class="beli-confirm-title">Konfirmasi pembelian (transaksi berbayar, tidak bisa dibatalkan)</div>
              <div class="beli-confirm-row"><span>Nomor tujuan</span><strong>{{ beliSim?.nomor_pelanggan_isp || '—' }}</strong></div>
              <div class="beli-confirm-row"><span>Produk</span><strong>{{ beliProduk.nama_produk }}</strong></div>
              <div class="beli-confirm-row"><span>Harga</span><strong>{{ fmtRp(parseFloat(beliProduk.harga_jual) || 0) }}</strong></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="beliConfirm ? (beliConfirm = false) : (showBeliModal = false)" :disabled="beliSubmitting">
              {{ beliConfirm ? 'Kembali' : 'Batal' }}
            </button>
            <button v-if="!beliConfirm" type="button" class="btn btn-primary" :disabled="beliSubmitting || !beliForm.id_sumber || !beliProduk" @click="mintaKonfirmasiBeli" style="min-width:120px">
              Beli Sekarang
            </button>
            <button v-else type="button" class="btn btn-primary" :disabled="beliSubmitting" @click="submitBeli" style="min-width:120px">
              {{ beliSubmitting ? 'Memproses...' : 'Ya, Beli' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Konfigurasi Digiflazz -->
    <Teleport to="body">
      <div v-if="showConfigModal" class="modal-overlay" @click.self="showConfigModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>⚙️ Konfigurasi Haybi H2H</h3>
            <button type="button" class="btn-modal-close" @click="showConfigModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <label>Username Haybi H2H</label>
              <input v-model="configForm.username" type="text" placeholder="username akun Haybi H2H" />
            </div>
            <div class="form-row">
              <label>API Key {{ configHasKey ? '(sudah tersimpan — isi hanya jika ingin ganti)' : '' }}</label>
              <input v-model="configForm.api_key" type="password" :placeholder="configHasKey ? '••••••••' : 'API Key Haybi H2H'" />
            </div>
            <p v-if="configError" class="form-error">{{ configError }}</p>
            <p v-if="configMsg" class="config-msg">{{ configMsg }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showConfigModal = false">Tutup</button>
            <button type="button" class="btn btn-primary" :disabled="configSaving" @click="submitConfig">
              {{ configSaving ? 'Menyimpan...' : 'Simpan & Verifikasi' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { confirmDialog, alertDialog, alertError } from '@/composables/useDialog'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import BasePagination from '@/components/BasePagination.vue'
import { fmtRupiah, fmtDateShort, todayLocal } from '@/composables/useFormat'

const auth = useAuthStore()
const bisaKelolaDigiflazz = computed(() => auth.hasRole('Admin') || auth.hasRole('Director'))

const JENIS_TOPUP = ['Data', 'Pulsa', 'Paket_Bulanan', 'Aktivasi', 'Lainnya']

const simCards    = ref<any[]>([])
const topups      = ref<any[]>([])
const meta        = ref({ total: 0, total_pages: 1, total_nominal: 0 })
const page        = ref(1)
const selectedSim = ref<any>(null)
const simSearch   = ref('')
const filterJenis  = ref('')
const filterDari   = ref('')
const filterSampai = ref('')

const showModal  = ref(false)
const submitting = ref(false)
const formError  = ref('')
const form = ref({ id_sumber: '' as number | '', jenis_topup: '', nominal: 0, tgl_topup: todayLocal(), keterangan: '' })

// ─── DIGIFLAZZ ────────────────────────────────────────────────
const digiConfigured = ref(false)
const digiSaldo = ref<number | null>(null)

const showBeliModal = ref(false)
const produkList = ref<any[]>([])
const produkSearch = ref('')
const loadingProduk = ref(false)
const beliForm = ref({ id_sumber: '' as number | '', buyer_sku_code: '', keterangan: '' })
const beliError = ref('')
const beliSubmitting = ref(false)
const produkKategori = ref('')
const kategoriList = computed(() => {
  const set = new Set(produkList.value.map((p: any) => p.kategori).filter(Boolean))
  return Array.from(set) as string[]
})
const produkFiltered = computed(() => {
  const q = produkSearch.value.trim().toLowerCase()
  let list = produkList.value
  if (produkKategori.value) list = list.filter((p: any) => p.kategori === produkKategori.value)
  if (!q) return list.slice(0, 150)
  return list.filter((p: any) =>
    p.nama_produk?.toLowerCase().includes(q) ||
    p.operator?.toLowerCase().includes(q) ||
    p.kode_produk?.toLowerCase().includes(q) ||
    p.kategori?.toLowerCase().includes(q),
  ).slice(0, 150)
})

// Produk yang tersembunyi oleh pencarian/kategori tidak boleh tetap terpilih.
watch(produkFiltered, (list) => {
  if (beliForm.value.buyer_sku_code && !list.some((p: any) => p.kode_produk === beliForm.value.buyer_sku_code)) {
    beliForm.value.buyer_sku_code = ''
  }
})

const beliConfirm = ref(false)
const beliProduk = computed(() => produkList.value.find((p: any) => p.kode_produk === beliForm.value.buyer_sku_code) ?? null)
const beliSim = computed(() => simCards.value.find((s: any) => s.id_sumber === beliForm.value.id_sumber) ?? null)
watch(() => [beliForm.value.id_sumber, beliForm.value.buyer_sku_code], () => { beliConfirm.value = false })

function mintaKonfirmasiBeli() {
  beliError.value = ''
  if (!beliForm.value.id_sumber || !beliProduk.value) return
  beliConfirm.value = true
}

const showConfigModal = ref(false)
const configForm = ref({ username: '', api_key: '' })
const configHasKey = ref(false)
const configError = ref('')
const configMsg = ref('')
const configSaving = ref(false)

async function fetchDigiStatus() {
  try {
    const cfg = (await api.get('/digiflazz/config')).data.data
    digiConfigured.value = !!cfg.has_api_key
    if (digiConfigured.value) {
      try { digiSaldo.value = (await api.get('/digiflazz/saldo')).data.data.saldo } catch { digiSaldo.value = null }
    }
  } catch { digiConfigured.value = false }
}

async function openBeliModal() {
  beliForm.value = { id_sumber: selectedSim.value?.id_sumber || '', buyer_sku_code: '', keterangan: '' }
  beliError.value = ''
  beliConfirm.value = false
  produkKategori.value = ''
  produkSearch.value = ''
  showBeliModal.value = true
  loadingProduk.value = true
  try {
    produkList.value = (await api.get('/digiflazz/price-list')).data.data
  } catch (e: any) {
    beliError.value = e.response?.data?.message || 'Gagal memuat daftar produk'
  } finally { loadingProduk.value = false }
}

async function submitBeli() {
  beliError.value = ''
  if (!beliConfirm.value || !beliForm.value.id_sumber || !beliProduk.value) return
  beliSubmitting.value = true
  try {
    const r = await api.post('/digiflazz/beli', {
      id_sumber: Number(beliForm.value.id_sumber),
      buyer_sku_code: beliForm.value.buyer_sku_code,
      keterangan: beliForm.value.keterangan || undefined,
    })
    showBeliModal.value = false
    beliConfirm.value = false
    await alertDialog({ message: r.data.message || 'Transaksi diproses', variant: 'success' })
    await Promise.all([fetchTopup(), fetchSimCards(), fetchDigiStatus()])
  } catch (e: any) {
    beliError.value = e.response?.data?.message || 'Gagal memproses pembelian'
  } finally { beliSubmitting.value = false }
}

async function openConfigModal() {
  configError.value = ''; configMsg.value = ''
  showConfigModal.value = true
  try {
    const cfg = (await api.get('/digiflazz/config')).data.data
    configForm.value = { username: cfg.username || '', api_key: '' }
    configHasKey.value = !!cfg.has_api_key
  } catch {}
}

async function submitConfig() {
  configError.value = ''; configMsg.value = ''
  if (!configForm.value.username || !configForm.value.api_key) {
    configError.value = 'Username dan API Key wajib diisi'; return
  }
  configSaving.value = true
  try {
    const r = await api.patch('/digiflazz/config', configForm.value)
    configMsg.value = r.data.message
    configForm.value.api_key = ''
    await fetchDigiStatus()
  } catch (e: any) {
    configError.value = e.response?.data?.message || 'Gagal menyimpan konfigurasi'
  } finally { configSaving.value = false }
}

async function cekStatus(id_topup: number) {
  try {
    const r = await api.post(`/digiflazz/topup/${id_topup}/check-status`)
    await alertDialog({ title: 'Status Transaksi', message: r.data.message })
    await fetchTopup()
  } catch (e: any) {
    await alertError(e, 'Gagal cek status')
  }
}

function statusClass(s: string) {
  if (s === 'Sukses') return 'green'
  if (s === 'Gagal') return 'red'
  return 'yellow'
}

async function fetchSimCards() {
  try {
    const r = await api.get('/assets/sim-cards', { params: { search: simSearch.value || undefined } })
    simCards.value = r.data.data || []
  } catch {}
}

async function fetchTopup() {
  try {
    const params: any = { page: page.value, limit: 25 }
    if (selectedSim.value) params.id_sumber = selectedSim.value.id_sumber
    if (filterJenis.value) params.jenis_topup = filterJenis.value
    if (filterDari.value) params.tgl_dari = filterDari.value
    if (filterSampai.value) params.tgl_sampai = filterSampai.value
    const r = await api.get('/assets/sim-topup', { params })
    topups.value = r.data.data || []
    meta.value = r.data.meta || meta.value
  } catch {}
}

function selectSim(sim: any) {
  selectedSim.value = selectedSim.value?.id_sumber === sim.id_sumber ? null : sim
  page.value = 1
  fetchTopup()
}

function resetFilter() {
  filterJenis.value = ''
  filterDari.value = ''
  filterSampai.value = ''
  selectedSim.value = null
  page.value = 1
  fetchTopup()
}

function changePage(p: number) { page.value = p; fetchTopup() }

function openModal() {
  form.value = {
    id_sumber: selectedSim.value?.id_sumber || '',
    jenis_topup: '', nominal: 0,
    tgl_topup: todayLocal(),
    keterangan: '',
  }
  formError.value = ''
  showModal.value = true
}

async function submitTopup() {
  formError.value = ''
  if (!form.value.id_sumber) return (formError.value = 'Pilih sumber internet')
  if (!form.value.jenis_topup) return (formError.value = 'Pilih jenis topup')
  if (!form.value.nominal || form.value.nominal <= 0) return (formError.value = 'Nominal harus > 0')
  submitting.value = true
  try {
    await api.post('/assets/sim-topup', {
      id_sumber: Number(form.value.id_sumber),
      jenis_topup: form.value.jenis_topup,
      nominal: form.value.nominal,
      tgl_topup: form.value.tgl_topup,
      keterangan: form.value.keterangan || undefined,
    })
    showModal.value = false
    await Promise.all([fetchTopup(), fetchSimCards()])
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Gagal menyimpan'
  } finally { submitting.value = false }
}

async function deleteTopup(id_topup: number) {
  if (!(await confirmDialog({ title: 'Hapus Catatan Topup?', message: 'Hapus catatan topup ini?', variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  try {
    await api.delete('/assets/sim-topup/' + id_topup)
    await fetchTopup()
  } catch (e: any) {
    await alertError(e, 'Gagal menghapus topup')
  }
}

const fmtRp = fmtRupiah
const fmtDate = fmtDateShort
function jenisClass(j: string) {
  if (j === 'Data' || j === 'Paket_Bulanan') return 'blue'
  if (j === 'Pulsa') return 'green'
  if (j === 'Aktivasi') return 'purple'
  return 'gray'
}

onMounted(() => Promise.all([fetchSimCards(), fetchTopup(), fetchDigiStatus()]))
</script>

<style scoped>
.sim-page { display: flex; flex-direction: column; gap: 16px; }

.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 16px 20px; min-width: 0; }
.kpi-card.blue { background: linear-gradient(135deg,#1e40af,#3b82f6); color:#fff; border:none; }
.kpi-card.blue .kpi-label { color: rgba(255,255,255,.8); }
.kpi-val { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.kpi-label { font-size: 12px; color: #6b7280; margin-top: 2px; }

.page-body { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }

.sim-list-card { display: flex; flex-direction: column; }
.sim-list { max-height: 600px; overflow-y: auto; margin-top: 8px; }
.sim-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background .12s; border: 1px solid transparent; }
.sim-item:hover { background: #f3f4f6; }
.sim-item.selected { background: #eff6ff; border-color: #bfdbfe; }
.sim-icon { font-size: 20px; flex-shrink: 0; padding-top: 2px; }
.sim-info { flex: 1; min-width: 0; }
.sim-name { font-size: 13px; font-weight: 600; }
.sim-sub { font-size: 11px; color: #6b7280; }
.sim-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.sim-badge { font-size: 10px; padding: 2px 7px; border-radius: 10px; white-space: nowrap; }
.sim-badge.green { background: #dcfce7; color: #166534; }
.sim-badge.gray  { background: #f3f4f6; color: #374151; }
.sim-count { font-size: 10px; color: #94a3b8; }

.right-panel { display: flex; flex-direction: column; gap: 14px; }
.filter-card { padding: 12px 16px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-row select, .filter-row input[type="date"] { padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: #fff; }
.filter-sep { font-size: 12px; color: #6b7280; }
.btn-reset { background: none; border: 1px solid #d1d5db; border-radius: 6px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
.btn-reset:hover { background: #f3f4f6; }
.btn-beli { background: linear-gradient(135deg,#f59e0b,#d97706); color: #fff; border: none; border-radius: 6px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-config { background: none; border: 1px solid #d1d5db; border-radius: 6px; padding: 7px 10px; font-size: 13px; cursor: pointer; }
.btn-config:hover { background: #f3f4f6; }
.saldo-info { margin: 8px 0 0; font-size: 12px; color: #92400e; font-weight: 600; }

.status-chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.status-chip.green  { background: #dcfce7; color: #166534; }
.status-chip.red    { background: #fef2f2; color: #dc2626; }
.status-chip.yellow { background: #fef9c3; color: #a16207; }
.btn-cek-sm { padding: 4px 10px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; margin-right: 6px; }
.btn-cek-sm:hover { background: #dbeafe; }

.modal-lg { max-width: 560px; }
.beli-confirm { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px 14px; margin-top: 12px; font-size: 13px; }
.beli-confirm-title { font-weight: 700; color: #92400e; margin-bottom: 8px; }
.beli-confirm-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; color: #78350f; }
.beli-error-banner { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; font-weight: 500; }
.kategori-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 4px 10px; border-radius: 20px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 12px; cursor: pointer; transition: all .15s; }
.chip:hover { border-color: #94a3b8; }
.chip.active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.produk-list { max-height: 260px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
.produk-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
.produk-item:last-child { border-bottom: none; }
.produk-item:hover { background: #f8fafc; }
.produk-item.selected { background: #eff6ff; }
.produk-name { font-size: 13px; font-weight: 600; color: #0f172a; }
.produk-sub { font-size: 11px; color: #94a3b8; }
.produk-price { font-size: 13px; font-weight: 700; color: #1d4ed8; white-space: nowrap; }
.config-msg { font-size: 12px; color: #15803d; margin: 0; }

.cell-main { font-weight: 500; }
.cell-sub { font-size: 11px; color: #94a3b8; }
.nowrap { white-space: nowrap; }
.nominal { font-weight: 600; color: #1d4ed8; }
.ket { color: #6b7280; max-width: 130px; }
.empty-cell { text-align: center; color: #94a3b8; padding: 32px; }

.jenis-chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.jenis-chip.blue   { background: #dbeafe; color: #1e40af; }
.jenis-chip.green  { background: #dcfce7; color: #166534; }
.jenis-chip.purple { background: #ede9fe; color: #5b21b6; }
.jenis-chip.gray   { background: #f3f4f6; color: #374151; }
.total-badge { font-size: 13px; font-weight: 700; color: #1d4ed8; }
.btn-hapus-sm { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-hapus-sm:hover { background: #fee2e2; }


.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 16px 20px; }
.card-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.card-title { font-size: 14px; font-weight: 600; }
.card-sub { color: #6b7280; font-weight: 400; }
.search-sm { padding: 5px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; width: 130px; }
.empty-state { text-align: center; color: #94a3b8; padding: 24px; font-size: 13px; }

.modal { max-width: 440px; }
.modal-header h3 { margin: 0; font-size: 15px; color: var(--text-1); }
.modal-body { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; flex-direction: column; gap: 4px; }
.form-row label { font-size: 12px; font-weight: 500; color: #6b7280; }
.form-row input, .form-row select { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
.form-row input:focus, .form-row select:focus { outline: none; border-color: #3b82f6; }
.form-error { color: #dc2626; font-size: 12px; margin: 0; }

@media (max-width: 768px) { .page-body { grid-template-columns: 1fr; } .kpi-row { grid-template-columns: 1fr 1fr; } }
</style>
