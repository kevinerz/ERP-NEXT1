<script setup lang="ts">
// Halaman SEMENTARA tanpa login — rekonsiliasi nama device PRTG ↔ site ERP.
// Backend: /api/prtg-rekon (aktif hanya bila PRTG_REKON_ENABLED=true).
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { confirmDialog } from '@/composables/useDialog'

// Axios polos: halaman publik, tidak boleh ikut alur refresh/redirect login
// Token rekon dibaca dari ?token=... lalu disimpan di sessionStorage (dibuang dari URL)
function ambilToken(): string {
  try {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('token')
    if (t) {
      sessionStorage.setItem('rekon_token', t)
      url.searchParams.delete('token')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    return sessionStorage.getItem('rekon_token') ?? ''
  } catch {
    return ''
  }
}
const http = axios.create({ baseURL: '/api/prtg-rekon', headers: { 'X-Rekon-Token': ambilToken() } })

interface Site {
  id_site: number; kode_site: string; nama_site: string
  kota: string | null; provinsi: string | null; alamat_lengkap: string
  koordinat_gps: string | null; status_site: string
  pelanggan: { nama_pelanggan: string } | null
}
interface Rekon {
  nama_baru: string | null; id_site: number | null
  kota: string | null; provinsi: string | null; alamat_lengkap: string | null
  koordinat_gps: string | null; catatan: string | null
  is_done: boolean; applied_at: string | null; device_name_awal: string
}
interface Row {
  objid: number; device_name: string; ip_address: string | null; prtg_status: string
  comments: string | null; parsed_sn: string | null; parsed_ip: string | null
  match_source: 'manual' | 'auto' | null; match_score: number | null
  site: Site | null; rekon: Rekon | null
}
interface Form {
  nama_baru: string; site: Site | null
  kota: string; provinsi: string; alamat_lengkap: string; koordinat_gps: string; catatan: string
  open: boolean; busy: boolean; msg: string; err: boolean
  siteQ: string; siteHasil: Site[]; sitePicker: boolean
}

const rows = ref<Row[]>([])
const forms = reactive<Record<number, Form>>({})
const loading = ref(true)
const loadErr = ref('')
const cacheInfo = ref('')
const q = ref('')
const filter = ref<'semua' | 'belum' | 'selesai' | 'beda' | 'nomatch'>('belum')
const batas = ref(40)

function errMsg(e: any): string {
  const m = e?.response?.data?.message
  if (e?.response?.status === 404) return 'Halaman rekonsiliasi sedang dimatikan.'
  if (e?.response?.status === 401) return 'Token salah atau belum ada. Buka lewat link yang memuat ?token=...'
  return Array.isArray(m) ? m.join(', ') : m || e?.message || 'Gagal'
}

function initForm(r: Row): Form {
  const k = r.rekon
  const s = r.site
  return {
    nama_baru: k?.nama_baru ?? s?.nama_site ?? r.device_name,
    site: s,
    kota: k?.kota ?? s?.kota ?? '',
    provinsi: k?.provinsi ?? s?.provinsi ?? '',
    alamat_lengkap: k?.alamat_lengkap ?? s?.alamat_lengkap ?? '',
    koordinat_gps: k?.koordinat_gps ?? s?.koordinat_gps ?? '',
    catatan: k?.catatan ?? '',
    open: false, busy: false, msg: '', err: false,
    siteQ: '', siteHasil: [], sitePicker: false,
  }
}

async function load(refresh = false) {
  loading.value = true
  loadErr.value = ''
  try {
    const { data } = await http.get('', { params: refresh ? { refresh: 1 } : {} })
    cacheInfo.value = data.dari_cache ? `Dari cache (${new Date(data.cached_at).toLocaleTimeString('id-ID')})` : ''
    rows.value = data.data as Row[]
    for (const r of rows.value) forms[r.objid] = initForm(r)
  } catch (e) {
    loadErr.value = errMsg(e)
  } finally {
    loading.value = false
  }
}
// Dropdown pilih site tertutup saat klik di luar atau tekan Esc
function klikLuar(e: MouseEvent) {
  const el = e.target as HTMLElement | null
  if (!el?.closest('.rk-picker, .rk-pick-btn')) tutupSemuaPicker()
}
function tekanKey(e: KeyboardEvent) { if (e.key === 'Escape') tutupSemuaPicker() }
onMounted(() => {
  load()
  document.addEventListener('click', klikLuar)
  document.addEventListener('keydown', tekanKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', klikLuar)
  document.removeEventListener('keydown', tekanKey)
})

// Form per baris selalu diisi di load() — helper ini hanya mempersempit tipe
const fm = (r: Row): Form => forms[r.objid]!

const isDone = (r: Row) => !!r.rekon?.is_done
const beda = (r: Row) => !r.site || r.site.nama_site.trim().toLowerCase() !== r.device_name.trim().toLowerCase()

const stats = computed(() => {
  const all = rows.value
  return {
    total: all.length,
    selesai: all.filter(isDone).length,
    applied: all.filter((r) => r.rekon?.applied_at).length,
    beda: all.filter((r) => r.site && beda(r)).length,
    nomatch: all.filter((r) => !r.site).length,
  }
})
const persen = computed(() => (stats.value.total ? Math.round((stats.value.selesai / stats.value.total) * 100) : 0))

const tersaring = computed(() => {
  const kata = q.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (filter.value === 'belum' && isDone(r)) return false
    if (filter.value === 'selesai' && !isDone(r)) return false
    if (filter.value === 'beda' && !(r.site && beda(r))) return false
    if (filter.value === 'nomatch' && r.site) return false
    if (!kata) return true
    return [r.device_name, r.ip_address, r.site?.nama_site, r.site?.kode_site, r.site?.pelanggan?.nama_pelanggan, forms[r.objid]?.nama_baru]
      .some((v) => v && v.toLowerCase().includes(kata))
  })
})
const tampil = computed(() => tersaring.value.slice(0, batas.value))

