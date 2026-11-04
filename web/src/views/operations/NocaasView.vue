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
const tab = ref<'tiket' | 'pantau' | 'tanpa' | 'belum'>('tiket')
const minMenit = ref(15)
const filterTanpa = ref<'' | 'offline' | 'internet_ok'>('')

async function muat() {
  memuat.value = true
  try { data.value = (await api.get('/nocaas/ringkasan')).data.data } catch (e) { alertError(e) } finally { memuat.value = false }
}
async function sinkronSekarang() {
  sinkron.value = true
  try { await api.post('/nocaas/sinkron'); await muat(); if (tab.value === 'belum') muatBelum() } catch (e) { alertError(e, 'Sinkron gagal') } finally { sinkron.value = false }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { muat(); timer = setInterval(muat, 60_000) })
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
function bukaTab(t: typeof tab.value) { tab.value = t; if (t === 'belum' && !belum.value.length) muatBelum(); if (t === 'pantau') muatPantau() }

// ── Mode pantau: apa kata NOCaaS saat tiket PRTG dibuat (alur tiket tidak diubah) ──
const pantau = ref<any>(null)
async function muatPantau() {
  try { pantau.value = (await api.get('/nocaas/pantau')).data.data } catch (e) { alertError(e) }
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—')
const WARNA_BUKA: Record<string, string> = { ...WARNA, tidak_ada: '#64748b', data_lama: '#64748b' }

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

      <div class="nc-tab">
        <button :class="{ aktif: tab === 'tiket' }" @click="bukaTab('tiket')">Tiket aktif ({{ tiket.length }})</button>
        <button :class="{ aktif: tab === 'pantau' }" @click="bukaTab('pantau')">Mode pantau</button>
        <button :class="{ aktif: tab === 'tanpa' }" @click="bukaTab('tanpa')">Gangguan tanpa tiket ({{ data.tanpa_tiket.length }})</button>
        <button :class="{ aktif: tab === 'belum' }" @click="bukaTab('belum')">Router belum terpetakan ({{ data.pemetaan.belum }})</button>
      </div>

      <!-- Tiket aktif vs NOCaaS -->
      <div v-if="tab === 'tiket'" class="card">
        <p v-if="tiketAlarmPalsu" class="nc-catatan">
          ⚠️ <b>{{ tiketAlarmPalsu }}</b> tiket aktif yang routernya <b>online</b> di NOCaaS — kemungkinan alarm PRTG palsu atau masalah di luar koneksi.
        </p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Tiket</th><th>Site</th><th>Sumber</th><th>Dibuka</th><th>NOCaaS sekarang</th><th>Arti</th></tr></thead>
            <tbody>
              <tr v-if="!tiket.length"><td colspan="6" class="muted">Tidak ada tiket aktif.</td></tr>
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

      <!-- Mode pantau -->
      <div v-else-if="tab === 'pantau'" class="card">
        <p class="nc-catatan">
          <b>Mode pantau aktif</b> — tiket PRTG tetap dibuat seperti biasa. Sistem hanya mencatat status NOCaaS saat tiket dibuat, selama aktif, dan saat selesai.
          Aturan yang diuji: <b>tahan tiket bila router online di NOCaaS</b> (data ≤ 3 menit).
          <template v-if="pantau?.mulai"> Dicatat sejak {{ fmtDateTime(pantau.mulai) }}.</template>
        </p>
        <p v-if="!pantau" class="muted">Memuat…</p>
        <p v-else-if="!pantau.total" class="muted">Belum ada tiket PRTG baru sejak mode pantau aktif.</p>
        <template v-else>
          <div class="nc-ubin">
            <div class="card nc-angka"><b>{{ pantau.total }}</b><small>Tiket PRTG dicatat</small></div>
            <div class="card nc-angka"><span class="nc-titik" :style="{ background: WARNA.online }"></span><b>{{ pantau.ditahan.n }} <small>({{ pct(pantau.ditahan.n, pantau.total) }})</small></b><small>Akan ditahan (router online)</small></div>
            <div class="card nc-angka"><b>{{ pantau.ditahan.pulih_60 }} <small>/ {{ pantau.ditahan.selesai }}</small></b><small>Yang ditahan pulih ≤ 60 menit (tiket palsu terhindar)</small></div>
            <div class="card nc-angka"><span class="nc-titik" :style="{ background: WARNA.offline }"></span><b>{{ pantau.ditahan.kemudian_bermasalah }}</b><small>Ditahan tapi kemudian bermasalah di NOCaaS (risiko)</small></div>
          </div>
          <p class="nc-catatan">
            Yang ditahan: pulih ≤ 15 mnt <b>{{ pantau.ditahan.pulih_15 }}</b> · ≤ 30 mnt <b>{{ pantau.ditahan.pulih_30 }}</b> · ≤ 60 mnt <b>{{ pantau.ditahan.pulih_60 }}</b> ·
            lebih dari 60 mnt <b>{{ pantau.ditahan.lewat_60 }}</b> · median {{ pantau.ditahan.median_menit ?? '—' }} mnt · masih aktif {{ pantau.ditahan.masih_aktif }} · dibuka ulang (flapping) {{ pantau.ditahan.buka_ulang }}.
            Status saat dibuka:
            <template v-for="([k, n], i) in Object.entries(pantau.per_status)" :key="k">{{ i ? ' · ' : ' ' }}{{ k }} <b>{{ n }}</b></template>.
          </p>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Tiket</th><th>Site</th><th>NOCaaS saat dibuka</th><th>Terburuk selama aktif</th><th>Durasi</th><th>Saat selesai</th></tr></thead>
              <tbody>
                <tr v-for="r in pantau.tiket" :key="r.id_ticket" class="nc-baris" :class="{ risiko: r.kemudian_bermasalah }" @click="router.push(`/operations/${r.id_ticket}`)">
                  <td><b class="mono">{{ r.ticket.nomor_tiket }}</b><div class="muted">{{ fmtDateTime(r.ticket.tgl_open) }}</div></td>
                  <td>{{ r.ticket.site?.nama_site }}<div class="muted">{{ r.site_key || '—' }}</div></td>
                  <td>
                    <span class="nc-status" :style="{ color: WARNA_BUKA[r.status_buka], borderColor: WARNA_BUKA[r.status_buka] }">{{ r.label_buka }}</span>
                    <div v-if="r.akan_ditahan" class="muted">akan ditahan</div>
                  </td>
                  <td><span v-if="r.terburuk" class="nc-status" :style="{ color: WARNA[r.terburuk], borderColor: WARNA[r.terburuk] }">{{ r.terburuk }}</span><span v-else class="muted">—</span></td>
                  <td class="nowrap">{{ r.durasi_menit !== null ? r.durasi_menit + ' mnt' : 'masih aktif' }}<div v-if="r.buka_ulang" class="muted">dibuka ulang {{ r.buka_ulang }}×</div></td>
                  <td>{{ r.status_selesai || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>

      <!-- Gangguan di NOCaaS tanpa tiket -->
      <div v-else-if="tab === 'tanpa'" class="card">
        <div class="nc-filter">
          <select v-model="filterTanpa" class="input">
            <option value="">Mati total + VPN putus</option>
            <option value="offline">Mati total saja</option>
            <option value="internet_ok">Internet hidup, VPN putus saja</option>
          </select>
          <label class="muted">Minimal sudah
            <select v-model.number="minMenit" class="input">
              <option :value="0">kapan pun</option><option :value="15">15 menit</option><option :value="60">1 jam</option>
              <option :value="1440">1 hari</option><option :value="10080">7 hari</option>
            </select>
          </label>
          <span class="muted">{{ tanpaTiket.length }} site</span>
        </div>
        <p class="nc-catatan">Router site aktif yang di NOCaaS mati / VPN-nya putus, tapi tidak punya tiket aktif di ERP. Router yang mati berbulan-bulan biasanya site yang sudah tutup — cek status sitenya.</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Site</th><th>Router NOCaaS</th><th>Status</th><th>Sejak</th><th>Internet</th><th>Putus 7 hari</th></tr></thead>
            <tbody>
              <tr v-if="!tanpaTiket.length"><td colspan="6" class="muted">Tidak ada.</td></tr>
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
      <div v-else class="card">
        <p class="nc-catatan">
          Router dicocokkan otomatis ke site lewat:
          <template v-for="(p, i) in data.pemetaan.per_sumber" :key="p.sumber">{{ i ? ' · ' : ' ' }}{{ SUMBER[p.sumber] }} <b>{{ p.n }}</b></template>.
          Sisanya petakan manual — pemetaan manual tidak akan ditimpa sinkronisasi.
        </p>
        <div class="nc-filter">
          <input v-model="cariBelum" class="input" placeholder="Cari nama router / IP tunnel…" @keyup.enter="muatBelum(1)" />
          <button class="btn btn-ghost" @click="muatBelum(1)">Cari</button>
          <span class="muted">{{ belumMeta.total }} router</span>
        </div>
        <div class="table-wrap">
          <table class="table">
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
                    <input v-model="petaCari" class="input" placeholder="Cari site ERP (nama / kode / pelanggan)…" @input="cariSite" />
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
.nc-tab { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.nc-tab button { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-weight: 600; font-size: 13px; }
.nc-tab button.aktif { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
.nc-catatan { font-size: 13px; color: #475569; margin: 0 0 12px; }
.nc-filter { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.nc-filter .input { width: auto; }
.nc-baris { cursor: pointer; }
.nc-baris:hover { background: #f8fafc; }
.nc-baris.risiko { background: #fef2f2; }
.nc-status { display: inline-block; font-size: 12px; font-weight: 700; padding: 1px 8px; border: 1px solid; border-radius: 999px; white-space: nowrap; }
.nc-saran { font-size: 12.5px; color: #475569; max-width: 360px; }
.mono { font-family: monospace; }
.nowrap { white-space: nowrap; }
.muted { color: #64748b; font-size: 12px; }
.nc-peta { background: #f8fafc; }
.nc-peta .input { max-width: 420px; margin-bottom: 6px; }
.nc-pilih { padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.nc-pilih:hover { background: #dbeafe; }
.nc-halaman { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 10px; }
</style>
