<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/master'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { fmtDateShort } from '@/composables/useFormat'
import BasePagination from '@/components/BasePagination.vue'

const router = useRouter()
const master = useMasterStore()
const auth = useAuthStore()

// ─── List view state ────────────────────────────────────────
const page = ref(1)
const pageSize = ref(50)
const search = ref('')
const filterPelanggan = ref(0)
const filterLayanan = ref(0)
const filterStatus = ref('')
const filterGrup = ref(0)
const viewMode = ref<'list' | 'grup'>('grup')

// ─── Grup view state ─────────────────────────────────────────
const expandedGrup = ref<Set<number>>(new Set())
const expandedPt = ref<Set<number>>(new Set())
const grupSearch = ref('')

// ─── Modal ────────────────────────────────────────────────
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
const copiedKode = ref('')

const STATUS_SITE = ['Prospek', 'Aktif', 'Terminasi', 'Suspend']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif:     { bg: '#f0fdf4', color: '#15803d' },
  Prospek:   { bg: '#eff6ff', color: '#1d4ed8' },
  Terminasi: { bg: '#fef2f2', color: '#dc2626' },
  Suspend:   { bg: '#fef9c3', color: '#a16207' },
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

// ─── List view ───────────────────────────────────────────────
function fetchData() {
  const params: any = { page: page.value, limit: pageSize.value }
  if (search.value)          params.search = search.value
  if (filterPelanggan.value) params.id_pelanggan = filterPelanggan.value
  if (filterLayanan.value)   params.id_layanan = filterLayanan.value
  if (filterStatus.value)    params.status_site = filterStatus.value
  if (filterGrup.value)      params.id_grup = filterGrup.value
  master.fetchSite(params)
}
function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }
function resetFilters() {
  search.value = ''; filterPelanggan.value = 0; filterLayanan.value = 0
  filterStatus.value = ''; filterGrup.value = 0; page.value = 1; fetchData()
}
watch(pageSize, () => { page.value = 1; fetchData() })

function switchView(mode: 'list' | 'grup') {
  viewMode.value = mode
  if (mode === 'grup' && !master.siteAllList.length) master.fetchSiteAll()
}

// ─── Grup view computed ──────────────────────────────────────
const filteredSiteAll = computed(() => {
  let list = master.siteAllList
  if (filterStatus.value) list = list.filter(s => s.status_site === filterStatus.value)
  if (filterLayanan.value) list = list.filter(s => s.id_layanan === filterLayanan.value)
  if (grupSearch.value) {
    const q = grupSearch.value.toLowerCase()
    list = list.filter(s =>
      s.nama_site.toLowerCase().includes(q) ||
      s.kode_site.toLowerCase().includes(q) ||
      (s.kota || '').toLowerCase().includes(q) ||
      (s.pelanggan?.nama_pelanggan || '').toLowerCase().includes(q) ||
      (s.layanan?.nama_layanan || '').toLowerCase().includes(q)
    )
  }
  return list
})

const siteByPelanggan = computed(() => {
  const map = new Map<number, typeof master.siteAllList>()
  filteredSiteAll.value.forEach(s => {
    if (!map.has(s.id_pelanggan)) map.set(s.id_pelanggan, [])
    map.get(s.id_pelanggan)!.push(s)
  })
  return map
})

const standalonePtWithSites = computed(() => {
  const grupPtIds = new Set(master.grupList.flatMap(g => g.pelanggan?.map(p => p.id_pelanggan) ?? []))
  return master.pelangganDropdown.filter(p =>
    siteByPelanggan.value.has(p.id_pelanggan) && !grupPtIds.has(p.id_pelanggan)
  )
})

function grupSiteCount(grp: typeof master.grupList[0]) {
  return (grp.pelanggan ?? []).reduce((sum, p) => sum + (siteByPelanggan.value.get(p.id_pelanggan)?.length ?? 0), 0)
}

