<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { confirmDialog, alertDialog, promptDialog, alertError } from '@/composables/useDialog'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/master'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { fmtDateShort, escapeHtml } from '@/composables/useFormat'
import BasePagination from '@/components/BasePagination.vue'
import { useFilterUrl } from '@/composables/useFilterUrl'
import SiteFormModal from './SiteFormModal.vue'

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
// Filter & halaman disimpan di URL — tetap sama setelah kembali dari halaman detail
useFilterUrl({ q: search, pelanggan: filterPelanggan, layanan: filterLayanan, status: filterStatus, grup: filterGrup, page })
const viewMode = ref<'list' | 'grup'>('list') // tampilan per grup dihapus — grup jadi filter

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

const STATUS_SITE = ['Prospek', 'Aktif', 'Dismantle', 'Suspend']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Aktif:     { bg: '#f0fdf4', color: '#15803d' },
  Prospek:   { bg: '#eff6ff', color: '#1d4ed8' },
  Dismantle: { bg: '#fef2f2', color: '#dc2626' },
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
// Cari otomatis saat mengetik (tanpa tombol "Cari")
let tundaCari: ReturnType<typeof setTimeout> | undefined
watch(search, () => { clearTimeout(tundaCari); tundaCari = setTimeout(doSearch, 350) })

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

// ─── Layanan tersedia berdasarkan filter aktif ───────────────
const availableLayananList = computed(() => {
  // Jika tidak ada filter grup/pelanggan → tampil semua
  if (!filterGrup.value && !filterPelanggan.value && !grupSearch.value) return master.layananList
  let sites = master.siteAllList
  if (filterGrup.value) {
    if (filterGrup.value === -1) {
      const grupPtIds = new Set(master.grupList.flatMap(g => g.pelanggan?.map(p => p.id_pelanggan) ?? []))
      sites = sites.filter(s => !grupPtIds.has(s.id_pelanggan))
    } else {
      const grp = master.grupList.find(g => g.id_grup === filterGrup.value)
      const ptIds = new Set((grp?.pelanggan ?? []).map(p => p.id_pelanggan))
      sites = sites.filter(s => ptIds.has(s.id_pelanggan))
    }
  }
  if (filterPelanggan.value) {
    sites = sites.filter(s => s.id_pelanggan === filterPelanggan.value)
  }
  const used = new Set(sites.map(s => s.id_layanan).filter(Boolean))
  return master.layananList.filter(l => used.has(l.id_layanan))
})

// Reset filterLayanan jika layanan yg dipilih tidak ada di available list
watch(availableLayananList, (list) => {
  if (filterLayanan.value && !list.find(l => l.id_layanan === filterLayanan.value)) {
    filterLayanan.value = 0
  }
})

// Pelanggan tersedia berdasarkan grup yang dipilih
const availablePelangganList = computed(() => {
  if (!filterGrup.value) return master.pelangganDropdown
  if (filterGrup.value === -1) {
    const grupPtIds = new Set(master.grupList.flatMap(g => g.pelanggan?.map(p => p.id_pelanggan) ?? []))
    return master.pelangganDropdown.filter(p => !grupPtIds.has(p.id_pelanggan))
  }
  const grp = master.grupList.find(g => g.id_grup === filterGrup.value)
  const ptIds = new Set((grp?.pelanggan ?? []).map(p => p.id_pelanggan))
  return master.pelangganDropdown.filter(p => ptIds.has(p.id_pelanggan))
})

// Reset filterPelanggan jika tidak ada di grup baru
watch(filterGrup, () => {
  if (filterPelanggan.value && !availablePelangganList.value.find(p => p.id_pelanggan === filterPelanggan.value)) {
    filterPelanggan.value = 0
  }
})

// Layanan tersedia di grup view (berdasarkan grupSearch + filterStatus)
const availableLayananGrup = computed(() => {
  const used = new Set(filteredSiteAll.value.map(s => s.id_layanan).filter(Boolean))
  if (!grupSearch.value && !filterStatus.value) return master.layananList
  return master.layananList.filter(l => used.has(l.id_layanan))
})

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
    const c: Record<string, number> = { Prospek: 0, Aktif: 0, Dismantle: 0, Suspend: 0 }
    master.siteAllList.forEach(s => { if (c[s.status_site] !== undefined) c[s.status_site]++ })
    return c
  }
  const sc = master.siteMeta.status_counts
  if (sc && Object.values(sc).some(v => v > 0)) return sc
  const c: Record<string, number> = { Prospek: 0, Aktif: 0, Dismantle: 0, Suspend: 0 }
  master.siteList.forEach((s: any) => { if (c[s.status_site] !== undefined) c[s.status_site]++ })
  return c
})

