<script setup lang="ts">
// Halaman SEMENTARA tanpa login — rekonsiliasi per SITE (ERP sebagai acuan).
// Nama lurus: PRTG = "nama site" atau "nama site - keterangan"; ganti nama baku → site ERP & semua device site itu ikut berubah.
// Backend: /api/prtg-rekon (aktif hanya bila PRTG_REKON_ENABLED=true).
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { confirmDialog } from '@/composables/useDialog'
import { useRekonApi, pesanError } from '@/composables/useRekonApi'

const { http, butuhLogin, passInput, passErr, masuk, tanganiGagalLogin } = useRekonApi()

interface Site {
  id_site: number; kode_site: string; nama_site: string
  kota: string | null; provinsi: string | null; status_site: string
  pelanggan: { nama_pelanggan: string } | null
}
interface Rekon {
  id_site: number | null; nama_baru: string | null
  is_done: boolean; applied_at: string | null; device_name_awal: string
}
interface Dev {
  objid: number; device_name: string; ip_address: string | null; prtg_status: string
  comments: string | null; parsed_sn: string | null
  match_source: 'manual' | 'auto' | null; match_score: number | null
  site: Site | null; rekon: Rekon | null
}
interface Ui { busy: boolean; msg: string; err: boolean }

const sites = ref<Site[]>([])
const devs = ref<Dev[]>([])
const ui = reactive<Record<number, Ui>>({})
const ketEdit = reactive<Record<number, string>>({}) // keterangan device yang diketik (Router, Modem, …)
const baseEdit = reactive<Record<number, string>>({}) // nama baku site yang diketik (berlaku untuk ERP & PRTG)
const loading = ref(true)
const loadErr = ref('')
const cacheInfo = ref('')

const mode = ref<'site' | 'sisa'>('site')
const q = ref('')
const holding = ref('')
const status = ref<'semua' | 'aktif' | 'nonaktif'>('semua')
const tahap = ref<'semua' | 'kosong' | 'belum' | 'beres'>('semua')
const batas = ref(30)

async function load(refresh = false) {
  loading.value = true
  loadErr.value = ''
  try {
    const [a, b] = await Promise.all([
      http.get('/semua-site'),
      http.get('', { params: refresh ? { refresh: 1 } : {} }),
    ])
    sites.value = a.data.data as Site[]
    devs.value = b.data.data as Dev[]
    cacheInfo.value = b.data.meta?.dari_cache ? `Dari cache (${new Date(b.data.meta.cached_at).toLocaleTimeString('id-ID')})` : ''
    for (const d of devs.value) if (!ui[d.objid]) ui[d.objid] = { busy: false, msg: '', err: false }
  } catch (e) {
    if (!tanganiGagalLogin(e)) loadErr.value = pesanError(e)
  } finally {
    loading.value = false
  }
}

// ── Pengelompokan device per site ─────────────────────────────────────────────
const devBySite = computed(() => {
  const m = new Map<number, Dev[]>()
  for (const d of devs.value) {
    const id = d.site?.id_site
    if (!id) continue
    const arr = m.get(id)
    if (arr) arr.push(d); else m.set(id, [d])
  }
  for (const arr of m.values()) arr.sort((a, b) => a.objid - b.objid)
  return m
})
const devSite = (s: Site): Dev[] => devBySite.value.get(s.id_site) ?? []
const devSisa = computed(() => devs.value.filter((d) => !d.site))