// Auto-expand grup & PT saat search ada isi
watch(grupSearch, (val) => {
  if (!val) { expandedGrup.value.clear(); expandedPt.value.clear(); return }
  const matchedPtIds = new Set(filteredSiteAll.value.map(s => s.id_pelanggan))
  for (const grp of master.grupList) {
    const hasPt = (grp.pelanggan ?? []).some(p => matchedPtIds.has(p.id_pelanggan))
    if (hasPt) {
      expandedGrup.value.add(grp.id_grup)
      for (const p of grp.pelanggan ?? []) {
        if (matchedPtIds.has(p.id_pelanggan)) expandedPt.value.add(p.id_pelanggan)
      }
    }
  }
  // standalone
  if (standalonePtWithSites.value.length) {
    expandedGrup.value.add(0)
    standalonePtWithSites.value.forEach(p => expandedPt.value.add(p.id_pelanggan))
  }
})

function toggleGrup(id: number) {
  if (expandedGrup.value.has(id)) expandedGrup.value.delete(id)
  else expandedGrup.value.add(id)
}
function togglePt(id: number) {
  if (expandedPt.value.has(id)) expandedPt.value.delete(id)
  else expandedPt.value.add(id)
}

// ─── Copy kode ───────────────────────────────────────────────
async function copyKode(kode: string, e: Event) {
  e.stopPropagation()
  try { await navigator.clipboard.writeText(kode) } catch {
    const el = document.createElement('input')
    el.value = kode; document.body.appendChild(el)
    el.select(); document.execCommand('copy'); document.body.removeChild(el)
  }
  copiedKode.value = kode
  setTimeout(() => { if (copiedKode.value === kode) copiedKode.value = '' }, 1500)
}

// ─── Status summary ──────────────────────────────────────────
const statusSummary = computed(() => {
  if (viewMode.value === 'grup') {
    const c: Record<string, number> = { Prospek: 0, Aktif: 0, Terminasi: 0, Suspend: 0 }
    master.siteAllList.forEach(s => { if (c[s.status_site] !== undefined) c[s.status_site]++ })
    return c
  }
  const sc = master.siteMeta.status_counts
  if (sc && Object.values(sc).some(v => v > 0)) return sc
  const c: Record<string, number> = { Prospek: 0, Aktif: 0, Terminasi: 0, Suspend: 0 }
  master.siteList.forEach((s: any) => { if (c[s.status_site] !== undefined) c[s.status_site]++ })
  return c
})

const totalSiteAll = computed(() => master.siteAllList.length)
const hasActiveFilters = computed(() =>
  !!search.value || !!filterPelanggan.value || !!filterLayanan.value || !!filterStatus.value || !!filterGrup.value
)

// ─── Form ────────────────────────────────────────────────────
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
    alamat_lengkap: s.alamat_lengkap || '', kota: s.kota || '', provinsi: s.provinsi || '',
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
    fetchData(); master.fetchSiteAll()
    const { useProyekStore } = await import('@/stores/proyek')
    useProyekStore().siteList = []
  } catch (e: any) { formError.value = e.response?.data?.message || 'Gagal menyimpan' }
  finally { submitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }
const fmtDate = fmtDateShort

// Highlight match dalam text
function highlight(text: string, q: string) {
  if (!q || !text) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + q.length) + '</mark>' + text.slice(idx + q.length)
}
</script>