const totalSiteAll = computed(() => master.siteAllList.length)
const hasActiveFilters = computed(() =>
  !!search.value || !!filterPelanggan.value || !!filterLayanan.value || !!filterStatus.value || !!filterGrup.value
)

// ─── Form ────────────────────────────────────────────────────
const editSite = ref<any | null>(null)
async function setelahSimpan() {
  showModal.value = false
  flash(editSite.value ? 'Site diperbarui' : 'Site ditambahkan')
  fetchData(); master.fetchSiteAll()
}
function openAdd() {
  editSite.value = null
  editId.value = 0
  form.value = { id_pelanggan: filterPelanggan.value || 0, id_layanan: 0, kode_site: '', nama_site: '', alamat_lengkap: '', kota: '', provinsi: '', koordinat_gps: '', status_site: 'Aktif', tgl_aktif: '', catatan: '' }
  formError.value = ''; showModal.value = true
}
function openEdit(s: any) {
  editSite.value = s
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
  if (!(await confirmDialog({ title: 'Hapus Site?', message: 'Hapus site ' + site.nama_site + '?', variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  try {
    await api.delete('/master/site/' + site.id_site)
    master.siteList = master.siteList.filter((s: any) => s.id_site !== site.id_site)
    master.siteAllList = master.siteAllList.filter((s: any) => s.id_site !== site.id_site)
    flash('Site dihapus')
  } catch (e: any) {
    const msg = e.response?.data?.message || 'Gagal menghapus site'
    if (e.response?.status === 400 && String(msg).includes('force delete')) {
      const canForce = auth.hasRole('Admin') || auth.hasRole('Director')
      if (!canForce) { await alertDialog({ title: 'Tidak Dapat Menghapus', message: msg + '\n\nHubungi Admin untuk force delete.', variant: 'warning' }); return }
      const ketik = await promptDialog({
        title: 'Force Delete Site',
        message:
          `PERINGATAN — Site "${site.nama_site}" masih punya tiket/project/kontrak/invoice.\n\n` +
          `Force delete akan MENGHAPUS PERMANEN site beserta SEMUA data terkait.\n\n` +
          `Ketik kode site "${site.kode_site}" untuk konfirmasi.`,
        label: 'Ketik kode site untuk konfirmasi',
        placeholder: site.kode_site,
        requireText: site.kode_site,
        variant: 'danger',
        confirmLabel: 'Hapus Permanen',
      })
      if (ketik === null) return
      if (ketik.trim() !== site.kode_site) { await alertDialog({ title: 'Dibatalkan', message: 'Kode site tidak cocok — dibatalkan.', variant: 'warning' }); return }
      try {
        const r = await api.delete('/master/site/' + site.id_site + '?force=true')
        master.siteList = master.siteList.filter((s: any) => s.id_site !== site.id_site)
        master.siteAllList = master.siteAllList.filter((s: any) => s.id_site !== site.id_site)
        flash(r.data?.message || 'Site + semua data terkait dihapus')
      } catch (e2: any) { await alertError(e2, 'Force delete gagal') }
      return
    }
    await alertDialog({ message: msg, variant: 'danger' })
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
      // Field opsional yang dikosongkan dikirim null supaya benar-benar terhapus.
      for (const k of ['kota', 'provinsi', 'koordinat_gps', 'tgl_aktif', 'catatan'] as const) {
        if (!form.value[k]) payload[k] = null
      }
      delete payload.id_pelanggan; delete payload.kode_site
      await master.updateSite(editId.value, payload)
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

// ─── HERE Maps Autosuggest ────────────────────────────────────
const HERE_KEY = import.meta.env.VITE_HERE_API_KEY

function hereCleanName(title: string): string {
  const m = title.match(/^[^(]+\((.+)\)\s*$/)
  return m ? m[1]! : title
}

const mapQuery = ref('')
const mapResults = ref<any[]>([])
const mapLoading = ref(false)
const mapShowDropdown = ref(false)
let mapDebounceTimer: ReturnType<typeof setTimeout> | null = null

async function searchHere() {
  const q = mapQuery.value.trim()
  if (q.length < 2) { mapResults.value = []; mapShowDropdown.value = false; return }
  mapLoading.value = true
  try {
    const url = new URL('https://autosuggest.search.hereapi.com/v1/autosuggest')
    url.searchParams.set('q', q)
    url.searchParams.set('at', '-6.2,106.8')
    url.searchParams.set('limit', '6')
    url.searchParams.set('apiKey', HERE_KEY)
    const res = await fetch(url.toString())
    const data = await res.json()
    mapResults.value = (data.items || [])
      .filter((item: any) => item.position)
      .map((item: any) => ({
        name: hereCleanName(item.title),
        address: item.address?.label || '',
        city: item.address?.city || item.address?.district || '',
        province: item.address?.state || '',
        lat: item.position?.lat,
        lng: item.position?.lng,
      }))
    mapShowDropdown.value = mapResults.value.length > 0
  } catch {
    mapResults.value = []
  } finally {
    mapLoading.value = false
  }
}

function onMapInput() {
  if (mapDebounceTimer) clearTimeout(mapDebounceTimer)
  mapDebounceTimer = setTimeout(searchHere, 350)
}

onUnmounted(() => {
  if (mapDebounceTimer) clearTimeout(mapDebounceTimer)
})

function selectMapResult(r: any) {
  form.value.nama_site = r.name || ''
  form.value.alamat_lengkap = r.address || ''
  form.value.kota = r.city || ''
  form.value.provinsi = r.province || ''
  if (r.lat != null) {
    form.value.koordinat_gps = `${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`
  }
  mapQuery.value = r.name || ''
  mapShowDropdown.value = false
}

function hideMapDropdown() {
  setTimeout(() => { mapShowDropdown.value = false }, 200)
}

function openSync(s: any) {
  openEdit(s)
  mapQuery.value = s.nama_site || ''
}

watch(showModal, (val) => {
  if (!val) { mapQuery.value = ''; mapResults.value = []; mapShowDropdown.value = false }
})

// Highlight match dalam text
function highlight(text: string, q: string) {
  if (!q || !text) return escapeHtml(text)
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return escapeHtml(text)
  return escapeHtml(text.slice(0, idx)) + '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' + escapeHtml(text.slice(idx + q.length))
}
</script>

<template>
  <div class="page st">
    <!-- ─── Kepala ─── -->
    <div class="st-kepala">
      <div>
        <h2>📍 Site Pelanggan</h2>
        <p class="sub">Lokasi pemasangan layanan. Klik baris untuk melihat detail, perangkat, PIC, dan tiket site.</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openAdd">+ Tambah Site</button>
    </div>

    <!-- ─── Pencarian besar ─── -->
    <div class="st-cari">
      <span aria-hidden="true">🔎</span>
      <input v-model="search" type="search" placeholder="Ketik nama site, kode, kota, atau nama pelanggan…" aria-label="Cari site"
        @keydown.escape="search = ''" />
      <button v-if="search" type="button" class="st-x" aria-label="Hapus pencarian" @click="search = ''">✕</button>
    </div>

    <!-- ─── Status (tab) ─── -->
    <div class="st-tab" role="tablist" aria-label="Status site">
      <button type="button" role="tab" :aria-selected="!filterStatus" :class="{ on: !filterStatus }" @click="filterStatus = ''; doSearch()">
        Semua <b>{{ Object.values(statusSummary).reduce((a, b) => a + (b || 0), 0).toLocaleString('id') }}</b>
      </button>
      <button v-for="st in ['Aktif', 'Prospek', 'Suspend', 'Dismantle']" :key="st" type="button" role="tab"
        :aria-selected="filterStatus === st" :class="['st-' + st.toLowerCase(), { on: filterStatus === st }]"
        @click="filterStatus = st; doSearch()">
        <i class="titik" /> {{ st }} <b>{{ (statusSummary[st] ?? 0).toLocaleString('id') }}</b>
      </button>
    </div>

    <!-- ─── Filter tambahan (opsional) ─── -->
    <div class="st-filter">
      <label>Grup
        <select v-model="filterGrup" @change="doSearch">
          <option :value="0">Semua grup</option>
          <option v-for="g in master.grupList" :key="g.id_grup" :value="g.id_grup">{{ g.nama_grup }}</option>
          <option :value="-1">Tanpa grup</option>
        </select>
      </label>
      <label>Pelanggan
        <select v-model="filterPelanggan" @change="doSearch">
          <option :value="0">Semua pelanggan</option>
          <option v-for="p in availablePelangganList" :key="p.id_pelanggan" :value="p.id_pelanggan">{{ p.nama_pelanggan }}</option>
        </select>
      </label>
      <label>Layanan
        <select v-model="filterLayanan" @change="doSearch">
          <option :value="0">Semua layanan</option>
          <option v-for="l in availableLayananList" :key="l.id_layanan" :value="l.id_layanan">{{ l.nama_layanan }}</option>
        </select>
      </label>
      <button v-if="hasActiveFilters" type="button" class="st-reset" @click="resetFilters">✕ Hapus semua filter</button>
      <span class="st-total"><b>{{ (master.siteMeta.total ?? 0).toLocaleString('id') }}</b> site{{ hasActiveFilters ? ' cocok' : '' }}</span>
    </div>

    <div v-if="successMsg" class="alert alert-success">✓ {{ successMsg }}</div>
    <div v-if="master.error" class="alert alert-danger">{{ master.error }} <button type="button" class="st-link" @click="fetchData">Coba lagi</button></div>

    <!-- ─── Daftar ─── -->
    <div class="st-daftar">
      <div v-if="master.siteLoading && !master.siteList.length" class="st-kosong">Memuat site…</div>
      <div v-else-if="!master.siteList.length" class="st-kosong">
        <span class="st-maskot">📍</span>
        <b>Tidak ada site yang cocok</b>
        <small>Coba kata lain atau hapus filter.</small>
        <button v-if="hasActiveFilters" type="button" class="btn btn-ghost" @click="resetFilters">Hapus semua filter</button>
      </div>
      <div v-for="s in master.siteList" :key="s.id_site" v-baris class="st-baris" :class="{ redup: master.siteLoading }"
        @click="router.push('/master/site/' + s.id_site)">
        <span :class="['st-status', 'st-' + s.status_site.toLowerCase()]" :title="s.status_site" />
        <div class="st-utama">
          <div class="st-nama"><span v-html="highlight(s.nama_site, search)" /></div>
          <div class="st-info">
            <span class="kode" :class="{ copied: copiedKode === s.kode_site }" :title="copiedKode === s.kode_site ? 'Tersalin!' : 'Klik untuk menyalin kode'"
              @click.stop="copyKode(s.kode_site, $event)">{{ copiedKode === s.kode_site ? '✓ tersalin' : s.kode_site }}</span>
            <span v-if="s.kota">📍 {{ s.kota }}</span>
            <span v-if="s.layanan?.nama_layanan" class="lay">{{ s.layanan.nama_layanan }}</span>
          </div>
        </div>
        <div class="st-pel">
          <span class="pt" v-html="highlight(s.pelanggan?.nama_pelanggan || '—', search)" />
          <span v-if="s.pelanggan?.grup" class="grup">{{ s.pelanggan.grup.nama_grup }}</span>
        </div>
        <span :class="['st-lencana', 'st-' + s.status_site.toLowerCase()]">{{ s.status_site }}</span>
        <div class="st-aksi" @click.stop>
          <button type="button" title="Edit site" aria-label="Edit site" @click="openEdit(s)">✏️</button>
          <button type="button" title="Cari lokasi di peta" aria-label="Cari lokasi di peta" @click="openSync(s)">🗺️</button>
          <button type="button" class="hapus" title="Hapus site" aria-label="Hapus site" @click="hapusSite(s)">🗑️</button>
        </div>
        <span class="st-panah" aria-hidden="true">›</span>
      </div>
    </div>
    <div class="st-kaki">
      <BasePagination :page="page" :total-pages="master.siteMeta.total_pages" @change="goPage" />
      <label class="st-ukuran">Per halaman
        <select v-model="pageSize"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select>
      </label>
    </div>

    <!-- ─── Form tambah / ubah site ─── -->
    <SiteFormModal v-if="showModal" :site="editSite" :id-pelanggan-awal="filterPelanggan || undefined"
      @tutup="showModal = false" @tersimpan="setelahSimpan" />
  </div>
</template>

<style scoped>
/* ── Tata letak baru: kepala · cari · status · filter · daftar ── */
.st-kepala { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.st-kepala h2 { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
.st-kepala .sub { margin: 4px 0 0; font-size: 13px; color: #64748b; }
.st-cari { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 16px; border-radius: 14px; background: #fff; border: 2px solid #e2e8f0; margin-bottom: 12px; transition: border-color .15s, box-shadow .15s; }
.st-cari:focus-within { border-color: #2a78d6; box-shadow: 0 0 0 4px #dbeafe; }
.st-cari input { flex: 1; min-width: 0; border: 0; outline: none; background: none; font: inherit; font-size: 15px; }
.st-x { border: 0; background: #f1f5f9; border-radius: 99px; width: 26px; height: 26px; cursor: pointer; color: #64748b; }
.st-tab { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.st-tab button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 99px; border: 1px solid #e2e8f0; background: #fff; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; transition: all .15s; }
.st-tab button b { font-variant-numeric: tabular-nums; color: #0f172a; }
.st-tab button.on { background: #0f172a; border-color: #0f172a; color: #fff; }
.st-tab button.on b { color: #fff; }
.titik { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; display: inline-block; }
.st-aktif .titik, .st-status.st-aktif { background: #0ca30c; }
.st-prospek .titik, .st-status.st-prospek { background: #2a78d6; }
.st-suspend .titik, .st-status.st-suspend { background: #eda100; }
.st-dismantle .titik, .st-status.st-dismantle { background: #d03b3b; }
.st-filter { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 12px; border-radius: 14px; background: #f8fafc; border: 1px solid #eef2f7; }
.st-filter label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
.st-filter select { min-width: 170px; max-width: 240px; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; color: #0f172a; }
.st-reset { border: 0; background: none; color: #b91c1c; font-weight: 700; font-size: 12.5px; cursor: pointer; padding: 8px 4px; }
.st-total { margin-left: auto; font-size: 13px; color: #64748b; padding-bottom: 7px; }
.st-total b { color: #0f172a; }
.st-link { border: 0; background: none; color: #1d4ed8; font-weight: 700; cursor: pointer; }
.st-daftar { display: flex; flex-direction: column; gap: 6px; }
.st-baris { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 14px; background: #fff; border: 1px solid #eef0f3; cursor: pointer; transition: transform .12s, box-shadow .12s, border-color .12s; }
.st-baris:hover { border-color: #c7dbf7; box-shadow: 0 6px 18px rgba(15, 23, 42, .06); transform: translateY(-1px); }
.st-baris.redup { opacity: .55; }
.st-status { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; background: #94a3b8; }
.st-utama { flex: 1.4; min-width: 0; }
.st-nama { font-size: 14.5px; font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-nama :deep(mark), .st-pel :deep(mark) { background: #fef08a; border-radius: 3px; padding: 0 1px; }
.st-info { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 3px; font-size: 12px; color: #64748b; }
.st-info .kode { font-family: ui-monospace, monospace; font-size: 11.5px; padding: 1px 7px; border-radius: 6px; background: #f1f5f9; color: #334155; cursor: copy; }
.st-info .kode.copied { background: #dcfce7; color: #15803d; }
.st-info .lay { padding: 1px 8px; border-radius: 99px; background: #eef5ff; color: #1c4f9c; font-weight: 600; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-pel { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.st-pel .pt { font-size: 13px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-pel .grup { align-self: flex-start; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: #f3effd; color: #4b3cb8; }
.st-lencana { flex-shrink: 0; width: 86px; text-align: center; font-size: 11.5px; font-weight: 700; padding: 3px 0; border-radius: 99px; background: #f1f5f9; color: #475569; }
.st-lencana.st-aktif { background: #dcfce7; color: #15803d; }
.st-lencana.st-prospek { background: #dbeafe; color: #1d4ed8; }
.st-lencana.st-suspend { background: #fef3c7; color: #92400e; }
.st-lencana.st-dismantle { background: #fee2e2; color: #b91c1c; }
.st-aksi { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.st-baris:hover .st-aksi, .st-baris:focus-within .st-aksi { opacity: 1; }
.st-aksi button { width: 32px; height: 32px; border: 0; border-radius: 9px; background: none; cursor: pointer; font-size: 14px; }
.st-aksi button:hover { background: #f1f5f9; }
.st-aksi button.hapus:hover { background: #fee2e2; }
.st-panah { font-size: 22px; color: #cbd5e1; }
.st-kosong { padding: 40px 16px; text-align: center; color: #64748b; display: flex; flex-direction: column; align-items: center; gap: 6px; background: #fff; border-radius: 14px; border: 1px dashed #e2e8f0; }
.st-maskot { font-size: 34px; }
.st-kaki { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.st-ukuran { font-size: 12.5px; color: #64748b; display: flex; align-items: center; gap: 6px; }
.st-ukuran select { padding: 4px 8px; border-radius: 8px; border: 1px solid #e2e8f0; }
@media (max-width: 900px) { .st-pel { display: none; } .st-aksi { opacity: 1; } }
@media (max-width: 640px) { .st-lencana { display: none; } .st-aksi { display: none; } .st-filter select { min-width: 0; width: 100%; max-width: none; } .st-filter label { flex: 1 1 140px; } .st-total { margin-left: 0; } }

.page-header { align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0 0 3px; font-size: 20px; color: var(--text-1); font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: var(--text-3); }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.view-toggle { display: flex; background: var(--border-light); border: 1px solid var(--border); border-radius: var(--r); padding: 3px; gap: 2px; }
.toggle-btn { padding: 6px 16px; border: none; background: none; border-radius: var(--r-sm); font-size: 13px; font-weight: 500; color: var(--text-3); cursor: pointer; transition: all .15s; }
.toggle-btn.active { background: var(--surface); color: var(--primary); font-weight: 700; box-shadow: var(--shadow-sm); }
.btn:disabled { opacity: .55; cursor: not-allowed; transform: none; box-shadow: none; }
.alert { margin-bottom: 12px; }

/* Status bar */
.status-bar { margin-bottom: 16px; }
.status-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chip { padding: 5px 13px; border-radius: 20px; font-size: 12.5px; font-weight: 500; border: 1px solid transparent; cursor: pointer; transition: all .15s; user-select: none; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.chip:hover { filter: brightness(.94); }
.chip b { font-size: 13px; }


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
.grup-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--shadow-sm); overflow: hidden; margin-bottom: 8px; }
.grup-card.standalone { opacity: .85; }
.grup-header { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; border-left: 4px solid #1d4ed8; cursor: pointer; user-select: none; gap: 12px; transition: background .1s; min-height: 48px; }
.grup-header:hover { background: #f8fafc; }
.grup-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow: hidden; }
.grup-kode { font-size: 11px; font-weight: 700; background: #f1f5f9; border-radius: 5px; padding: 2px 7px; white-space: nowrap; flex-shrink: 0; }
.grup-nama { font-size: 14px; font-weight: 700; color: var(--text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 1; }
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
.btn-sync-sm { padding: 4px 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; cursor: pointer; white-space: nowrap; line-height: 1; }
.btn-sync-sm:hover { background: #dcfce7; border-color: #86efac; }

/* List view table */
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
.loading-spinner { display: inline-block; animation: spin 1s linear infinite; font-size: 18px; }
.btn-reset-lg { margin-top: 12px; padding: 8px 20px; background: var(--border-light); border: 1px solid var(--border); border-radius: var(--r); font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-2); }

/* Highlight search match */
:deep(mark) { background: #fef08a; color: #713f12; border-radius: 2px; padding: 0 1px; }

/* Modal */
.modal-site { max-width: 600px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 20px 22px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 12.5px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; font-family: inherit; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px #3b82f615; }
.field input:disabled, .field select:disabled { background: #f1f5f9; color: #94a3b8; }
.gmaps-field { border: 1px dashed #93c5fd; border-radius: 10px; padding: 10px 14px; background: #eff6ff; }
.gmaps-hint { font-size: 11.5px; color: #3b82f6; margin-top: 4px; display: block; }
.osm-wrap { position: relative; width: 100%; }
.osm-input { width: 100%; box-sizing: border-box; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 32px 8px 12px; font-size: 14px; background: #fff; }
.osm-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px #3b82f620; }
.osm-spin { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; }
.osm-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.12); list-style: none; margin: 0; padding: 4px 0; z-index: 9999; max-height: 240px; overflow-y: auto; }
.osm-dropdown li { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
.osm-dropdown li:last-child { border-bottom: none; }
.osm-dropdown li:hover { background: #eff6ff; }
.osm-name { display: block; font-weight: 600; font-size: 13px; color: #1e40af; }
.osm-addr { display: block; font-size: 11px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.form-error-box { background: var(--danger-light); border: 1px solid #fecaca; border-radius: var(--r); color: var(--danger); font-size: 13px; padding: 8px 12px; margin: 0 22px 12px; }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; padding: 16px; }
  .field.full { grid-column: 1; }
  .form-error-box { margin-left: 16px; margin-right: 16px; }
  .filter-select { max-width: none; flex: 1 1 140px; }
  .search-wrap { min-width: 0; max-width: none; flex: 1 1 100%; }
  .grup-desc, .pt-kota { display: none; }
  .grup-header { padding: 10px 12px; }
  .pt-row { padding: 9px 12px 9px 16px; }
  .row-actions { flex-wrap: nowrap; }
}
</style>
