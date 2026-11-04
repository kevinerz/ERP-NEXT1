<script setup lang="ts">
// Pembanding tiket gangguan (PRTG / WA / internal) dengan status router dari NOCaaS
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDateTime } from '@/composables/useFormat'
import { alertError } from '@/composables/useDialog'

const router = useRouter()
const WARNA: Record<string, string> = { online: '#16a34a', partial: '#d97706', internet_ok: '#7c3aed', offline: '#dc2626' }
const SUMBER: Record<string, string> = { ip_perangkat: 'IP tunnel di perangkat site', prtg_host: 'Host device PRTG', nama: 'Kemiripan nama', manual: 'Manual' }

const data = ref<any>(null)
const memuat = ref(false)
const sinkron = ref(false)
const tab = ref<'tiket' | 'tanpa' | 'belum'>('tiket')
const minMenit = ref(15)
const filterTanpa = ref<'' | 'offline' | 'internet_ok'>('')

// ── Tiket otomatis dari NOCaaS ──
const cfg = ref<any>(null)
const cfgEdit = ref(false)
const cfgForm = ref({ tiket_aktif: true, durasi_konfirmasi_menit: 10, cooldown_menit: 60, maks_tiket_per_putaran: 30 })
async function muatCfg() {
  try { cfg.value = (await api.get('/nocaas/konfigurasi')).data.data } catch { /* abaikan */ }
}
function bukaCfg() {
  const c = cfg.value
  cfgForm.value = { tiket_aktif: c.tiket_aktif, durasi_konfirmasi_menit: c.durasi_konfirmasi_menit, cooldown_menit: c.cooldown_menit, maks_tiket_per_putaran: c.maks_tiket_per_putaran }
  cfgEdit.value = true
}
async function simpanCfg() {
  try { cfg.value = (await api.put('/nocaas/konfigurasi', cfgForm.value)).data.data; cfgEdit.value = false } catch (e) { alertError(e, 'Gagal menyimpan') }
}

async function muat() {
  memuat.value = true
  try { data.value = (await api.get('/nocaas/ringkasan')).data.data } catch (e) { alertError(e) } finally { memuat.value = false }
}
async function sinkronSekarang() {
  sinkron.value = true
  try { await api.post('/nocaas/sinkron'); await muat(); if (tab.value === 'belum') muatBelum() } catch (e) { alertError(e, 'Sinkron gagal') } finally { sinkron.value = false }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { muat(); muatCfg(); timer = setInterval(muat, 60_000) })
onUnmounted(() => clearInterval(timer))

function lama(d?: string | null) {
  if (!d) return '—'
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 60) return `${m} mnt`
  if (m < 48 * 60) return `${Math.floor(m / 60)} jam ${m % 60} mnt`
  return `${Math.floor(m / 1440)} hari`
}
const sejak = (r: any) => (r.status === 'offline' && r.offline_since ? r.offline_since : r.status_sejak)

// Tiket aktif: urutkan yang paling perlu perhatian — NOCaaS online (kemungkinan alarm palsu) & mati total di atas
const tiket = computed(() => (data.value?.tiket ?? []) as any[])
const tiketAlarmPalsu = computed(() => tiket.value.filter((t) => t.nocaas?.status === 'online').length)
const tanpaTiket = computed(() => ((data.value?.tanpa_tiket ?? []) as any[]).filter((r) =>
  (!filterTanpa.value || r.status === filterTanpa.value) && Date.now() - new Date(sejak(r)).getTime() >= minMenit.value * 60000))

// ── Belum terpetakan ─────────────────────────────────────────────────────────
const belum = ref<any[]>([])
const belumMeta = ref({ total: 0, page: 1, pages: 1 })
const cariBelum = ref('')
async function muatBelum(page = 1) {
  try {
    const r = (await api.get('/nocaas/belum-terpeta', { params: { cari: cariBelum.value || undefined, page } })).data
    belum.value = r.data; belumMeta.value = r.meta
  } catch (e) { alertError(e) }
}
function bukaTab(t: typeof tab.value) { tab.value = t; if (t === 'belum' && !belum.value.length) muatBelum() }