// Nama lurus: persis "nama site", atau "nama site - keterangan" (Router, Modem, Switch, Mikrotik, … bebas)
const PILIHAN_KET = ['Router', 'Modem', 'Switch', 'Mikrotik', 'AP']
function ketDari(nama: string, base: string): string | null {
  if (nama === base) return ''
  if (!nama.startsWith(base + ' - ')) return null
  const k = nama.slice(base.length + 3).trim()
  return k ? k : null
}
const baku = (d: Dev, s: Site) => ketDari(d.device_name, s.nama_site) !== null
const namaBaku = (s: Site): string => baseEdit[s.id_site] ?? s.nama_site
function ketDefault(d: Dev, s: Site): string {
  const k = ketDari(d.device_name, s.nama_site)
  if (k !== null) return k
  const r = d.rekon?.nama_baru ? ketDari(d.rekon.nama_baru, s.nama_site) : null
  return r ?? ''
}
const ketOf = (d: Dev, s: Site): string => ketEdit[d.objid] ?? ketDefault(d, s)
function target(d: Dev, s: Site): string {
  const b = namaBaku(s).trim()
  const k = ketOf(d, s).trim()
  return k ? `${b} - ${k}` : b
}
const kembarDiSite = (d: Dev, s: Site) => devSite(s).some((x) => x.objid !== d.objid && target(x, s) === target(d, s))
const perluApply = (d: Dev, s: Site) => target(d, s) !== d.device_name || namaBaku(s).trim() !== s.nama_site
const beres = (d: Dev, s: Site) => baku(d, s)
function tahapSite(s: Site): 'kosong' | 'belum' | 'beres' {
  const ds = devSite(s)
  if (!ds.length) return 'kosong'
  return ds.every((d) => beres(d, s)) ? 'beres' : 'belum'
}