function payload(r: Row) {
  const f = fm(r)
  return {
    device_name: r.device_name,
    nama_baru: f.nama_baru.trim(),
    id_site: f.site?.id_site ?? null,
    kota: f.kota.trim(), provinsi: f.provinsi.trim(),
    alamat_lengkap: f.alamat_lengkap.trim(), koordinat_gps: f.koordinat_gps.trim(),
    catatan: f.catatan.trim(),
  }
}

function flash(f: Form, msg: string, err = false) {
  f.msg = msg
  f.err = err
  setTimeout(() => { if (f.msg === msg) f.msg = '' }, 4000)
}

async function simpan(r: Row) {
  const f = fm(r)
  f.busy = true
  try {
    const { data } = await http.patch(`/${r.objid}`, payload(r))
    r.rekon = data.data
    flash(f, 'Draft tersimpan')
  } catch (e) { flash(f, errMsg(e), true) } finally { f.busy = false }
}

async function apply(r: Row) {
  const f = fm(r)
  if (!f.site) return flash(f, 'Pilih site ERP dulu', true)
  if (!f.nama_baru.trim()) return flash(f, 'Nama baru wajib diisi', true)
  const ok = await confirmDialog({
    title: 'Terapkan ke ERP & PRTG?',
    message: `PRTG: ${r.device_name}\nERP: ${f.site.nama_site}\n\nNama baru: ${f.nama_baru.trim()}`,
    confirmLabel: 'Apply',
    variant: 'warning',
  })
  if (!ok) return
  f.busy = true
  try {
    const { data } = await http.post(`/${r.objid}/apply`, payload(r))
    const nama = f.nama_baru.trim()
    r.rekon = data.data
    r.device_name = nama
    r.match_source = 'manual'
    r.match_score = 100
    r.site = { ...f.site, nama_site: nama, kota: f.kota || f.site.kota, provinsi: f.provinsi || f.site.provinsi,
      alamat_lengkap: f.alamat_lengkap || f.site.alamat_lengkap, koordinat_gps: f.koordinat_gps || f.site.koordinat_gps }
    f.site = r.site
    flash(f, 'Berhasil — ERP & PRTG sudah sama')
  } catch (e) { flash(f, errMsg(e), true) } finally { f.busy = false }
}

