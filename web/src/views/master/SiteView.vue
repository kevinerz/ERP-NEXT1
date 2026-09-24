<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/master'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { fmtDateShort } from '@/composables/useFormat'
import BasePagination from '@/components/BasePagination.vue'

const router = useRouter()
const master = useMasterStore()
const auth = useAuthStore()
const page = ref(1)
const search = ref('')
const filterPelanggan = ref(0)
const filterStatus = ref('')
const viewMode = ref<'list' | 'grup'>('grup')

// Expanded state: Set of grup id (0 = standalone), Set of pelanggan id
const expandedGrup = ref<Set<number>>(new Set())
const expandedPt = ref<Set<number>>(new Set())

const showModal = ref(false)
const editId = ref(0)
const form = ref({
  id_pelanggan: 0, id_layanan: 0, kode_site: '', nama_site: '',
  alamat_lengkap: '', kota: '', provinsi: '', koordinat_gps: '',
  status_site: 'Aktif', tgl_aktif: '', catatan: '',
})
const submitting = ref(false)
const formError = ref('')
const successMsg = ref('')

const STATUS_SITE = ['Prospek', 'Aktif', 'Terminasi', 'Suspend']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif: { bg: '#f0fdf4', color: '#15803d' },
  Prospek: { bg: '#eff6ff', color: '#1d4ed8' },
  Terminasi: { bg: '#fef2f2', color: '#dc2626' },
  Suspend: { bg: '#fef9c3', color: '#a16207' },
}
const grupColors = ['#1d4ed8', '#0891b2', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#047857', '#c2410c']
function grupColor(idx: number) { return grupColors[idx % grupColors.length] }

onMounted(async () => {
  await Promise.all([
    master.fetchPelangganDropdown(),
    master.fetchLayanan(),
    master.fetchGrupPelanggan(),
  ])
  fetchData()
  master.fetchSiteAll()
})

function fetchData() {
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  if (filterPelanggan.value) params.id_pelanggan = filterPelanggan.value
  if (filterStatus.value) params.status_site = filterStatus.value
  master.fetchSite(params)
}
function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

function switchView(mode: 'list' | 'grup') {
  viewMode.value = mode
  if (mode === 'grup' && !master.siteAllList.length) master.fetchSiteAll()
}

function toggleGrup(id: number) {
  if (expandedGrup.value.has(id)) expandedGrup.value.delete(id)
  else expandedGrup.value.add(id)
}
function togglePt(id: number) {
  if (expandedPt.value.has(id)) expandedPt.value.delete(id)
  else expandedPt.value.add(id)
}

// Semua site di-filter status dulu jika ada filter
const filteredSiteAll = computed(() => {
  let list = master.siteAllList
  if (filterStatus.value) list = list.filter(s => s.status_site === filterStatus.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(s => s.nama_site.toLowerCase().includes(q) || s.kode_site.toLowerCase().includes(q))
  }
  return list
})

// Site per pelanggan map
const siteByPelanggan = computed(() => {
  const map = new Map<number, typeof master.siteAllList>()
  filteredSiteAll.value.forEach(s => {
    const key = s.id_pelanggan
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  })
  return map
})

// Pelanggan yang punya site di filteredSiteAll (untuk standalone section)
const standalonePtWithSites = computed(() => {
  const grupPtIds = new Set(master.grupList.flatMap(g => g.pelanggan?.map(p => p.id_pelanggan) ?? []))
  return master.pelangganDropdown.filter(p => {
    const hasSites = siteByPelanggan.value.has(p.id_pelanggan)
    const isStandalone = !grupPtIds.has(p.id_pelanggan)
    return hasSites && isStandalone
  })
})

// Hitung total site per grup (dari filteredSiteAll)
function grupSiteCount(grp: typeof master.grupList[0]) {
  return (grp.pelanggan ?? []).reduce((sum, p) => sum + (siteByPelanggan.value.get(p.id_pelanggan)?.length ?? 0), 0)
}

// Status summary
const statusSummary = computed(() => {
  const sc = master.siteMeta.status_counts
  if (sc && Object.values(sc).some(v => v > 0)) return sc
  const counts: Record<string, number> = {}
  STATUS_SITE.forEach(s => counts[s] = 0)
  master.siteList.forEach((s: any) => { if (counts[s.status_site] !== undefined) counts[s.status_site]++ })
  return counts
})

// ─── Form handlers ───────────────────────────────────────
function openAdd() {
  editId.value = 0
  form.value = { id_pelanggan: filterPelanggan.value || 0, id_layanan: 0, kode_site: '', nama_site: '', alamat_lengkap: '', kota: '', provinsi: '', koordinat_gps: '', status_site: 'Aktif', tgl_aktif: '', catatan: '' }
  formError.value = ''; showModal.value = true
}

function openEdit(s: any) {
  editId.value = s.id_site
  form.value = {
    id_pelanggan: s.id_pelanggan, id_layanan: s.id_layanan,
    kode_site: s.kode_site, nama_site: s.nama_site,
    alamat_lengkap: s.alamat_lengkap, kota: s.kota || '', provinsi: s.provinsi || '',
    koordinat_gps: s.koordinat_gps || '', status_site: s.status_site,
    tgl_aktif: s.tgl_aktif ? s.tgl_aktif.substring(0, 10) : '', catatan: s.catatan || '',
  }
  formError.value = ''; showModal.value = true
}

async function hapusSite(site: any) {
  if (!confirm('Hapus site ' + site.nama_site + '?')) return
  try {
    await api.delete('/master/site/' + site.id_site)
    master.siteList = master.siteList.filter((s: any) => s.id_site !== site.id_site)
    master.siteAllList = master.siteAllList.filter((s: any) => s.id_site !== site.id_site)
    flash('Site dihapus')
  } catch (e: any) {
    const msg = e.response?.data?.message || 'Gagal menghapus site'
    if (e.response?.status === 400 && String(msg).includes('force delete')) {
      const canForce = auth.hasRole('Admin') || auth.hasRole('Director')
      if (!canForce) { alert(msg + '\n\nHubungi Admin untuk force delete.'); return }
      const ketik = prompt(
        `⚠️ PERINGATAN — Site "${site.nama_site}" masih punya tiket/project/kontrak/invoice.\n\n` +
        `Force delete akan MENGHAPUS PERMANEN site beserta SEMUA data terkait.\n\n` +
        `Ketik kode site "${site.kode_site}" untuk konfirmasi:`,
      )
      if (ketik === null) return
      if (ketik.trim() !== site.kode_site) { alert('Kode site tidak cocok — dibatalkan.'); return }
      try {
        const r = await api.delete('/master/site/' + site.id_site + '?force=true')
        master.siteList = master.siteList.filter((s: any) => s.id_site !== site.id_site)
        master.siteAllList = master.siteAllList.filter((s: any) => s.id_site !== site.id_site)
        flash(r.data?.message || 'Site + semua data terkait dihapus')
      } catch (e2: any) { alert(e2.response?.data?.message || 'Force delete gagal') }
      return
    }
    alert(msg)
  }
}

async function handleSubmit() {
  if (!form.value.id_pelanggan || !form.value.id_layanan || !form.value.kode_site || !form.value.nama_site || !form.value.alamat_lengkap) {
    formError.value = 'Pelanggan, Layanan, Kode, Nama, dan Alamat wajib diisi'; return
  }
  if (!editId.value && (!form.value.kota || !form.value.provinsi)) {
    formError.value = 'Kota dan Provinsi wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const payload: any = { ...form.value }
    Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === 0) delete payload[k] })
    if (editId.value) {
      delete payload.id_pelanggan; delete payload.kode_site; delete payload.id_layanan
      await master.updateSite(editId.value, { ...form.value, id_layanan: form.value.id_layanan || undefined })
    } else {
      await master.createSite(payload)
    }
    showModal.value = false
    flash(editId.value ? 'Site diperbarui' : 'Site ditambahkan')
    fetchData()
    master.fetchSiteAll()
    const { useProyekStore } = await import('@/stores/proyek')
    useProyekStore().siteList = []
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { submitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }
const fmtDate = fmtDateShort
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Site Pelanggan</h2>
        <p class="sub">Lokasi instalasi layanan</p>
      </div>
      <div class="header-actions">
        <div class="view-toggle">
          <button :class="['toggle-btn', viewMode === 'grup' && 'active']" @click="switchView('grup')">Per Grup</button>
          <button :class="['toggle-btn', viewMode === 'list' && 'active']" @click="switchView('list')">Daftar</button>
        </div>
        <button class="btn-primary" @click="openAdd">+ Tambah Site</button>
      </div>
    </div>

    <!-- Status chips + filter bar (shared both modes) -->
    <div class="status-summary" v-if="master.siteMeta.total || master.siteAllList.length">
      <span
        v-for="st in STATUS_SITE" :key="st"
        class="summary-chip"
        :class="{ 'chip-active': filterStatus === st }"
        :style="{ background: filterStatus === st ? STATUS_COLOR[st]?.color : STATUS_COLOR[st]?.bg, color: filterStatus === st ? '#fff' : STATUS_COLOR[st]?.color, borderColor: STATUS_COLOR[st]?.color + '40' }"
        @click="filterStatus = filterStatus === st ? '' : st; viewMode === 'list' && doSearch()"
      >
        {{ st }}: <strong>{{ statusSummary[st] ?? 0 }}</strong>
      </span>
    </div>

    <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>
    <div v-if="master.error" class="alert-error">{{ master.error }}</div>

    <!-- ═══════════════ GRUP VIEW ═══════════════ -->
    <template v-if="viewMode === 'grup'">
      <!-- Search bar -->
      <div class="toolbar">
        <input v-model="search" @input="() => {}" placeholder="Cari kode / nama site..." class="search-input" />
        <span class="site-count-badge">{{ filteredSiteAll.length }} site ditampilkan</span>
      </div>

      <div v-if="master.siteAllLoading" class="loading-state">Memuat hierarki site...</div>
      <template v-else>
        <div
          v-for="(grp, idx) in master.grupList"
          :key="grp.id_grup"
          class="grup-card"
          v-show="grupSiteCount(grp) > 0 || !filterStatus"
        >
          <!-- Grup header -->
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
              <span class="grup-stat"><b>{{ grp.pelanggan?.length ?? 0 }}</b> PT</span>
              <span class="grup-stat"><b>{{ grupSiteCount(grp) }}</b> site</span>
              <span class="chevron" :class="{ open: expandedGrup.has(grp.id_grup) }">▾</span>
            </div>
          </div>

          <!-- PT list under grup -->
          <div v-if="expandedGrup.has(grp.id_grup)" class="grup-body">
            <template v-for="pt in grp.pelanggan" :key="pt.id_pelanggan">
              <div
                class="pt-row"
                v-show="(siteByPelanggan.get(pt.id_pelanggan)?.length ?? 0) > 0 || !filterStatus"
                @click="togglePt(pt.id_pelanggan)"
              >
                <div class="pt-left">
                  <span class="pt-chevron" :class="{ open: expandedPt.has(pt.id_pelanggan) }">▸</span>
                  <span class="pt-kode">{{ pt.kode_pelanggan }}</span>
                  <span class="pt-nama">{{ pt.nama_pelanggan }}</span>
                  <span v-if="pt.kota" class="pt-kota">{{ pt.kota }}</span>
                </div>
                <div class="pt-right">
                  <span class="site-count-sm">{{ siteByPelanggan.get(pt.id_pelanggan)?.length ?? 0 }} site</span>
                </div>
              </div>

              <!-- Site rows under PT -->
              <div v-if="expandedPt.has(pt.id_pelanggan)" class="site-table-wrap">
                <table class="site-table">
                  <thead>
                    <tr>
                      <th>Kode Site</th>
                      <th>Nama Site</th>
                      <th>Kota</th>
                      <th>Layanan</th>
                      <th>Status</th>
                      <th>Tgl Aktif</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="s in (siteByPelanggan.get(pt.id_pelanggan) ?? [])"
                      :key="s.id_site"
                      class="site-row"
                      @click="router.push('/master/site/' + s.id_site)"
                    >
                      <td class="kode-cell">{{ s.kode_site }}</td>
                      <td class="nama-cell">{{ s.nama_site }}</td>
                      <td class="text-muted">{{ s.kota || '—' }}</td>
                      <td class="text-muted">{{ s.layanan?.kode_layanan || '—' }}</td>
                      <td>
                        <span class="status-badge"
                          :style="{ background: STATUS_COLOR[s.status_site]?.bg, color: STATUS_COLOR[s.status_site]?.color }">
                          {{ s.status_site }}
                        </span>
                      </td>
                      <td class="text-muted text-sm">{{ fmtDate(s.tgl_aktif) }}</td>
                      <td>
                        <button class="btn-edit-sm" @click.stop="openEdit(s)">Edit</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>

        <!-- Standalone (PT tanpa grup) -->
        <div class="grup-card standalone" v-if="standalonePtWithSites.length">
          <div class="grup-header" style="border-left-color:#94a3b8" @click="toggleGrup(0)">
            <div class="grup-left">
              <span class="grup-kode" style="color:#94a3b8">—</span>
              <span class="grup-nama" style="color:#64748b">Lainnya (Standalone)</span>
            </div>
            <div class="grup-right">
              <span class="grup-stat"><b>{{ standalonePtWithSites.length }}</b> PT</span>
              <span class="grup-stat">
                <b>{{ standalonePtWithSites.reduce((s, p) => s + (siteByPelanggan.get(p.id_pelanggan)?.length ?? 0), 0) }}</b> site
              </span>
              <span class="chevron" :class="{ open: expandedGrup.has(0) }">▾</span>
            </div>
          </div>
          <div v-if="expandedGrup.has(0)" class="grup-body">
            <template v-for="pt in standalonePtWithSites" :key="pt.id_pelanggan">
              <div class="pt-row" @click="togglePt(pt.id_pelanggan)">
                <div class="pt-left">
                  <span class="pt-chevron" :class="{ open: expandedPt.has(pt.id_pelanggan) }">▸</span>
                  <span class="pt-kode">{{ pt.kode_pelanggan }}</span>
                  <span class="pt-nama">{{ pt.nama_pelanggan }}</span>
                </div>
                <div class="pt-right">
                  <span class="site-count-sm">{{ siteByPelanggan.get(pt.id_pelanggan)?.length ?? 0 }} site</span>
                </div>
              </div>
              <div v-if="expandedPt.has(pt.id_pelanggan)" class="site-table-wrap">
                <table class="site-table">
                  <thead>
                    <tr>
                      <th>Kode Site</th><th>Nama Site</th><th>Kota</th><th>Layanan</th><th>Status</th><th>Tgl Aktif</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in (siteByPelanggan.get(pt.id_pelanggan) ?? [])" :key="s.id_site"
                      class="site-row" @click="router.push('/master/site/' + s.id_site)">
                      <td class="kode-cell">{{ s.kode_site }}</td>
                      <td class="nama-cell">{{ s.nama_site }}</td>
                      <td class="text-muted">{{ s.kota || '—' }}</td>
                      <td class="text-muted">{{ s.layanan?.kode_layanan || '—' }}</td>
                      <td><span class="status-badge" :style="{ background: STATUS_COLOR[s.status_site]?.bg, color: STATUS_COLOR[s.status_site]?.color }">{{ s.status_site }}</span></td>
                      <td class="text-muted text-sm">{{ fmtDate(s.tgl_aktif) }}</td>
                      <td><button class="btn-edit-sm" @click.stop="openEdit(s)">Edit</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>

        <div v-if="!master.grupList.length && !standalonePtWithSites.length" class="empty-state">
          <div class="empty-icon">📍</div>
          <div class="empty-title">Belum ada site</div>
        </div>
      </template>
    </template>

    <!-- ═══════════════ LIST VIEW ═══════════════ -->
    <template v-if="viewMode === 'list'">
      <div class="toolbar">
        <input v-model="search" @keyup.enter="doSearch" placeholder="Cari site / kode..." class="search-input" />
        <select v-model="filterPelanggan" @change="doSearch" class="filter-select">
          <option :value="0">Semua Pelanggan</option>
          <option v-for="p in master.pelangganDropdown" :key="p.id_pelanggan" :value="p.id_pelanggan">
            {{ p.nama_pelanggan }}
          </option>
        </select>
        <button class="btn-search" @click="doSearch">Cari</button>
      </div>

      <div class="table-card">
        <div v-if="master.siteLoading" class="loading">Memuat...</div>
        <table v-else>
          <thead>
            <tr>
              <th style="width:110px">Kode Site</th>
              <th>Nama Site</th>
              <th>Pelanggan</th>
              <th>Grup / Holding</th>
              <th>Layanan</th>
              <th style="width:100px">Kota</th>
              <th style="width:90px">Status</th>
              <th style="width:100px">Tgl Aktif</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!master.siteList.length">
              <td colspan="9">
                <div class="empty-state">
                  <div class="empty-icon">📍</div>
                  <div class="empty-title">Belum ada site</div>
                  <div class="empty-desc">Tambahkan site pelanggan pertama</div>
                </div>
              </td>
            </tr>
            <tr v-for="s in master.siteList" :key="s.id_site" class="table-row clickable-row" @click="router.push('/master/site/' + s.id_site)">
              <td class="fw700">{{ s.kode_site }}</td>
              <td>{{ s.nama_site }}</td>
              <td class="text-gray">{{ s.pelanggan?.nama_pelanggan }}</td>
              <td>
                <span v-if="s.pelanggan?.grup" class="grup-badge-sm">{{ s.pelanggan.grup.nama_grup }}</span>
                <span v-else class="text-gray">—</span>
              </td>
              <td class="text-gray">{{ s.layanan?.kode_layanan }}</td>
              <td class="text-gray">{{ s.kota || '—' }}</td>
              <td>
                <span class="status-badge"
                  :style="{ background: STATUS_COLOR[s.status_site]?.bg, color: STATUS_COLOR[s.status_site]?.color }">
                  {{ s.status_site }}
                </span>
              </td>
              <td class="text-gray text-sm">{{ fmtDate(s.tgl_aktif) }}</td>
              <td>
                <div class="row-actions">
                  <button class="btn-edit-sm" @click.stop="openEdit(s)">Edit</button>
                  <button class="btn-hapus-sm" @click.stop="hapusSite(s)">Hapus</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <BasePagination :page="page" :total-pages="master.siteMeta.total_pages" @change="goPage" />
        <div class="table-footer" v-if="master.siteMeta.total">Total: {{ master.siteMeta.total }} site</div>
      </div>
    </template>

    <!-- Modal Form Site -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ editId ? 'Edit Site' : 'Tambah Site' }}</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Pelanggan <span class="req">*</span></label>
            <select v-model="form.id_pelanggan" :disabled="!!editId">
              <option :value="0">— Pilih Pelanggan —</option>
              <option v-for="p in master.pelangganDropdown" :key="p.id_pelanggan" :value="p.id_pelanggan">
                [{{ p.kode_pelanggan }}] {{ p.nama_pelanggan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Layanan <span class="req">*</span></label>
            <select v-model="form.id_layanan">
              <option :value="0">— Pilih Layanan —</option>
              <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">
                [{{ l.kode_layanan }}] {{ l.nama_layanan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Kode Site <span class="req">*</span></label>
            <input v-model="form.kode_site" placeholder="SITE-001" :disabled="!!editId" />
          </div>
          <div class="field full">
            <label>Nama Site <span class="req">*</span></label>
            <input v-model="form.nama_site" placeholder="Kantor Pusat / Gedung A..." />
          </div>
          <div class="field full">
            <label>Alamat Lengkap <span class="req">*</span></label>
            <textarea v-model="form.alamat_lengkap" rows="2" placeholder="Jl. ..."></textarea>
          </div>
          <div class="field">
            <label>Kota</label>
            <input v-model="form.kota" placeholder="Jakarta" />
          </div>
          <div class="field">
            <label>Provinsi</label>
            <input v-model="form.provinsi" placeholder="DKI Jakarta" />
          </div>
          <div class="field">
            <label>Koordinat GPS</label>
            <input v-model="form.koordinat_gps" placeholder="-6.123456, 106.123456" />
          </div>
          <div class="field">
            <label>Status Site</label>
            <select v-model="form.status_site">
              <option v-for="s in STATUS_SITE" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field">
            <label>Tgl Aktif</label>
            <input v-model="form.tgl_aktif" type="date" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2"></textarea>
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
.page { padding: 28px 32px; max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-actions { display: flex; align-items: center; gap: 10px; }

/* Toggle */
.view-toggle { display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; gap: 2px; }
.toggle-btn { padding: 6px 16px; border: none; background: none; border-radius: 6px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; }
.toggle-btn.active { background: #fff; color: #1d4ed8; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,.1); }

.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

/* Status summary */
.status-summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.summary-chip { padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 1px solid transparent; cursor: pointer; transition: all .15s; user-select: none; }
.summary-chip:hover { filter: brightness(.95); }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }
.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 14px; }

.toolbar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
.search-input { flex: 1; max-width: 280px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #3b82f6; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.site-count-badge { font-size: 12px; color: #64748b; padding: 5px 10px; background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; }

/* Grup cards */
.grup-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.07); overflow: hidden; margin-bottom: 10px; }
.grup-card.standalone { opacity: .88; }
.grup-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; border-left: 4px solid #1d4ed8; cursor: pointer; user-select: none; gap: 12px; }
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

/* PT row inside grup */
.grup-body { border-top: 1px solid #f1f5f9; }
.pt-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px 10px 32px; cursor: pointer; user-select: none; background: #fafbfc; }
.pt-row:hover { background: #f1f5f9; }
.pt-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.pt-chevron { font-size: 11px; color: #94a3b8; transition: transform .15s; display: inline-block; width: 14px; }
.pt-chevron.open { transform: rotate(90deg); }
.pt-kode { font-size: 12px; font-weight: 700; color: #1d4ed8; background: #eff6ff; border-radius: 4px; padding: 1px 7px; }
.pt-nama { font-size: 13.5px; font-weight: 600; color: #0f172a; }
.pt-kota { font-size: 12px; color: #94a3b8; }
.pt-right { flex-shrink: 0; }
.site-count-sm { font-size: 12px; color: #64748b; background: #f1f5f9; border-radius: 12px; padding: 2px 10px; }

/* Site table inside PT */
.site-table-wrap { overflow-x: auto; border-top: 1px solid #f1f5f9; }
.site-table { width: 100%; border-collapse: collapse; }
.site-table th { padding: 8px 14px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: left; text-transform: uppercase; letter-spacing: .04em; background: #fff; }
.site-table td { padding: 10px 14px; font-size: 13px; color: #0f172a; border-top: 1px solid #f9fafb; }
.site-row { cursor: pointer; transition: background .1s; }
.site-row:hover td { background: #f0f4ff; }
.kode-cell { font-weight: 700; color: #1d4ed8; font-size: 12.5px; white-space: nowrap; }
.nama-cell { font-weight: 500; }
.text-muted { color: #64748b; }
.text-sm { font-size: 12px; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.btn-edit-sm { padding: 4px 12px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #334155; }
.btn-hapus-sm { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }

/* List view */
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 11.5px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: .04em; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.table-row { transition: background 0.15s; }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: #f0f4ff; }
.fw700 { font-weight: 700; color: #1d4ed8; font-size: 13px; }
.text-gray { color: #64748b; }
.grup-badge-sm { background: #f0f9ff; color: #0369a1; font-size: 12px; border-radius: 5px; padding: 2px 8px; font-weight: 600; white-space: nowrap; }
.row-actions { display: flex; gap: 4px; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

/* Empty & loading */
.loading-state { padding: 48px; text-align: center; color: #94a3b8; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.empty-state { text-align: center; padding: 52px 20px; }
.empty-icon { font-size: 36px; margin-bottom: 12px; }
.empty-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: #94a3b8; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 580px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; font-weight: 700; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; font-family: inherit; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.field input:disabled, .field select:disabled { background: #f1f5f9; color: #94a3b8; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 8px 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 768px) {
  .page { padding: 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .field.full { grid-column: 1; }
}
</style>