const petaKey = ref('')
const petaCari = ref('')
const petaHasil = ref<any[]>([])
let petaTimer: ReturnType<typeof setTimeout> | undefined
function cariSite() {
  clearTimeout(petaTimer)
  petaTimer = setTimeout(async () => {
    if (petaCari.value.trim().length < 2) { petaHasil.value = []; return }
    try { petaHasil.value = (await api.get('/visit/site', { params: { q: petaCari.value } })).data.data } catch { petaHasil.value = [] }
  }, 250)
}
function mulaiPeta(r: any) {
  petaKey.value = r.site_key
  petaCari.value = r.site_key.replace(/[-_]+/g, ' ').trim()
  cariSite()
}
async function simpanPeta(id_site: number) {
  try {
    await api.put(`/nocaas/router/${encodeURIComponent(petaKey.value)}/site`, { id_site })
    belum.value = belum.value.filter((b) => b.site_key !== petaKey.value)
    belumMeta.value.total--
    petaKey.value = ''
    muat()
  } catch (e) { alertError(e) }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">🛰️ Pembanding NOCaaS</h2>
        <p class="page-subtitle">Tiket gangguan dibandingkan dengan status router di NOCaaS (VPN NS/UN + heartbeat syslog) — diperbarui tiap menit</p>
      </div>
      <div class="nc-tombol">
        <span v-if="data?.sinkron" class="muted" :class="{ gagal: !data.sinkron.ok }">
          {{ data.sinkron.ok ? 'Sinkron' : 'Sinkron gagal' }} {{ fmtDateTime(data.sinkron.at) }}<template v-if="!data.sinkron.ok"> — {{ data.sinkron.pesan }}</template>
        </span>
        <button class="btn btn-ghost" :disabled="sinkron" @click="sinkronSekarang">{{ sinkron ? 'Menyinkron…' : '↻ Sinkron sekarang' }}</button>
      </div>
    </div>

    <p v-if="memuat && !data" class="muted">Memuat…</p>
    <template v-else-if="data">
      <div class="nc-ubin">
        <div v-for="s in data.status" :key="s.status" class="card nc-angka">
          <span class="nc-titik" :style="{ background: WARNA[s.status] }"></span>
          <b>{{ s.n.toLocaleString('id-ID') }}</b>
          <small>{{ s.label }}</small>
        </div>
        <div class="card nc-angka">
          <b>{{ data.pemetaan.site_terpeta.toLocaleString('id-ID') }}<small> / {{ data.pemetaan.site_aktif.toLocaleString('id-ID') }}</small></b>
          <small>Site aktif terhubung ke router</small>
        </div>
      </div>

      <div v-if="cfg" class="card nc-cfg">
        <template v-if="!cfgEdit">
          <span class="nc-status" :style="{ color: cfg.tiket_aktif ? WARNA.online : WARNA.offline, borderColor: cfg.tiket_aktif ? WARNA.online : WARNA.offline }">
            Tiket otomatis {{ cfg.tiket_aktif ? 'AKTIF' : 'MATI' }}
          </span>
          <span class="nc-cfg-teks">
            Router site terpetakan yang <b>mati total ≥ {{ cfg.durasi_konfirmasi_menit }} menit</b> → tiket <b>[NOCaaS]</b> Critical; kembali tersambung → auto-resolve.
            Mati lagi &lt; {{ cfg.cooldown_menit }} menit setelah resolve → tiket dibuka ulang (flapping).
            Lebih dari {{ cfg.maks_tiket_per_putaran }} site sekaligus → ditahan (dicurigai gangguan pusat).
            Hanya gangguan yang mulai setelah {{ fmtDateTime(cfg.aktif_sejak) }}. Site belum terpetakan tetap memakai PRTG.
          </span>
          <button class="btn btn-ghost btn-sm" @click="bukaCfg">Atur</button>
        </template>
        <form v-else class="nc-cfg-form" @submit.prevent="simpanCfg">
          <label><input v-model="cfgForm.tiket_aktif" type="checkbox" /> Tiket otomatis aktif</label>
          <label>Konfirmasi (menit) <input v-model.number="cfgForm.durasi_konfirmasi_menit" type="number" min="1" max="240" class="form-input" /></label>
          <label>Cooldown flapping (menit) <input v-model.number="cfgForm.cooldown_menit" type="number" min="0" max="1440" class="form-input" /></label>
          <label>Maks tiket sekaligus <input v-model.number="cfgForm.maks_tiket_per_putaran" type="number" min="1" max="500" class="form-input" /></label>
          <button type="submit" class="btn btn-primary btn-sm">Simpan</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="cfgEdit = false">Batal</button>
        </form>
      </div>

      <div class="nc-tab">
        <button :class="{ aktif: tab === 'tiket' }" @click="bukaTab('tiket')">Tiket aktif ({{ tiket.length }})</button>
        <button :class="{ aktif: tab === 'tanpa' }" @click="bukaTab('tanpa')">Gangguan tanpa tiket ({{ data.tanpa_tiket.length }})</button>
        <button :class="{ aktif: tab === 'belum' }" @click="bukaTab('belum')">Router belum terpetakan ({{ data.pemetaan.belum }})</button>
      </div>

      <!-- Tiket aktif vs NOCaaS -->
      <div v-if="tab === 'tiket'" class="card nc-panel">
        <p v-if="tiketAlarmPalsu" class="nc-catatan">
          ⚠️ <b>{{ tiketAlarmPalsu }}</b> tiket aktif yang routernya <b>online</b> di NOCaaS — kemungkinan alarm PRTG palsu atau masalah di luar koneksi.
        </p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Tiket</th><th>Site</th><th>Sumber</th><th>Dibuka</th><th>NOCaaS sekarang</th><th>Arti</th></tr></thead>
            <tbody>
              <tr v-if="!tiket.length"><td colspan="6" class="muted nc-kosong">Tidak ada tiket aktif.</td></tr>
              <tr v-for="t in tiket" :key="t.id_ticket" class="nc-baris" @click="router.push(`/operations/${t.id_ticket}`)">
                <td><b class="mono">{{ t.nomor_tiket }}</b><div class="muted">{{ t.judul_tiket }}</div></td>
                <td>{{ t.site?.nama_site }}<div class="muted">{{ t.site?.kode_site }} · {{ t.site?.kota }}</div></td>
                <td>{{ t.sumber_tiket }}</td>
                <td class="nowrap">{{ fmtDateTime(t.tgl_open) }}</td>
                <td>
                  <span v-if="t.nocaas" class="nc-status" :style="{ color: WARNA[t.nocaas.status], borderColor: WARNA[t.nocaas.status] }">{{ t.nocaas.label }}</span>
                  <span v-else class="muted">Tidak terpetakan</span>
                  <div v-if="t.nocaas" class="muted">sejak {{ lama(t.nocaas.sejak) }}</div>
                </td>
                <td class="nc-saran">{{ t.nocaas?.saran || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Gangguan di NOCaaS tanpa tiket -->
      <div v-else-if="tab === 'tanpa'" class="card nc-panel">
        <div class="nc-filter">
          <select v-model="filterTanpa" class="form-select">
            <option value="">Mati total + VPN putus</option>
            <option value="offline">Mati total saja</option>
            <option value="internet_ok">Internet hidup, VPN putus saja</option>
          </select>
          <label class="muted">Minimal sudah
            <select v-model.number="minMenit" class="form-select">
              <option :value="0">kapan pun</option><option :value="15">15 menit</option><option :value="60">1 jam</option>
              <option :value="1440">1 hari</option><option :value="10080">7 hari</option>
            </select>
          </label>
          <span class="muted">{{ tanpaTiket.length }} site</span>
        </div>
        <p class="nc-catatan">Router site aktif yang di NOCaaS mati / VPN-nya putus, tapi tidak punya tiket aktif di ERP. Router yang mati berbulan-bulan biasanya site yang sudah tutup — cek status sitenya.</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Site</th><th>Router NOCaaS</th><th>Status</th><th>Sejak</th><th>Internet</th><th>Putus 7 hari</th></tr></thead>
            <tbody>
              <tr v-if="!tanpaTiket.length"><td colspan="6" class="muted nc-kosong">Tidak ada.</td></tr>
              <tr v-for="r in tanpaTiket" :key="r.site_key">
                <td>{{ r.site?.nama_site }}<div class="muted">{{ r.site?.kode_site }} · {{ r.site?.pelanggan?.nama_pelanggan }}</div></td>
                <td class="mono">{{ r.site_key }}<div class="muted">{{ [r.ns_ip && 'NS ' + r.ns_ip, r.un_ip && 'UN ' + r.un_ip].filter(Boolean).join(' · ') }}</div></td>
                <td><span class="nc-status" :style="{ color: WARNA[r.status], borderColor: WARNA[r.status] }">{{ r.label }}</span></td>
                <td class="nowrap">{{ lama(sejak(r)) }}<div class="muted">{{ fmtDateTime(sejak(r)) }}</div></td>
                <td>{{ r.access_isp || '—' }}<div class="muted mono">{{ r.public_ip }}</div></td>
                <td>{{ r.downs7 }}×</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pemetaan -->
      <div v-else class="card nc-panel">
        <p class="nc-catatan">
          Router dicocokkan otomatis ke site lewat:
          <template v-for="(p, i) in data.pemetaan.per_sumber" :key="p.sumber">{{ i ? ' · ' : ' ' }}{{ SUMBER[p.sumber] }} <b>{{ p.n }}</b></template>.
          Sisanya petakan manual — pemetaan manual tidak akan ditimpa sinkronisasi.
        </p>
        <div class="nc-filter">
          <input v-model="cariBelum" class="form-input" placeholder="Cari nama router / IP tunnel…" @keyup.enter="muatBelum(1)" />
          <button class="btn btn-ghost" @click="muatBelum(1)">Cari</button>
          <span class="muted">{{ belumMeta.total }} router</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Router NOCaaS</th><th>IP tunnel</th><th>Status</th><th>Internet</th><th></th></tr></thead>
            <tbody>
              <template v-for="r in belum" :key="r.site_key">
                <tr>
                  <td class="mono">{{ r.site_key }}</td>
                  <td class="mono">{{ [r.ns_ip, r.un_ip].filter(Boolean).join(' · ') }}</td>
                  <td><span class="nc-status" :style="{ color: WARNA[r.status], borderColor: WARNA[r.status] }">{{ r.label }}</span></td>
                  <td>{{ r.access_isp || '—' }}</td>
                  <td><button class="btn btn-ghost btn-sm" @click="petaKey === r.site_key ? (petaKey = '') : mulaiPeta(r)">{{ petaKey === r.site_key ? 'Batal' : 'Petakan' }}</button></td>
                </tr>
                <tr v-if="petaKey === r.site_key">
                  <td colspan="5" class="nc-peta">
                    <input v-model="petaCari" class="form-input" placeholder="Cari site ERP (nama / kode / pelanggan)…" @input="cariSite" />
                    <div v-for="s in petaHasil" :key="s.id_site" class="nc-pilih" @click="simpanPeta(s.id_site)">
                      <b>{{ s.nama_site }}</b> <span class="muted">{{ s.kode_site }} · {{ s.pelanggan?.nama_pelanggan }} · {{ s.kota }}<template v-if="s.status_site !== 'Aktif'"> · {{ s.status_site }}</template></span>
                    </div>
                    <p v-if="petaCari.trim().length >= 2 && !petaHasil.length" class="muted">Tidak ada site cocok — ubah kata kunci.</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-if="belumMeta.pages > 1" class="nc-halaman">
          <button class="btn btn-ghost btn-sm" :disabled="belumMeta.page <= 1" @click="muatBelum(belumMeta.page - 1)">‹</button>
          <span class="muted">{{ belumMeta.page }} / {{ belumMeta.pages }}</span>
          <button class="btn btn-ghost btn-sm" :disabled="belumMeta.page >= belumMeta.pages" @click="muatBelum(belumMeta.page + 1)">›</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.nc-tombol { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.gagal { color: #dc2626; }
.nc-ubin { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
.nc-angka { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; position: relative; }
.nc-angka b { font-size: 24px; font-variant-numeric: tabular-nums; }
.nc-angka b small { font-size: 14px; color: #64748b; font-weight: 600; }
.nc-angka > small { color: #64748b; font-size: 12.5px; }
.nc-titik { position: absolute; top: 14px; right: 14px; width: 10px; height: 10px; border-radius: 50%; }
.nc-cfg { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px 16px; margin-bottom: 14px; }
.nc-cfg-teks { flex: 1; min-width: 260px; font-size: 12.5px; color: #475569; }
.nc-cfg-form { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 13px; }
.nc-cfg-form .form-input { width: 80px; margin-left: 4px; display: inline-block; }
.nc-tab { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.nc-tab button { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-weight: 600; font-size: 13px; }
.nc-tab button.aktif { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
.nc-catatan { font-size: 13px; color: #475569; margin: 0 0 12px; }
.nc-panel > .nc-catatan, .nc-panel > .nc-filter { margin: 0; padding: 12px 16px 0; }
.nc-panel > .nc-filter + .nc-catatan, .nc-panel > .nc-catatan + .nc-filter { padding-top: 8px; }
.nc-panel > .table-wrap { margin-top: 12px; border-top: 1px solid var(--border); }
.nc-panel > .nc-halaman { padding: 0 16px 12px; }
.nc-kosong { text-align: center; padding: 28px 0 !important; }
.nc-filter { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.nc-filter .form-select, .nc-filter .form-input { width: auto; min-width: 200px; }
.nc-filter label { display: flex; align-items: center; gap: 6px; }
.nc-baris { cursor: pointer; }
.nc-baris:hover { background: #f8fafc; }
.nc-status { display: inline-block; font-size: 12px; font-weight: 700; padding: 1px 8px; border: 1px solid; border-radius: 999px; white-space: nowrap; }
.nc-saran { font-size: 12.5px; color: #475569; max-width: 360px; }
.mono { font-family: monospace; }
.nowrap { white-space: nowrap; }
.muted { color: #64748b; font-size: 12px; }
.nc-peta { background: #f8fafc; }
.nc-peta .form-input { max-width: 420px; margin-bottom: 6px; }
.nc-pilih { padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.nc-pilih:hover { background: #dbeafe; }
.nc-halaman { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 10px; }
</style>