async function toggleDone(r: Row) {
  const f = fm(r)
  f.busy = true
  try {
    const { data } = await http.patch(`/${r.objid}/done`, { done: !isDone(r), device_name: r.device_name })
    r.rekon = data.data
  } catch (e) { flash(f, errMsg(e), true) } finally { f.busy = false }
}

let siteTimer: ReturnType<typeof setTimeout> | undefined
function cariSite(f: Form) {
  clearTimeout(siteTimer)
  siteTimer = setTimeout(async () => {
    try {
      const { data } = await http.get('/sites', { params: { q: f.siteQ } })
      f.siteHasil = data.data
    } catch { f.siteHasil = [] }
  }, 300)
}
function tutupSemuaPicker(kecuali?: Form) {
  for (const k of Object.values(forms)) if (k !== kecuali) k.sitePicker = false
}
function bukaPicker(f: Form) {
  tutupSemuaPicker(f)
  f.sitePicker = !f.sitePicker
  if (f.sitePicker) { f.siteQ = ''; cariSite(f) }
}
function pilihSite(f: Form, s: Site) {
  f.site = s
  f.sitePicker = false
  f.nama_baru = s.nama_site
  f.kota = s.kota ?? ''
  f.provinsi = s.provinsi ?? ''
  f.alamat_lengkap = s.alamat_lengkap ?? ''
  f.koordinat_gps = s.koordinat_gps ?? ''
}

const statusKelas = (s: string) => {
  const v = s.toLowerCase()
  if (v.includes('down')) return 'st-down'
  if (v.includes('warn')) return 'st-warn'
  if (v.includes('up')) return 'st-up'
  return 'st-other'
}
</script>