// ── Filter ───────────────────────────────────────────────────────────────────
const daftarHolding = computed(() => {
  const hitung = new Map<string, number>()
  for (const s of sites.value) {
    const n = s.pelanggan?.nama_pelanggan
    if (n) hitung.set(n, (hitung.get(n) ?? 0) + 1)
  }
  return [...hitung.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
})
const aktif = (s: Site) => s.status_site.toLowerCase() === 'aktif'

// Cakupan (holding + status) — dasar progress, sebelum filter tahap & pencarian
const cakupan = computed(() =>
  sites.value.filter((s) => {
    if (holding.value && s.pelanggan?.nama_pelanggan !== holding.value) return false
    if (status.value === 'aktif' && !aktif(s)) return false
    if (status.value === 'nonaktif' && aktif(s)) return false
    return true
  }),
)
const stats = computed(() => {
  let kosong = 0, belum = 0, beresN = 0
  for (const s of cakupan.value) {
    const t = tahapSite(s)
    if (t === 'kosong') kosong++; else if (t === 'belum') belum++; else beresN++
  }
  return { total: cakupan.value.length, kosong, belum, beres: beresN }
})
const persen = computed(() => (stats.value.total ? Math.round((stats.value.beres / stats.value.total) * 100) : 0))

const tersaring = computed(() => {
  const kata = q.value.trim().toLowerCase()
  return cakupan.value.filter((s) => {
    if (tahap.value !== 'semua' && tahapSite(s) !== tahap.value) return false
    if (!kata) return true
    const ds = devSite(s).flatMap((d) => [d.device_name, d.ip_address])
    return [s.nama_site, s.kode_site, s.kota, s.pelanggan?.nama_pelanggan, ...ds].some((v) => v && v.toLowerCase().includes(kata))
  })
})
const tampil = computed(() => tersaring.value.slice(0, batas.value))

const sisaTersaring = computed(() => {
  const kata = q.value.trim().toLowerCase()
  return devSisa.value.filter((d) => !kata || [d.device_name, d.ip_address, d.comments].some((v) => v && v.toLowerCase().includes(kata)))
})

// ── Pilih device PRTG untuk sebuah site ──────────────────────────────────────
const pickerSite = ref<number | null>(null)
const pickQ = ref('')
function token(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
}
function skor(sitenya: Site, d: Dev): number {
  const a = new Set(token(sitenya.nama_site))
  if (!a.size) return 0
  const b = token(d.device_name)
  return b.filter((t) => a.has(t)).length / a.size
}
const hasilPicker = computed(() => {
  const s = sites.value.find((x) => x.id_site === pickerSite.value)
  if (!s) return []
  const kata = pickQ.value.trim().toLowerCase()
  const cand = devs.value.filter((d) => d.site?.id_site !== s.id_site)
  if (!kata) {
    return cand.map((d) => ({ d, sk: skor(s, d) })).filter((x) => x.sk > 0).sort((a, b) => b.sk - a.sk).slice(0, 8)
  }
  return cand
    .filter((d) => [d.device_name, d.ip_address, d.comments].some((v) => v && v.toLowerCase().includes(kata)))
    .map((d) => ({ d, sk: skor(s, d) }))
    .sort((a, b) => b.sk - a.sk)
    .slice(0, 30)
})
function bukaPicker(s: Site) {
  pickerSite.value = pickerSite.value === s.id_site ? null : s.id_site
  pickQ.value = ''
}
function klikLuar(e: MouseEvent) {
  const el = e.target as HTMLElement | null
  if (!el?.closest('.rs-picker, .rs-pick-btn')) pickerSite.value = null
}
function tekanKey(e: KeyboardEvent) { if (e.key === 'Escape') pickerSite.value = null }

function flash(d: Dev, msg: string, err = false) {
  const u = ui[d.objid]
  if (u) { u.msg = msg; u.err = err }
}

async function pasangkan(s: Site, d: Dev) {
  if (d.site && d.site.id_site !== s.id_site) {
    const ok = await confirmDialog({
      title: 'Pindahkan device dari site lain?',
      message: `Device "${d.device_name}" saat ini terhubung ke site:\n${d.site.nama_site}\n\nPindahkan ke:\n${s.nama_site}`,
      confirmLabel: 'Pindahkan',
      variant: 'warning',
    })
    if (!ok) return
  }
  const u = ui[d.objid]
  if (u) u.busy = true
  try {
    const { data } = await http.patch(`/${d.objid}`, { device_name: d.device_name, id_site: s.id_site })
    d.site = s
    d.rekon = data.data as Rekon
    d.match_source = 'manual'
    d.match_score = 100
    delete ketEdit[d.objid]
    pickerSite.value = null
    flash(d, 'Dipasangkan — cek nama target lalu Apply')
  } catch (e) {
    if (!tanganiGagalLogin(e)) flash(d, pesanError(e), true)
  } finally {
    if (u) u.busy = false
  }
}

async function lepas(s: Site, d: Dev) {
  const ok = await confirmDialog({
    title: 'Lepas device dari site?',
    message: `${d.device_name}\n\ndilepas dari:\n${s.nama_site}\n\n(Nama di PRTG tidak berubah)`,
    confirmLabel: 'Lepas',
    variant: 'warning',
  })
  if (!ok) return
  const u = ui[d.objid]
  if (u) u.busy = true
  try {
    // id_site 0 = sengaja dilepas (tidak kembali ke tebakan otomatis)
    const { data } = await http.patch(`/${d.objid}`, { device_name: d.device_name, id_site: 0 })
    d.site = null
    d.rekon = data.data as Rekon
    d.match_source = null
    d.match_score = null
    delete ketEdit[d.objid]
  } catch (e) {
    if (!tanganiGagalLogin(e)) flash(d, pesanError(e), true)
  } finally {
    if (u) u.busy = false
  }
}

async function terapkan(s: Site, d: Dev) {
  const base = namaBaku(s).trim()
  const nama = target(d, s)
  if (!base) return flash(d, 'Nama baku site wajib diisi', true)
  if (kembarDiSite(d, s)) return flash(d, 'Nama sama dengan device lain di site ini — isi keterangan (mis. Router/Modem)', true)
  // Nama baku berbeda dari nama site → nama site ERP ikut diubah, device lain yang sudah lurus ikut di-rename
  const ubahSite = base !== s.nama_site
  const lainLurus = ubahSite ? devSite(s).filter((x) => x.objid !== d.objid && x.device_name.startsWith(s.nama_site + ' - ')).length : 0
  const ok = await confirmDialog({
    title: ubahSite ? 'Rename di PRTG dan ERP?' : 'Rename device di PRTG?',
    message: `PRTG sekarang:\n${d.device_name}\n\nmenjadi:\n${nama}\n\n` +
      (ubahSite
        ? `Nama site di ERP diubah:\n${s.nama_site}\n→ ${base}` + (lainLurus ? `\n\n${lainLurus} device lain di site ini ikut di-rename di PRTG.` : '')
        : `(Nama site di ERP tetap: ${s.nama_site})`),
    confirmLabel: 'Apply',
    variant: 'warning',
  })
  if (!ok) return
  const u = ui[d.objid]
  if (u) u.busy = true
  flash(d, '')
  try {
    const { data } = await http.post(`/${d.objid}/terapkan`, { id_site: s.id_site, nama, nama_site: base })
    d.device_name = nama
    d.rekon = data.data as Rekon
    d.match_source = 'manual'
    d.match_score = 100
    delete ketEdit[d.objid]
    if (ubahSite) {
      // Samakan nama site di semua salinan lokal, dan nama device lain yang ikut di-rename
      for (const x of sites.value) if (x.id_site === s.id_site) x.nama_site = base
      for (const x of devs.value) if (x.site?.id_site === s.id_site) x.site.nama_site = base
      delete baseEdit[s.id_site]
      for (const r of (data.meta?.ikut_rename ?? []) as { objid: number; ke: string }[]) {
        const x = devs.value.find((v) => v.objid === r.objid)
        if (x) { x.device_name = r.ke; delete ketEdit[x.objid] }
      }
    }
    flash(d, data.message || 'Nama sudah diperbarui', !!(data.meta?.gagal?.length))
  } catch (e) {
    if (!tanganiGagalLogin(e)) flash(d, pesanError(e), true)
  } finally {
    if (u) u.busy = false
  }
}

const statusKelas = (s: string) => {
  const v = s.toLowerCase()
  if (v.includes('down')) return 'st-down'
  if (v.includes('warn')) return 'st-warn'
  if (v.includes('up')) return 'st-up'
  return 'st-other'
}
const ubah = () => { batas.value = 30 }

onMounted(() => {
  if (!butuhLogin.value) load(); else loading.value = false
  document.addEventListener('click', klikLuar)
  document.addEventListener('keydown', tekanKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', klikLuar)
  document.removeEventListener('keydown', tekanKey)
})
</script>

<template>
  <div class="rs-page">
    <header class="rs-head">
      <div class="rs-head-inner">
        <div class="rs-title">
          <h1>Rekonsiliasi PRTG per Site</h1>
          <p>Acuan: nama <b>site</b> &amp; <b>PT holding</b> di ERP. Nama PRTG dibuat lurus: <b>nama site</b> atau <b>nama site - keterangan</b> (Router, Modem, …). Satu site boleh banyak device. Ubah nama baku → nama site ERP &amp; semua device site itu ikut berubah.</p>
        </div>
        <div class="rs-progress" v-if="!loading && !loadErr && !butuhLogin">
          <div class="rs-progress-num"><b>{{ stats.beres }}</b> / {{ stats.total }} site lurus · {{ persen }}%</div>
          <div class="rs-bar"><div class="rs-bar-fill" :style="{ width: persen + '%' }"></div></div>
        </div>
      </div>

      <div class="rs-tools" v-if="!loading && !loadErr && !butuhLogin">
        <input v-model="q" class="rs-search" type="search" placeholder="Cari site, kode, kota, pelanggan, device, IP…" @input="ubah" />
        <select v-model="holding" class="rs-select" title="Filter berdasarkan PT holding" @change="ubah">
          <option value="">Semua PT holding</option>
          <option v-for="[nama, jml] in daftarHolding" :key="nama" :value="nama">{{ nama }} ({{ jml }})</option>
        </select>
        <select v-model="status" class="rs-select rs-select-s" title="Status site" @change="ubah">
          <option value="semua">Semua status</option>
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
        </select>
        <div class="rs-chips">
          <button :class="{ on: mode === 'site' && tahap === 'semua' }" @click="mode = 'site'; tahap = 'semua'; ubah()">Semua site <span>{{ stats.total }}</span></button>
          <button :class="{ on: mode === 'site' && tahap === 'kosong' }" @click="mode = 'site'; tahap = 'kosong'; ubah()">Belum ada device <span>{{ stats.kosong }}</span></button>
          <button :class="{ on: mode === 'site' && tahap === 'belum' }" @click="mode = 'site'; tahap = 'belum'; ubah()">Belum lurus <span>{{ stats.belum }}</span></button>
          <button :class="{ on: mode === 'site' && tahap === 'beres' }" @click="mode = 'site'; tahap = 'beres'; ubah()">Lurus <span>{{ stats.beres }}</span></button>
          <button :class="{ on: mode === 'sisa' }" @click="mode = 'sisa'; ubah()">Device PRTG belum terpakai <span>{{ devSisa.length }}</span></button>
          <button class="rs-reload" @click="load(true)" :title="cacheInfo ? cacheInfo + ' — klik untuk ambil ulang dari PRTG' : 'Ambil ulang dari PRTG'">⟳</button>
        </div>
      </div>
    </header>

    <main class="rs-main">
      <form v-if="butuhLogin" class="rs-state rs-login" @submit.prevent="masuk(load)">
        <p><b>Rekonsiliasi PRTG</b><br />Masukkan password untuk melanjutkan.</p>
        <input v-model="passInput" type="password" autocomplete="current-password" placeholder="Password" autofocus />
        <p v-if="passErr" class="rs-err-text">{{ passErr }}</p>
        <button class="btn btn-primary" type="submit">Masuk</button>
      </form>
      <div v-else-if="loading" class="rs-state">
        <div class="rs-spin"></div>
        <p>Mengambil data dari PRTG &amp; ERP… (bisa ±1 menit untuk pertama kali)</p>
      </div>
      <div v-else-if="loadErr" class="rs-state err">
        <p>{{ loadErr }}</p>
        <button class="btn" @click="load(true)">Coba lagi</button>
      </div>

      <!-- Mode: device PRTG yang belum dipakai site mana pun -->
      <template v-else-if="mode === 'sisa'">
        <p class="rs-note">
          Device PRTG yang belum terhubung ke site. Untuk memasangkannya, buka site yang sesuai di tab <b>Semua site</b>
          lalu pilih <i>+ Pasang device PRTG</i>, atau pakai <a href="/rekon-prtg/device">mode per device</a>.
        </p>
        <p v-if="!sisaTersaring.length" class="rs-state">Tidak ada device yang tersisa 🎉</p>
        <article v-for="d in sisaTersaring.slice(0, batas)" :key="d.objid" class="rs-dev rs-dev-solo">
          <div class="rs-dev-main">
            <div class="rs-name">{{ d.device_name }} <span class="rs-obj">#{{ d.objid }}</span></div>
            <div class="rs-meta">
              <span class="pill" :class="statusKelas(d.prtg_status)">{{ d.prtg_status }}</span>
              <span v-if="d.ip_address" class="mono">{{ d.ip_address }}</span>
              <span v-if="d.parsed_sn" class="mono">SN {{ d.parsed_sn }}</span>
            </div>
            <p v-if="d.comments" class="rs-comment" :title="d.comments">{{ d.comments }}</p>
          </div>
        </article>
        <button v-if="sisaTersaring.length > batas" class="btn rs-more" @click="batas += 30">
          Tampilkan lagi ({{ sisaTersaring.length - batas }} tersisa)
        </button>
      </template>

      <!-- Mode: per site -->
      <template v-else>
        <p v-if="!tersaring.length" class="rs-state">Tidak ada site untuk filter ini.</p>

        <article v-for="s in tampil" :key="s.id_site" class="rs-card" :class="'t-' + tahapSite(s)">
          <header class="rs-card-head">
            <div class="rs-card-title">
              <div class="rs-name">{{ s.nama_site }}</div>
              <div class="rs-meta">
                <span class="mono">{{ s.kode_site }}</span>
                <span v-if="s.pelanggan">{{ s.pelanggan.nama_pelanggan }}</span>
                <span v-if="s.kota">{{ s.kota }}</span>
                <span class="pill" :class="aktif(s) ? 'p-ok' : 'p-grey'">{{ s.status_site }}</span>
                <span v-if="devSite(s).length" class="pill p-blue">{{ devSite(s).length }} perangkat PRTG</span>
              </div>
            </div>
            <span class="pill rs-tahap" :class="{ 'p-ok': tahapSite(s) === 'beres', 'p-warn': tahapSite(s) === 'belum', 'p-grey': tahapSite(s) === 'kosong' }">
              {{ tahapSite(s) === 'beres' ? 'Lurus' : tahapSite(s) === 'belum' ? 'Belum lurus' : 'Belum ada device' }}
            </span>
          </header>

          <div v-if="devSite(s).length" class="rs-baku">
            <label class="rs-label" :for="'b' + s.id_site">Nama baku site (ERP &amp; PRTG)</label>
            <input
              :id="'b' + s.id_site" class="rs-input" :value="namaBaku(s)" maxlength="150"
              @input="baseEdit[s.id_site] = ($event.target as HTMLInputElement).value"
            />
            <p v-if="namaBaku(s).trim() !== s.nama_site" class="rs-hint">
              Saat Apply, nama site ERP diubah: <b>{{ s.nama_site }}</b> → <b>{{ namaBaku(s).trim() }}</b>, dan device lain site ini ikut di-rename di PRTG.
            </p>
          </div>

          <div v-for="d in devSite(s)" :key="d.objid" class="rs-dev" :class="{ ok: beres(d, s) }">
            <div class="rs-dev-main">
              <div class="rs-label">
                Device PRTG <span class="rs-obj">#{{ d.objid }}</span>
                <span v-if="d.match_source === 'auto' && !d.rekon?.id_site" class="pill p-warn">usulan otomatis {{ d.match_score }}%</span>
                <span v-else-if="beres(d, s)" class="pill p-ok">lurus ✓</span>
              </div>
              <div class="rs-name">{{ d.device_name }}</div>
              <div class="rs-meta">
                <span class="pill" :class="statusKelas(d.prtg_status)">{{ d.prtg_status }}</span>
                <span v-if="d.ip_address" class="mono">{{ d.ip_address }}</span>
                <span v-if="d.parsed_sn" class="mono">SN {{ d.parsed_sn }}</span>
              </div>
              <p v-if="d.comments" class="rs-comment" :title="d.comments">{{ d.comments }}</p>
            </div>
            <div class="rs-dev-act">
              <label class="rs-label" :for="'k' + d.objid">Keterangan device <span class="rs-obj">(kosong = device utama)</span></label>
              <input
                :id="'k' + d.objid" class="rs-input" :value="ketOf(d, s)" maxlength="60" placeholder="mis. Router, Modem, Switch, Mikrotik…"
                @input="ketEdit[d.objid] = ($event.target as HTMLInputElement).value"
              />
              <div class="rs-chipset">
                <button
                  v-for="k in PILIHAN_KET" :key="k" type="button" class="rs-chip" :class="{ on: ketOf(d, s) === k }"
                  @click="ketEdit[d.objid] = ketOf(d, s) === k ? '' : k"
                >{{ k }}</button>
              </div>
              <div class="rs-preview">Nama di PRTG: <b>{{ target(d, s) }}</b></div>
              <p v-if="kembarDiSite(d, s)" class="rs-msg err">Nama sama dengan device lain di site ini — beri keterangan.</p>
              <div class="rs-btns">
                <button class="btn btn-primary" :disabled="ui[d.objid]?.busy || !perluApply(d, s)" @click="terapkan(s, d)">
                  {{ ui[d.objid]?.busy ? 'Memproses…' : 'Apply' }}
                </button>
                <button class="btn" :disabled="ui[d.objid]?.busy" @click="lepas(s, d)">Lepas</button>
              </div>
              <p v-if="ui[d.objid]?.msg" class="rs-msg" :class="{ err: ui[d.objid]?.err }">{{ ui[d.objid]?.msg }}</p>
            </div>
          </div>

          <div class="rs-add">
            <button class="btn-link rs-pick-btn" @click="bukaPicker(s)">+ Pasang device PRTG ▾</button>
            <div v-if="pickerSite === s.id_site" class="rs-picker">
              <input v-model="pickQ" placeholder="Cari nama / IP device PRTG… (kosong = usulan termirip)" autofocus />
              <ul>
                <li v-for="h in hasilPicker" :key="h.d.objid" @click="pasangkan(s, h.d)">
                  <b>{{ h.d.device_name }}</b>
                  <small>
                    #{{ h.d.objid }} · {{ h.d.ip_address || 'tanpa IP' }} · {{ h.d.prtg_status }}
                    <template v-if="h.sk > 0"> · mirip {{ Math.round(h.sk * 100) }}%</template>
                    <template v-if="h.d.site"> · <span class="rs-used">terhubung: {{ h.d.site.nama_site }}</span></template>
                  </small>
                </li>
                <li v-if="!hasilPicker.length" class="muted">Tidak ada hasil</li>
              </ul>
            </div>
          </div>
        </article>

        <button v-if="tersaring.length > batas" class="btn rs-more" @click="batas += 30">
          Tampilkan lagi ({{ tersaring.length - batas }} site tersisa)
        </button>
      </template>
    </main>
  </div>
</template>

<style scoped>
.rs-page {
  --bg: #f1f5f9; --card: #fff; --line: #e2e8f0; --text: #0f172a; --muted: #64748b;
  --primary: #1e40af; --ok: #16a34a; --ok-bg: #dcfce7; --warn: #b45309; --warn-bg: #fef3c7; --down: #dc2626;
  min-height: 100vh; background: var(--bg); color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 14px;
  display: flex; flex-direction: column;
}
.rs-head { position: sticky; top: 0; z-index: 10; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; padding: 14px 16px 10px; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
.rs-head-inner { max-width: 1500px; margin: 0 auto; display: flex; gap: 16px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
.rs-title h1 { margin: 0; font-size: 20px; }
.rs-title p { margin: 4px 0 0; font-size: 13px; opacity: .92; max-width: 760px; }
.rs-progress { min-width: 240px; flex: 0 1 340px; }
.rs-progress-num { font-size: 13px; margin-bottom: 4px; text-align: right; }
.rs-bar { height: 10px; border-radius: 99px; background: rgba(255,255,255,.3); overflow: hidden; }
.rs-bar-fill { height: 100%; background: #4ade80; transition: width .3s; }
.rs-tools { max-width: 1500px; margin: 10px auto 0; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.rs-search { flex: 1 1 260px; padding: 9px 12px; border-radius: 8px; border: 0; font-size: 14px; }
.rs-select { flex: 0 1 280px; padding: 9px 12px; border-radius: 8px; border: 0; font-size: 14px; max-width: 100%; }
.rs-select-s { flex: 0 1 150px; }
.rs-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.rs-chips button { border: 1px solid rgba(255,255,255,.5); background: transparent; color: #fff; padding: 6px 10px; border-radius: 99px; cursor: pointer; font-size: 13px; }
.rs-chips button span { opacity: .8; margin-left: 2px; }
.rs-chips button.on { background: #fff; color: var(--primary); font-weight: 600; }

.rs-main { flex: 1; width: 100%; max-width: 1500px; margin: 0 auto; padding: 14px 16px 24px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; }
.rs-state { text-align: center; padding: 48px 16px; color: var(--muted); }
.rs-state.err { color: var(--down); }
.rs-login { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.rs-login input { width: min(320px, 90%); padding: 10px 12px; font-size: 16px; border: 1px solid #cbd5e1; border-radius: 8px; }
.rs-err-text { color: var(--down); margin: 0; }
.rs-spin { width: 34px; height: 34px; border: 4px solid var(--line); border-top-color: var(--primary); border-radius: 50%; margin: 0 auto 12px; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.rs-note { margin: 0; padding: 10px 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; color: #1e3a8a; }

.rs-card { background: var(--card); border: 1px solid var(--line); border-left: 5px solid #cbd5e1; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.rs-card.t-beres { background: #f0fdf4; border-color: #86efac; border-left-color: var(--ok); }
.rs-card.t-belum { border-left-color: #f59e0b; }
.rs-card-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.rs-card-title { min-width: 0; }
.rs-name { font-size: 15px; font-weight: 600; word-break: break-word; }
.rs-meta { display: flex; gap: 6px 10px; flex-wrap: wrap; font-size: 12px; color: var(--muted); align-items: center; margin-top: 2px; }
.rs-comment { margin: 4px 0 0; font-size: 12px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rs-label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.rs-obj { font-weight: 400; text-transform: none; }

.rs-dev { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #f8fafc; }
.rs-dev.ok { background: #f0fdf4; border-color: #bbf7d0; }
.rs-dev-solo { background: var(--card); }
.rs-dev-main, .rs-dev-act { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rs-input { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-family: inherit; background: #fff; }
.rs-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.rs-msg { margin: 0; font-size: 13px; color: var(--ok); }
.rs-baku { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px dashed #93c5fd; border-radius: 10px; background: #eff6ff; }
.rs-hint { margin: 0; font-size: 12px; color: #1e3a8a; }
.rs-chipset { display: flex; gap: 6px; flex-wrap: wrap; }
.rs-chip { border: 1px solid #cbd5e1; background: #fff; color: var(--text); padding: 3px 10px; border-radius: 99px; cursor: pointer; font-size: 12px; }
.rs-chip.on { background: var(--primary); border-color: var(--primary); color: #fff; }
.rs-preview { font-size: 13px; color: var(--muted); word-break: break-word; }
.rs-preview b { color: var(--text); }
.rs-msg.err { color: var(--down); }

.rs-add { position: relative; }
.rs-picker { margin-top: 6px; border: 1px solid var(--line); border-radius: 10px; background: #fff; padding: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.12); }
.rs-picker input { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; }
.rs-picker ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 280px; overflow: auto; }
.rs-picker li { padding: 8px 10px; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.rs-picker li:hover { background: #eff6ff; }
.rs-picker li small { color: var(--muted); }
.rs-used { color: var(--warn); }

.mono { font-family: ui-monospace, Consolas, monospace; }
.muted { color: var(--muted); }
.pill { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0; }
.p-ok, .st-up { background: var(--ok-bg); color: var(--ok); }
.p-warn, .st-warn { background: var(--warn-bg); color: var(--warn); }
.st-down { background: #fee2e2; color: var(--down); }
.p-grey, .st-other { background: #e2e8f0; color: #475569; }
.p-blue { background: #dbeafe; color: #1e40af; }
.btn-link { align-self: flex-start; background: none; border: 0; padding: 2px 0; color: var(--primary); cursor: pointer; font-size: 13px; }
.btn { padding: 9px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 14px; font-weight: 500; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.rs-more { align-self: center; }

@media (min-width: 900px) {
  .rs-dev { grid-template-columns: 1fr 1fr; align-items: start; }
}
@media (max-width: 720px) {
  .rs-head { position: static; }
}
</style>