<template>
  <div class="page">
    <!-- ─── Header ─── -->
    <div class="page-header">
      <div>
        <h2>Site Pelanggan</h2>
        <p class="sub">{{ totalSiteAll.toLocaleString('id') }} total site · Lokasi instalasi layanan</p>
      </div>
      <div class="header-actions">
        <div class="view-toggle">
          <button :class="['toggle-btn', viewMode === 'grup' && 'active']" @click="switchView('grup')">
            ▦ Per Grup
          </button>
          <button :class="['toggle-btn', viewMode === 'list' && 'active']" @click="switchView('list')">
            ≡ Daftar
          </button>
        </div>
        <button class="btn-primary" @click="openAdd">+ Tambah Site</button>
      </div>
    </div>

    <!-- ─── Status chips ─── -->
    <div class="status-bar">
      <div class="status-chips">
        <span
          v-for="st in STATUS_SITE" :key="st"
          class="chip"
          :class="{ active: filterStatus === st }"
          :style="{
            background: filterStatus === st ? STATUS_COLOR[st]?.color : STATUS_COLOR[st]?.bg,
            color: filterStatus === st ? '#fff' : STATUS_COLOR[st]?.color,
            borderColor: STATUS_COLOR[st]?.color + '55'
          }"
          @click="filterStatus = filterStatus === st ? '' : st; viewMode === 'list' && doSearch()"
        >
          {{ st }} <b>{{ statusSummary[st] ?? 0 }}</b>
        </span>
      </div>
    </div>

    <div v-if="successMsg" class="alert-success">✓ {{ successMsg }}</div>
    <div v-if="master.error" class="alert-error">{{ master.error }}</div>

    <!-- ═══════════════════ GRUP VIEW ═══════════════════ -->
    <template v-if="viewMode === 'grup'">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="search-wrap">
          <span class="search-icon">⌕</span>
          <input
            v-model="grupSearch"
            placeholder="Cari kode, nama site, kota, pelanggan, layanan..."
            class="search-input"
            @keydown.escape="grupSearch = ''"
          />
          <button v-if="grupSearch" class="clear-btn" @click="grupSearch = ''">✕</button>
        </div>
        <select v-model="filterLayanan" @change="() => {}" class="filter-select">
          <option :value="0">Semua Layanan</option>
          <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">
            {{ l.nama_layanan }}
          </option>
        </select>
        <span class="result-badge">
          {{ filteredSiteAll.length.toLocaleString('id') }} site
          <span v-if="grupSearch || filterLayanan || filterStatus"> (difilter)</span>
        </span>
        <button v-if="master.siteAllLoading" class="btn-refresh spin" title="Memuat...">↻</button>
        <button v-else class="btn-refresh" @click="master.fetchSiteAll()" title="Refresh data">↻</button>
      </div>

      <div v-if="master.siteAllLoading" class="loading-state">
        <span class="loading-spinner">↻</span> Memuat data site...
      </div>
      <template v-else>
        <!-- Grup cards -->
        <div
          v-for="(grp, idx) in master.grupList"
          :key="grp.id_grup"
          class="grup-card"
          v-show="grupSiteCount(grp) > 0 || (!filterStatus && !filterLayanan && !grupSearch)"
        >
          <div class="grup-header" :style="{ borderLeftColor: grupColor(idx) }" @click="toggleGrup(grp.id_grup)">
            <div class="grup-left">
              <span class="grup-kode" :style="{ color: grupColor(idx) }">{{ grp.kode_grup }}</span>
              <span class="grup-nama">{{ grp.nama_grup }}</span>
              <span v-if="grp.deskripsi" class="grup-desc">{{ grp.deskripsi }}</span>
            </div>
            <div class="grup-right">
              <span class="grup-stat"><b>{{ grp.pelanggan?.length ?? 0 }}</b> PT</span>
              <span class="grup-stat" :class="{ 'stat-filtered': grupSearch || filterLayanan || filterStatus }">
                <b>{{ grupSiteCount(grp) }}</b> site
              </span>
              <span class="chevron" :class="{ open: expandedGrup.has(grp.id_grup) }">▾</span>
            </div>
          </div>

          <div v-if="expandedGrup.has(grp.id_grup)" class="grup-body">
            <template v-for="pt in grp.pelanggan" :key="pt.id_pelanggan">
              <div
                class="pt-row"
                v-show="(siteByPelanggan.get(pt.id_pelanggan)?.length ?? 0) > 0 || (!filterStatus && !filterLayanan && !grupSearch)"
                @click="togglePt(pt.id_pelanggan)"
              >
                <div class="pt-left">
                  <span class="pt-chevron" :class="{ open: expandedPt.has(pt.id_pelanggan) }">▸</span>
                  <span class="pt-kode">{{ pt.kode_pelanggan }}</span>
                  <span class="pt-nama" v-html="highlight(pt.nama_pelanggan, grupSearch)"></span>
                  <span v-if="pt.kota" class="pt-kota">{{ pt.kota }}</span>
                </div>
                <div class="pt-right">
                  <span class="site-count-sm" :class="{ 'count-filtered': grupSearch || filterLayanan || filterStatus }">
                    {{ siteByPelanggan.get(pt.id_pelanggan)?.length ?? 0 }} site
                  </span>
                </div>
              </div>

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
                      <td>
                        <span
                          class="kode-cell"
                          :class="{ copied: copiedKode === s.kode_site }"
                          :title="copiedKode === s.kode_site ? 'Tersalin!' : 'Klik untuk salin'"
                          @click.stop="copyKode(s.kode_site, $event)"
                        >{{ s.kode_site }}</span>
                      </td>
                      <td class="nama-cell" v-html="highlight(s.nama_site, grupSearch)"></td>
                      <td class="text-muted" v-html="highlight(s.kota || '—', grupSearch)"></td>
                      <td>
                        <span class="lay-badge" :title="s.layanan?.nama_layanan">
                          {{ s.layanan?.nama_layanan || '—' }}
                        </span>
                      </td>
                      <td>
                        <span class="status-badge" :style="{ background: STATUS_COLOR[s.status_site]?.bg, color: STATUS_COLOR[s.status_site]?.color }">
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

        <!-- Standalone -->
        <div class="grup-card standalone" v-if="standalonePtWithSites.length">
          <div class="grup-header" style="border-left-color:#94a3b8" @click="toggleGrup(0)">
            <div class="grup-left">
              <span class="grup-kode" style="color:#94a3b8">—</span>
              <span class="grup-nama" style="color:#64748b">Lainnya</span>
              <span class="grup-desc">Pelanggan tanpa grup</span>
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
                  <span class="pt-nama" v-html="highlight(pt.nama_pelanggan, grupSearch)"></span>
                </div>
                <div class="pt-right">
                  <span class="site-count-sm">{{ siteByPelanggan.get(pt.id_pelanggan)?.length ?? 0 }} site</span>
                </div>
              </div>
              <div v-if="expandedPt.has(pt.id_pelanggan)" class="site-table-wrap">
                <table class="site-table">
                  <thead>
                    <tr><th>Kode Site</th><th>Nama Site</th><th>Kota</th><th>Layanan</th><th>Status</th><th>Tgl Aktif</th><th></th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in (siteByPelanggan.get(pt.id_pelanggan) ?? [])" :key="s.id_site"
                      class="site-row" @click="router.push('/master/site/' + s.id_site)">
                      <td>
                        <span class="kode-cell" :class="{ copied: copiedKode === s.kode_site }"
                          :title="copiedKode === s.kode_site ? 'Tersalin!' : 'Klik untuk salin'"
                          @click.stop="copyKode(s.kode_site, $event)">{{ s.kode_site }}</span>
                      </td>
                      <td class="nama-cell" v-html="highlight(s.nama_site, grupSearch)"></td>
                      <td class="text-muted">{{ s.kota || '—' }}</td>
                      <td><span class="lay-badge" :title="s.layanan?.nama_layanan">{{ s.layanan?.nama_layanan || '—' }}</span></td>
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

    <!-- ═══════════════════ LIST VIEW ═══════════════════ -->
    <template v-if="viewMode === 'list'">
      <!-- Filter bar -->
      <div class="filter-bar">
        <div class="search-wrap">
          <span class="search-icon">⌕</span>
          <input
            v-model="search"
            placeholder="Cari kode, nama site, kota, pelanggan..."
            class="search-input"
            @keyup.enter="doSearch"
            @keydown.escape="search = ''"
          />
          <button v-if="search" class="clear-btn" @click="search = ''; doSearch()">✕</button>
        </div>
        <select v-model="filterGrup" @change="doSearch" class="filter-select">
          <option :value="0">Semua Grup</option>
          <option v-for="g in master.grupList" :key="g.id_grup" :value="g.id_grup">{{ g.nama_grup }}</option>
        </select>
        <select v-model="filterPelanggan" @change="doSearch" class="filter-select">
          <option :value="0">Semua Pelanggan</option>
          <option v-for="p in master.pelangganDropdown" :key="p.id_pelanggan" :value="p.id_pelanggan">
            {{ p.nama_pelanggan }}
          </option>
        </select>
        <select v-model="filterLayanan" @change="doSearch" class="filter-select">
          <option :value="0">Semua Layanan</option>
          <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">{{ l.nama_layanan }}</option>
        </select>
        <button class="btn-search" @click="doSearch">Cari</button>
        <button v-if="hasActiveFilters" class="btn-reset" @click="resetFilters" title="Reset semua filter">✕ Reset</button>
      </div>

      <!-- Page size + total -->
      <div class="list-meta">
        <span class="total-label">
          Total <b>{{ master.siteMeta.total?.toLocaleString('id') }}</b> site
          <span v-if="hasActiveFilters"> (difilter)</span>
        </span>
        <div class="page-size-wrap">
          Tampil:
          <select v-model="pageSize" class="size-select">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
          </select>
          per halaman
        </div>
      </div>

      <div class="table-card">
        <div v-if="master.siteLoading" class="loading">↻ Memuat...</div>
        <table v-else>
          <thead>
            <tr>
              <th style="width:120px">Kode Site</th>
              <th>Nama Site</th>
              <th>Pelanggan / Grup</th>
              <th>Layanan</th>
              <th style="width:110px">Kota</th>
              <th style="width:90px">Status</th>
              <th style="width:95px">Tgl Aktif</th>
              <th style="width:90px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!master.siteList.length">
              <td colspan="8">
                <div class="empty-state">
                  <div class="empty-icon">📍</div>
                  <div class="empty-title">Tidak ada site ditemukan</div>
                  <div class="empty-desc">Coba ubah filter pencarian</div>
                  <button v-if="hasActiveFilters" class="btn-reset-lg" @click="resetFilters">Reset Filter</button>
                </div>
              </td>
            </tr>
            <tr v-for="s in master.siteList" :key="s.id_site" class="table-row clickable-row"
              @click="router.push('/master/site/' + s.id_site)">
              <td>
                <span
                  class="kode-cell"
                  :class="{ copied: copiedKode === s.kode_site }"
                  :title="copiedKode === s.kode_site ? 'Tersalin!' : 'Klik untuk salin kode'"
                  @click.stop="copyKode(s.kode_site, $event)"
                >{{ s.kode_site }}</span>
              </td>
              <td class="fw600">{{ s.nama_site }}</td>
              <td>
                <div class="pt-stack">
                  <span class="pt-nama-sm">{{ s.pelanggan?.nama_pelanggan }}</span>
                  <span v-if="s.pelanggan?.grup" class="grup-badge-sm">{{ s.pelanggan.grup.nama_grup }}</span>
                </div>
              </td>
              <td>
                <span class="lay-badge" :title="s.layanan?.nama_layanan">{{ s.layanan?.nama_layanan || '—' }}</span>
              </td>
              <td class="text-gray">{{ s.kota || '—' }}</td>
              <td>
                <span class="status-badge" :style="{ background: STATUS_COLOR[s.status_site]?.bg, color: STATUS_COLOR[s.status_site]?.color }">
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
        <div class="table-footer-bar">
          <BasePagination :page="page" :total-pages="master.siteMeta.total_pages" @change="goPage" />
          <span class="page-info">
            Hal {{ page }} / {{ master.siteMeta.total_pages }} · {{ master.siteMeta.total?.toLocaleString('id') }} site
          </span>
        </div>
      </div>
    </template>

    <!-- ─── Modal Form Site ─── -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-head">
          <h3>{{ editId ? 'Edit Site' : 'Tambah Site Baru' }}</h3>
          <button class="modal-close" @click="showModal = false">✕</button>
        </div>
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
                {{ l.nama_layanan }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Kode Site <span class="req">*</span></label>
            <input v-model="form.kode_site" placeholder="SITE-001" :disabled="!!editId" />
          </div>
          <div class="field full">
            <label>Nama Site <span class="req">*</span></label>
            <input v-model="form.nama_site" placeholder="Kantor Pusat / Outlet ..." />
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
            {{ submitting ? 'Menyimpan...' : (editId ? 'Simpan Perubahan' : 'Tambah Site') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px 28px; max-width: 1400px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.page-header h2 { margin: 0 0 3px; font-size: 20px; color: #0f172a; font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.view-toggle { display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; gap: 2px; }
.toggle-btn { padding: 6px 16px; border: none; background: none; border-radius: 6px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; transition: all .15s; }
.toggle-btn.active { background: #fff; color: #1d4ed8; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.btn-primary { padding: 9px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }

/* Status bar */
.status-bar { margin-bottom: 16px; }
.status-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chip { padding: 5px 13px; border-radius: 20px; font-size: 12.5px; font-weight: 500; border: 1px solid transparent; cursor: pointer; transition: all .15s; user-select: none; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.chip:hover { filter: brightness(.94); }
.chip b { font-size: 13px; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 9px 14px; margin-bottom: 12px; }
.alert-error   { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 9px 14px; margin-bottom: 12px; }

/* Toolbar / filter bar */
.toolbar, .filter-bar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
.search-wrap { position: relative; flex: 1; min-width: 220px; max-width: 380px; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 16px; color: #94a3b8; pointer-events: none; }
.search-input { width: 100%; padding: 9px 34px 9px 32px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
.search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px #3b82f620; }
.clear-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 14px; padding: 0 4px; }
.clear-btn:hover { color: #475569; }
.filter-select { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; color: #374151; background: #fff; max-width: 200px; }
.filter-select:focus { border-color: #3b82f6; }
.btn-search { padding: 9px 18px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-reset { padding: 9px 14px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.result-badge { font-size: 12.5px; color: #64748b; padding: 5px 12px; background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; white-space: nowrap; }
.btn-refresh { background: none; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; cursor: pointer; font-size: 15px; color: #64748b; transition: all .2s; }
.btn-refresh:hover { background: #f1f5f9; color: #1d4ed8; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }

/* List meta */
.list-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px; }
.total-label { font-size: 13px; color: #64748b; }
.total-label b { color: #0f172a; }
.page-size-wrap { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; }
.size-select { padding: 5px 8px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; outline: none; }

/* Grup cards */
.grup-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.07); overflow: hidden; margin-bottom: 8px; }
.grup-card.standalone { opacity: .85; }
.grup-header { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; border-left: 4px solid #1d4ed8; cursor: pointer; user-select: none; gap: 12px; transition: background .1s; min-height: 48px; }
.grup-header:hover { background: #f8fafc; }
.grup-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow: hidden; }
.grup-kode { font-size: 11px; font-weight: 700; background: #f1f5f9; border-radius: 5px; padding: 2px 7px; white-space: nowrap; flex-shrink: 0; }
.grup-nama { font-size: 14px; font-weight: 700; color: #0f172a; white-space: nowrap; flex-shrink: 0; }
.grup-desc { font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.grup-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-left: 8px; }
.grup-stat { font-size: 12.5px; color: #64748b; white-space: nowrap; }
.grup-stat b { color: #0f172a; }
.stat-filtered b { color: #1d4ed8; }
.chevron { font-size: 13px; color: #94a3b8; transition: transform .2s; display: inline-block; flex-shrink: 0; }
.chevron.open { transform: rotate(180deg); }

.grup-body { border-top: 1px solid #f1f5f9; }
.pt-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 20px 9px 28px; cursor: pointer; user-select: none; background: #fafbfc; transition: background .1s; }
.pt-row:hover { background: #f1f5f9; }
.pt-left { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
.pt-chevron { font-size: 11px; color: #94a3b8; transition: transform .15s; display: inline-block; width: 14px; }
.pt-chevron.open { transform: rotate(90deg); }
.pt-kode { font-size: 11.5px; font-weight: 700; color: #1d4ed8; background: #eff6ff; border-radius: 4px; padding: 1px 7px; white-space: nowrap; }
.pt-nama { font-size: 13.5px; font-weight: 600; color: #0f172a; }
.pt-kota { font-size: 12px; color: #94a3b8; }
.pt-right { flex-shrink: 0; }
.site-count-sm { font-size: 12px; color: #64748b; background: #f1f5f9; border-radius: 12px; padding: 2px 10px; }
.count-filtered { background: #eff6ff; color: #1d4ed8; font-weight: 600; }

.site-table-wrap { overflow-x: auto; border-top: 1px solid #f1f5f9; }
.site-table { width: 100%; border-collapse: collapse; min-width: 700px; }
.site-table th { padding: 7px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: left; text-transform: uppercase; letter-spacing: .04em; background: #fff; white-space: nowrap; }
.site-table td { padding: 9px 12px; font-size: 13px; color: #0f172a; border-top: 1px solid #f9fafb; }
.site-row { cursor: pointer; transition: background .1s; }
.site-row:hover td { background: #f0f4ff; }

.kode-cell { font-weight: 700; color: #1d4ed8; font-size: 12.5px; white-space: nowrap; cursor: pointer; padding: 2px 6px; border-radius: 4px; transition: background .1s; display: inline-block; }
.kode-cell:hover { background: #eff6ff; }
.kode-cell.copied { background: #f0fdf4 !important; color: #15803d !important; }
.nama-cell { font-weight: 500; }
.text-muted { color: #64748b; }
.text-sm { font-size: 12px; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.lay-badge { font-size: 12px; color: #0369a1; background: #f0f9ff; border-radius: 5px; padding: 2px 8px; white-space: nowrap; display: inline-block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.btn-edit-sm { padding: 4px 12px; background: #f1f5f9; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #334155; white-space: nowrap; }
.btn-edit-sm:hover { background: #e2e8f0; }

/* List view table */
.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 11px 14px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
td { padding: 11px 14px; font-size: 13px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.table-row { transition: background .1s; }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: #f0f4ff; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.pt-stack { display: flex; flex-direction: column; gap: 2px; }
.pt-nama-sm { font-size: 13px; font-weight: 500; color: #0f172a; }
.grup-badge-sm { background: #f0f9ff; color: #0369a1; font-size: 11.5px; border-radius: 4px; padding: 1px 7px; font-weight: 600; white-space: nowrap; display: inline-block; width: fit-content; }
.row-actions { display: flex; gap: 4px; }
.btn-hapus-sm { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; white-space: nowrap; }
.table-footer-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; gap: 8px; }
.page-info { font-size: 12px; color: #94a3b8; }

/* Empty / loading */
.loading-state { padding: 52px; text-align: center; color: #94a3b8; font-size: 14px; }
.loading-spinner { display: inline-block; animation: spin 1s linear infinite; font-size: 18px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.empty-state { text-align: center; padding: 48px 20px; }
.empty-icon { font-size: 36px; margin-bottom: 10px; }
.empty-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 5px; }
.empty-desc { font-size: 13px; color: #94a3b8; }
.btn-reset-lg { margin-top: 12px; padding: 8px 20px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; }

/* Highlight search match */
:deep(mark) { background: #fef08a; color: #713f12; border-radius: 2px; padding: 0 1px; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 0; width: 600px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.2); }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 22px 28px 16px; border-bottom: 1px solid #f1f5f9; }
.modal-head h3 { margin: 0; font-size: 17px; color: #0f172a; font-weight: 700; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; padding: 0 4px; }
.modal-close:hover { color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 20px 28px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 12.5px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; font-family: inherit; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px #3b82f615; }
.field input:disabled, .field select:disabled { background: #f1f5f9; color: #94a3b8; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 0 28px 4px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 28px 22px; border-top: 1px solid #f1f5f9; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 768px) {
  .page { padding: 14px 16px; }
  .form-grid { grid-template-columns: 1fr; padding: 16px; }
  .field.full { grid-column: 1; }
  .modal-head, .modal-actions, .form-error { padding-left: 16px; padding-right: 16px; }
  .filter-select { max-width: 140px; }
  .search-wrap { min-width: 160px; }
}
</style>