<template>
  <div class="rk-page">
    <header class="rk-head">
      <div class="rk-head-inner">
        <div class="rk-title">
          <h1>Rekonsiliasi Nama PRTG ↔ Site ERP</h1>
          <p>Samakan nama device PRTG dengan data site ERP. <b>Apply</b> mengubah nama di ERP <i>dan</i> PRTG sekaligus.</p>
        </div>
        <div class="rk-progress" v-if="!loading && !loadErr">
          <div class="rk-progress-num"><b>{{ stats.selesai }}</b> / {{ stats.total }} selesai · {{ persen }}%</div>
          <div class="rk-bar"><div class="rk-bar-fill" :style="{ width: persen + '%' }"></div></div>
        </div>
      </div>

      <div class="rk-tools" v-if="!loading && !loadErr">
        <input v-model="q" class="rk-search" type="search" placeholder="Cari device, IP, site, kode, pelanggan…" @input="batas = 40" />
        <div class="rk-chips">
          <button :class="{ on: filter === 'belum' }" @click="filter = 'belum'; batas = 40">Belum <span>{{ stats.total - stats.selesai }}</span></button>
          <button :class="{ on: filter === 'beda' }" @click="filter = 'beda'; batas = 40">Nama beda <span>{{ stats.beda }}</span></button>
          <button :class="{ on: filter === 'nomatch' }" @click="filter = 'nomatch'; batas = 40">Belum ada site <span>{{ stats.nomatch }}</span></button>
          <button :class="{ on: filter === 'selesai' }" @click="filter = 'selesai'; batas = 40">Selesai <span>{{ stats.selesai }}</span></button>
          <button :class="{ on: filter === 'semua' }" @click="filter = 'semua'; batas = 40">Semua <span>{{ stats.total }}</span></button>
          <button class="rk-reload" @click="load(true)" :title="cacheInfo ? cacheInfo + ' — klik untuk ambil ulang dari PRTG' : 'Ambil ulang dari PRTG'">⟳</button>
        </div>
      </div>
    </header>

    <main class="rk-main">
      <div v-if="loading" class="rk-state">
        <div class="rk-spin"></div>
        <p>Mengambil data dari PRTG & ERP… (bisa ±30 detik)</p>
      </div>
      <div v-else-if="loadErr" class="rk-state err">
        <p>{{ loadErr }}</p>
        <button class="btn" @click="load(true)">Coba lagi</button>
      </div>
      <template v-else>
        <p v-if="!tersaring.length" class="rk-state">Tidak ada data untuk filter ini 🎉</p>

        <article
          v-for="r in tampil" :key="r.objid"
          class="rk-card" :class="{ done: isDone(r) }"
        >
          <!-- Kolom 1: PRTG -->
          <section class="rk-col">
            <div class="rk-label">PRTG <span class="rk-obj">#{{ r.objid }}</span></div>
            <div class="rk-name">{{ r.device_name }}</div>
            <div class="rk-meta">
              <span class="pill" :class="statusKelas(r.prtg_status)">{{ r.prtg_status }}</span>
              <span v-if="r.ip_address" class="mono">{{ r.ip_address }}</span>
              <span v-if="r.parsed_sn" class="mono">SN {{ r.parsed_sn }}</span>
            </div>
            <p v-if="r.comments" class="rk-comment" :title="r.comments">{{ r.comments }}</p>
          </section>

          <!-- Kolom 2: ERP -->
          <section class="rk-col">
            <div class="rk-label">
              Site ERP
              <span v-if="r.match_source === 'manual'" class="pill p-ok">mapping</span>
              <span v-else-if="r.match_source === 'auto'" class="pill p-warn">tebakan {{ r.match_score }}%</span>
            </div>
            <template v-if="fm(r).site">
              <div class="rk-name">{{ fm(r).site!.nama_site }}</div>
              <div class="rk-meta">
                <span class="mono">{{ fm(r).site!.kode_site }}</span>
                <span>{{ fm(r).site!.pelanggan?.nama_pelanggan }}</span>
                <span v-if="fm(r).site!.kota">{{ fm(r).site!.kota }}</span>
                <span class="pill p-grey">{{ fm(r).site!.status_site }}</span>
              </div>
            </template>
            <div v-else class="rk-empty">Belum terhubung ke site</div>
            <button class="btn-link rk-pick-btn" @click="bukaPicker(fm(r))">
              {{ fm(r).site ? 'Ganti site' : 'Pilih site' }} ▾
            </button>
            <div v-if="fm(r).sitePicker" class="rk-picker">
              <input v-model="fm(r).siteQ" placeholder="Cari nama / kode site…" @input="cariSite(fm(r))" />
              <ul>
                <li v-for="s in fm(r).siteHasil" :key="s.id_site" @click="pilihSite(fm(r), s)">
                  <b>{{ s.nama_site }}</b>
                  <small>{{ s.kode_site }} · {{ s.pelanggan?.nama_pelanggan }} · {{ s.status_site }}</small>
                </li>
                <li v-if="!fm(r).siteHasil.length" class="muted">Tidak ada hasil</li>
              </ul>
            </div>
          </section>

          <!-- Kolom 3: Revisi -->
          <section class="rk-col rk-fix">
            <div class="rk-label">
              Nama baru (fix)
              <span v-if="r.rekon?.applied_at" class="pill p-ok">✓ diterapkan</span>
              <span v-else-if="r.site && !beda(r)" class="pill p-ok">sudah sama</span>
              <span v-else class="pill p-warn">beda</span>
            </div>
            <input v-model="fm(r).nama_baru" class="rk-input" maxlength="150" />

            <button class="btn-link" @click="fm(r).open = !fm(r).open">
              Atribut lain {{ fm(r).open ? '▴' : '▾' }}
            </button>
            <div v-if="fm(r).open" class="rk-attrs">
              <label>Kota<input v-model="fm(r).kota" maxlength="100" /></label>
              <label>Provinsi<input v-model="fm(r).provinsi" maxlength="100" /></label>
              <label class="full">Alamat<textarea v-model="fm(r).alamat_lengkap" rows="2"></textarea></label>
              <label>Koordinat GPS<input v-model="fm(r).koordinat_gps" maxlength="50" placeholder="-6.2,106.8" /></label>
              <label>Catatan<input v-model="fm(r).catatan" /></label>
            </div>

            <div class="rk-actions">
              <button class="btn" :disabled="fm(r).busy" @click="simpan(r)">Simpan</button>
              <button class="btn btn-primary" :disabled="fm(r).busy" @click="apply(r)">Apply ERP + PRTG</button>
              <label class="rk-check" :class="{ on: isDone(r) }">
                <input type="checkbox" :checked="isDone(r)" :disabled="fm(r).busy" @change="toggleDone(r)" />
                <span>{{ isDone(r) ? 'Selesai' : 'Tandai selesai' }}</span>
              </label>
            </div>
            <p v-if="fm(r).msg" class="rk-msg" :class="{ err: fm(r).err }">{{ fm(r).msg }}</p>
          </section>
        </article>

        <button v-if="tersaring.length > batas" class="btn rk-more" @click="batas += 40">
          Tampilkan lagi ({{ tersaring.length - batas }} tersisa)
        </button>
      </template>
    </main>

    <footer class="rk-foot">Halaman sementara · ERP NEXT1 · dibuat oleh Claude AI</footer>
  </div>
</template>

<style scoped>
.rk-page {
  --bg: #f1f5f9; --card: #fff; --line: #e2e8f0; --text: #0f172a; --muted: #64748b;
  --primary: #1e40af; --ok: #16a34a; --ok-bg: #dcfce7; --warn: #b45309; --warn-bg: #fef3c7; --down: #dc2626;
  min-height: 100vh; background: var(--bg); color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 14px;
  display: flex; flex-direction: column;
}

/* Header */
.rk-head { position: sticky; top: 0; z-index: 10; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; padding: 14px 16px 10px; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
.rk-head-inner { max-width: 1800px; margin: 0 auto; display: flex; gap: 16px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
.rk-title h1 { margin: 0; font-size: 20px; }
.rk-title p { margin: 4px 0 0; font-size: 13px; opacity: .9; }
.rk-progress { min-width: 240px; flex: 0 1 340px; }
.rk-progress-num { font-size: 13px; margin-bottom: 4px; text-align: right; }
.rk-bar { height: 10px; border-radius: 99px; background: rgba(255,255,255,.3); overflow: hidden; }
.rk-bar-fill { height: 100%; background: #4ade80; transition: width .3s; }
.rk-tools { max-width: 1800px; margin: 10px auto 0; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.rk-search { flex: 1 1 260px; padding: 9px 12px; border-radius: 8px; border: 0; font-size: 14px; }
.rk-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.rk-chips button { border: 1px solid rgba(255,255,255,.5); background: transparent; color: #fff; padding: 6px 10px; border-radius: 99px; cursor: pointer; font-size: 13px; }
.rk-chips button span { opacity: .8; margin-left: 2px; }
.rk-chips button.on { background: #fff; color: var(--primary); font-weight: 600; }
.rk-reload { font-size: 15px !important; }

/* Main */
.rk-main { flex: 1; width: 100%; max-width: 1800px; margin: 0 auto; padding: 14px 16px 24px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; }
.rk-state { text-align: center; padding: 48px 16px; color: var(--muted); }
.rk-state.err { color: var(--down); }
.rk-spin { width: 34px; height: 34px; border: 4px solid var(--line); border-top-color: var(--primary); border-radius: 50%; margin: 0 auto 12px; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Card: 1 kolom (HP) → 3 kolom (laptop/PC) */
.rk-card {
  background: var(--card); border: 1px solid var(--line); border-left: 5px solid #cbd5e1; border-radius: 12px;
  padding: 14px; display: grid; grid-template-columns: 1fr; gap: 14px; transition: background .2s, border-color .2s;
}
.rk-card.done { background: #f0fdf4; border-color: #86efac; border-left-color: var(--ok); }
.rk-col { min-width: 0; display: flex; flex-direction: column; gap: 6px; position: relative; }
.rk-label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.rk-obj { font-weight: 400; text-transform: none; }
.rk-name { font-size: 15px; font-weight: 600; word-break: break-word; }
.rk-meta { display: flex; gap: 6px 10px; flex-wrap: wrap; font-size: 12px; color: var(--muted); align-items: center; }
.rk-comment { margin: 0; font-size: 12px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rk-empty { color: var(--warn); font-style: italic; }
.mono { font-family: ui-monospace, Consolas, monospace; }
.muted { color: var(--muted); }

.pill { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0; }
.p-ok, .st-up { background: var(--ok-bg); color: var(--ok); }
.p-warn, .st-warn { background: var(--warn-bg); color: var(--warn); }
.st-down { background: #fee2e2; color: var(--down); }
.p-grey, .st-other { background: #e2e8f0; color: #475569; }

.rk-input, .rk-attrs input, .rk-attrs textarea, .rk-picker input {
  width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-family: inherit; background: #fff;
}
.rk-input { font-weight: 600; }
.rk-input:focus, .rk-attrs input:focus, .rk-attrs textarea:focus, .rk-picker input:focus { outline: 2px solid #93c5fd; border-color: #3b82f6; }
.rk-attrs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rk-attrs label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); }
.rk-attrs .full { grid-column: 1 / -1; }

.btn-link { align-self: flex-start; background: none; border: 0; padding: 2px 0; color: var(--primary); cursor: pointer; font-size: 13px; }
.rk-picker { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; background: #fff; border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.15); padding: 8px; }
.rk-picker ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 260px; overflow: auto; }
.rk-picker li { padding: 8px; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; }
.rk-picker li:hover { background: #eff6ff; }
.rk-picker li small { color: var(--muted); }

.rk-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 2px; }
.btn { padding: 9px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 14px; font-weight: 500; }
.btn:disabled { opacity: .5; cursor: wait; }
.btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.rk-check { display: inline-flex; gap: 6px; align-items: center; padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; cursor: pointer; user-select: none; font-weight: 500; }
.rk-check input { width: 18px; height: 18px; accent-color: var(--ok); }
.rk-check.on { background: var(--ok); border-color: var(--ok); color: #fff; }
.rk-msg { margin: 0; font-size: 13px; color: var(--ok); }
.rk-msg.err { color: var(--down); }
.rk-more { align-self: center; margin-top: 6px; }

.rk-foot { text-align: center; font-size: 12px; color: var(--muted); padding: 14px; }

/* HP: tombol penuh lebar, mudah disentuh */
@media (max-width: 599px) {
  .rk-head { position: static; }
  .rk-title h1 { font-size: 17px; }
  .rk-progress { flex-basis: 100%; }
  .rk-progress-num { text-align: left; }
  .rk-actions > * { flex: 1 1 100%; justify-content: center; }
  .rk-attrs { grid-template-columns: 1fr; }
}
/* Laptop / PC: 3 kolom */
@media (min-width: 1024px) {
  .rk-card { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr); }
  .rk-fix { border-left: 1px dashed var(--line); padding-left: 14px; }
}
/* Layar besar: kartu 2 per baris */
@media (min-width: 2200px) {
  .rk-main { display: grid; grid-template-columns: 1fr 1fr; max-width: 3200px; }
  .rk-head-inner, .rk-tools { max-width: 3200px; }
  .rk-state, .rk-more { grid-column: 1 / -1; }
}
</style>
