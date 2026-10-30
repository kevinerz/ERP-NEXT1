<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import api from '@/services/api'
import { alertError, confirmDialog, promptDialog } from '@/composables/useDialog'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

interface Blok {
  id_blok: number; prefix: string; asn: string | null; nama: string; catatan: string | null
  jumlah_ip: number; Dipakai: number; Dicadangkan: number; Karantina: number; Tersedia: number
}
interface Zona { id_zona: number; awal: number; akhir: number; prefix: string; nama: string; peruntukan: string; catatan: string | null }
interface Subnet {
  prefix: string; netmask: string; network: string; broadcast: string | null
  host_pertama: string; host_terakhir: string; jumlah_ip: number; jumlah_host: number
}
interface Alokasi {
  id_alokasi: number; awal: number; akhir: number; prefix: string; status: string; peruntukan: string
  id_site: number | null; gateway: string | null; vlan: number | null; perangkat: string | null; keterangan: string | null
  karantina_sampai: string | null; dialokasikan_at: string; subnet: Subnet
  site: { id_site: number; kode_site: string; nama_site: string; status_site: string; pelanggan: { id_pelanggan: number; nama_pelanggan: string } | null } | null
}
interface SiteCari { id_site: number; kode_site: string; nama_site: string; kota: string | null; status_site: string; pelanggan: { nama_pelanggan: string } | null }
interface Riwayat { id_riwayat: number; aksi: string; detail: string | null; nama_karyawan: string | null; created_at: string }

const PERUNTUKAN = ['Pelanggan', 'Infrastruktur', 'Server', 'Cadangan']
const WARNA_ZONA: Record<string, string> = { Infrastruktur: '#ede9fe', Server: '#e0f2fe', Pelanggan: '#f0fdf4', Cadangan: '#f8fafc' }
const PANJANG = [32, 31, 30, 29, 28, 27, 26, 25, 24]

const daftarBlok = ref<Blok[]>([])
const idBlok = ref<number | null>(null)
const blok = ref<(Blok & { network: string }) | null>(null)
const zona = ref<Zona[]>([])
const alokasi = ref<Alokasi[]>([])
const memuat = ref(false)
const error = ref('')
const bolehKelolaBlok = computed(() => ['Admin', 'Director', 'Manager_Ops'].some((r) => auth.hasRole(r)))

async function muatDaftar() {
  const { data } = await api.get('/ipam/blok')
  daftarBlok.value = data.data
  if (!idBlok.value && daftarBlok.value.length) idBlok.value = daftarBlok.value[0].id_blok
}
async function muatBlok() {
  if (!idBlok.value) return
  memuat.value = true
  error.value = ''
  try {
    const { data } = await api.get(`/ipam/blok/${idBlok.value}`)
    blok.value = { ...(daftarBlok.value.find((b) => b.id_blok === idBlok.value) as Blok), ...data.data.blok }
    zona.value = data.data.zona
    alokasi.value = data.data.alokasi
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Gagal memuat data IP'
  } finally {
    memuat.value = false
  }
}
async function muatUlang() {
  await muatDaftar()
  await muatBlok()
}
onMounted(async () => {
  try { await muatDaftar() } catch (e: any) { error.value = e?.response?.data?.message || 'Gagal memuat data IP' }
})
watch(idBlok, muatBlok)

// ── Hitung IP (sisi tampilan) ────────────────────────────────────────────────
function ipKeAngka(ip: string): number | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const o = m.slice(1).map(Number)
  if (o.some((x) => x > 255)) return null
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0
}
const angkaKeIp = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
const networkBlok = computed(() => (blok.value ? ipKeAngka(blok.value.network) ?? 0 : 0))
const ipOffset = (o: number) => angkaKeIp(networkBlok.value + o)

// ── Grid ─────────────────────────────────────────────────────────────────────
const alokasiPerOffset = computed(() => {
  const m = new Map<number, Alokasi>()
  for (const a of alokasi.value) for (let o = a.awal; o <= a.akhir; o++) m.set(o, a)
  return m
})
const zonaPerOffset = (o: number) => zona.value.find((z) => z.awal <= o && z.akhir >= o)
const sel = computed(() => {
  const n = Math.min(blok.value?.jumlah_ip ?? 0, 1024)
  return Array.from({ length: n }, (_, o) => {
    const a = alokasiPerOffset.value.get(o)
    const z = zonaPerOffset(o)
    return {
      o, a, z,
      label: n <= 256 ? String((networkBlok.value + o) & 255) : ipOffset(o).split('.').slice(2).join('.'),
      // garis tebal di awal / akhir sub-blok supaya batas alokasi terlihat
      awal: a && a.awal === o && a.akhir > a.awal, akhir: a && a.akhir === o && a.akhir > a.awal,
      judul: `${ipOffset(o)}${a ? ` · ${a.prefix} · ${a.status}${a.site ? ` · ${a.site.nama_site}` : a.keterangan ? ` · ${a.keterangan}` : ''}` : ' · Tersedia'}${z ? `\nZona: ${z.nama}` : ''}`,
    }
  })
})
const kolomGrid = computed(() => ((blok.value?.jumlah_ip ?? 0) >= 256 ? 16 : 8))
const ipTerpilih = ref<number | null>(null)

function klikSel(o: number) {
  ipTerpilih.value = o
  const a = alokasiPerOffset.value.get(o)
  if (a) bukaDetail(a)
  else bukaForm(o)
}

// ── Daftar alokasi ───────────────────────────────────────────────────────────
const cari = ref('')
const filterStatus = ref('')
const daftarTampil = computed(() => {
  const q = cari.value.trim().toLowerCase()
  return alokasi.value.filter((a) => {
    if (filterStatus.value && a.status !== filterStatus.value) return false
    if (!q) return true
    return [a.prefix, a.site?.nama_site, a.site?.kode_site, a.site?.pelanggan?.nama_pelanggan, a.keterangan, a.perangkat, a.gateway, a.peruntukan]
      .some((x) => x?.toLowerCase().includes(q))
  })
})
const fmtTgl = (d: string | null) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')
const fmtWaktu = (d: string) => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const KELAS_STATUS: Record<string, string> = { Dipakai: 'badge-blue', Dicadangkan: 'badge-amber', Karantina: 'badge-red' }

// ── Cari site (dipakai form alokasi & detail) ────────────────────────────────
function pencariSite() {
  const s = reactive({ teks: '', hasil: [] as SiteCari[], mencari: false, dipilih: null as SiteCari | null })
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(() => s.teks, (q) => {
    if (timer) clearTimeout(timer)
    if (s.dipilih && q === s.dipilih.nama_site) return
    s.dipilih = null
    if (q.trim().length < 2) { s.hasil = []; return }
    timer = setTimeout(async () => {
      s.mencari = true
      try {
        const { data } = await api.get('/ipam/site/cari', { params: { q: q.trim() } })
        if (s.teks === q) s.hasil = data.data
      } finally {
        s.mencari = false
      }
    }, 300)
  })
  function pilih(x: SiteCari) {
    s.dipilih = x
    s.teks = x.nama_site
    s.hasil = []
  }
  function kosongkan() {
    s.dipilih = null
    s.teks = ''
    s.hasil = []
  }
  return { s, pilih, kosongkan }
}

// ── Form alokasi baru ────────────────────────────────────────────────────────
const form = reactive({
  buka: false, peruntukan: 'Pelanggan', panjang: 32, prefix: '', status: 'Dipakai',
  gateway: '', vlan: '' as string | number, perangkat: '', keterangan: '', zonaSaran: '' as string | null, simpan: false, err: '',
})
const siteForm = pencariSite()
let dariSel = false

function bukaForm(o?: number) {
  const z = o !== undefined ? zonaPerOffset(o) : null
  Object.assign(form, {
    buka: true, peruntukan: z?.peruntukan || 'Pelanggan', panjang: 32, status: 'Dipakai',
    gateway: '', vlan: '', perangkat: '', keterangan: '', zonaSaran: null, err: '',
    prefix: o !== undefined ? `${ipOffset(o)}/32` : '',
  })
  siteForm.kosongkan()
  dariSel = o !== undefined
  if (!dariSel) saran()
}
// Ganti panjang: dari sel → sub-blok yang memuat IP itu; dari tombol → saran berikutnya
watch(() => [form.panjang, form.peruntukan], () => {
  if (!form.buka) return
  if (dariSel && ipTerpilih.value !== null) {
    const ukuran = 2 ** (32 - form.panjang)
    form.prefix = `${ipOffset(Math.floor(ipTerpilih.value / ukuran) * ukuran)}/${form.panjang}`
    form.zonaSaran = null
  } else saran()
})
async function saran() {
  if (!idBlok.value) return
  try {
    const { data } = await api.get(`/ipam/blok/${idBlok.value}/saran`, { params: { panjang: form.panjang, peruntukan: form.peruntukan } })
    form.prefix = data.data?.prefix || ''
    form.zonaSaran = data.data ? data.data.zona : null
    if (!data.data) form.err = `Tidak ada /${form.panjang} kosong di blok ini`
    else form.err = ''
  } catch { /* biarkan isi manual */ }
}
const infoForm = computed(() => {
  const [ip, p] = form.prefix.split('/')
  const n = ipKeAngka(ip || '')
  const panjang = Number(p ?? 32)
  if (n === null || !(panjang >= 24 && panjang <= 32)) return null
  const jumlah = 2 ** (32 - panjang)
  if (n % jumlah !== 0) return { salah: `Bukan alamat network /${panjang} — seharusnya ${angkaKeIp(n - (n % jumlah))}/${panjang}` }
  return {
    salah: '',
    host: panjang >= 31 ? `${angkaKeIp(n)} – ${angkaKeIp(n + jumlah - 1)}` : `${angkaKeIp(n + 1)} – ${angkaKeIp(n + jumlah - 2)}`,
    usulGateway: panjang <= 30 ? angkaKeIp(n + 1) : '',
  }
})
async function simpanForm() {
  if (!idBlok.value) return
  form.simpan = true
  form.err = ''
  try {
    await api.post('/ipam/alokasi', {
      id_blok: idBlok.value, prefix: form.prefix.trim(), status: form.status, peruntukan: form.peruntukan,
      id_site: siteForm.s.dipilih?.id_site, gateway: form.gateway.trim() || undefined,
      vlan: form.vlan === '' ? undefined : Number(form.vlan), perangkat: form.perangkat.trim() || undefined, keterangan: form.keterangan.trim() || undefined,
    })
    form.buka = false
    await muatUlang()
  } catch (e: any) {
    const m = e?.response?.data?.message
    form.err = Array.isArray(m) ? m.join(', ') : m || 'Gagal menyimpan'
  } finally {
    form.simpan = false
  }
}

// ── Detail / ubah / lepas ────────────────────────────────────────────────────
const detail = ref<Alokasi | null>(null)
const ubah = reactive({ status: '', peruntukan: '', gateway: '', vlan: '' as string | number, perangkat: '', keterangan: '', hapusSite: false, simpan: false, err: '' })
const siteUbah = pencariSite()
const riwayat = ref<Riwayat[]>([])
const tersalin = ref('')

async function bukaDetail(a: Alokasi) {
  detail.value = a
  Object.assign(ubah, {
    status: a.status, peruntukan: a.peruntukan, gateway: a.gateway || '', vlan: a.vlan ?? '', perangkat: a.perangkat || '',
    keterangan: a.keterangan || '', hapusSite: false, simpan: false, err: '',
  })
  siteUbah.kosongkan()
  riwayat.value = []
  tersalin.value = ''
  try {
    const { data } = await api.get(`/ipam/alokasi/${a.id_alokasi}/riwayat`)
    riwayat.value = data.data
  } catch { /* abaikan */ }
}
async function simpanUbah() {
  const a = detail.value
  if (!a) return
  ubah.simpan = true
  ubah.err = ''
  try {
    const body: any = {
      peruntukan: ubah.peruntukan, gateway: ubah.gateway, vlan: ubah.vlan === '' ? null : Number(ubah.vlan),
      perangkat: ubah.perangkat, keterangan: ubah.keterangan,
    }
    if (a.status !== 'Karantina' && ubah.status !== a.status) body.status = ubah.status
    if (siteUbah.s.dipilih) body.id_site = siteUbah.s.dipilih.id_site
    else if (ubah.hapusSite) body.id_site = null
    await api.patch(`/ipam/alokasi/${a.id_alokasi}`, body)
    await muatUlang()
    const baru = alokasi.value.find((x) => x.id_alokasi === a.id_alokasi)
    if (baru) await bukaDetail(baru)
  } catch (e: any) {
    const m = e?.response?.data?.message
    ubah.err = Array.isArray(m) ? m.join(', ') : m || 'Gagal menyimpan'
  } finally {
    ubah.simpan = false
  }
}
async function lepas(langsung: boolean) {
  const a = detail.value
  if (!a) return
  const pakaiKarantina = !langsung && a.status === 'Dipakai'
  const alasan = await promptDialog({
    title: pakaiKarantina ? `Lepas ${a.prefix} (karantina 30 hari)` : `Lepas ${a.prefix} sekarang`,
    message: pakaiKarantina
      ? 'IP tidak bisa dialokasikan selama 30 hari (bekas pelanggan bisa masih tercatat di blacklist / firewall pihak lain). Alasan (opsional):'
      : 'IP langsung tersedia untuk dialokasikan lagi. Alasan (opsional):',
    confirmLabel: 'Lepas', variant: pakaiKarantina ? 'warning' : 'danger',
  })
  if (alasan === null) return
  try {
    await api.post(`/ipam/alokasi/${a.id_alokasi}/lepas`, { langsung, alasan: alasan || undefined })
    detail.value = null
    await muatUlang()
  } catch (e) {
    alertError(e, 'Gagal melepas IP')
  }
}
async function salin(teks: string) {
  try {
    await navigator.clipboard.writeText(teks)
    tersalin.value = teks
  } catch { /* clipboard ditolak */ }
}

// ── Riwayat satu IP ──────────────────────────────────────────────────────────
const riwayatIp = ref<{ ip: string; list: any[] } | null>(null)
async function lihatRiwayatIp(o: number) {
  if (!idBlok.value) return
  const ip = ipOffset(o)
  try {
    const { data } = await api.get(`/ipam/blok/${idBlok.value}/riwayat-ip`, { params: { ip } })
    riwayatIp.value = { ip, list: data.data }
  } catch (e) {
    alertError(e, 'Gagal memuat riwayat IP')
  }
}

// ── Zona (rencana pembagian) ─────────────────────────────────────────────────
const kelolaZona = ref(false)
const formZona = reactive({ id_zona: null as number | null, prefix: '', nama: '', peruntukan: 'Pelanggan', catatan: '', err: '', simpan: false })
function editZona(z?: Zona) {
  Object.assign(formZona, z
    ? { id_zona: z.id_zona, prefix: z.prefix, nama: z.nama, peruntukan: z.peruntukan, catatan: z.catatan || '', err: '' }
    : { id_zona: null, prefix: '', nama: '', peruntukan: 'Pelanggan', catatan: '', err: '' })
}
async function simpanZona() {
  if (!idBlok.value) return
  formZona.simpan = true
  formZona.err = ''
  try {
    const body = { prefix: formZona.prefix.trim(), nama: formZona.nama.trim(), peruntukan: formZona.peruntukan, catatan: formZona.catatan.trim() || undefined }
    if (formZona.id_zona) await api.patch(`/ipam/zona/${formZona.id_zona}`, body)
    else await api.post(`/ipam/blok/${idBlok.value}/zona`, body)
    editZona()
    await muatBlok()
  } catch (e: any) {
    const m = e?.response?.data?.message
    formZona.err = Array.isArray(m) ? m.join(', ') : m || 'Gagal menyimpan zona'
  } finally {
    formZona.simpan = false
  }
}
async function hapusZona(z: Zona) {
  if (!(await confirmDialog({ title: 'Hapus zona?', message: `${z.nama} (${z.prefix}). Alokasi IP di dalamnya tidak ikut terhapus.`, confirmLabel: 'Hapus', variant: 'danger' }))) return
  await api.delete(`/ipam/zona/${z.id_zona}`)
  await muatBlok()
}

// ── Blok baru ────────────────────────────────────────────────────────────────
const formBlok = reactive({ buka: false, prefix: '', asn: 'AS155058', nama: '', err: '', simpan: false })
async function simpanBlok() {
  formBlok.simpan = true
  formBlok.err = ''
  try {
    const { data } = await api.post('/ipam/blok', { prefix: formBlok.prefix.trim(), asn: formBlok.asn.trim() || undefined, nama: formBlok.nama.trim() })
    formBlok.buka = false
    idBlok.value = data.data.id_blok
    await muatUlang()
  } catch (e: any) {
    const m = e?.response?.data?.message
    formBlok.err = Array.isArray(m) ? m.join(', ') : m || 'Gagal menyimpan blok'
  } finally {
    formBlok.simpan = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">🌐 IP Publik</h2>
        <p class="page-subtitle">
          <template v-if="blok">{{ blok.prefix }}<template v-if="blok.asn"> · {{ blok.asn }}</template> · {{ blok.nama }}</template>
          <template v-else>Pencatatan IP publik NEXT1</template>
        </p>
      </div>
      <div class="ipam-aksi-atas">
        <select v-if="daftarBlok.length > 1" v-model="idBlok" class="filter-select">
          <option v-for="b in daftarBlok" :key="b.id_blok" :value="b.id_blok">{{ b.prefix }} — {{ b.nama }}</option>
        </select>
        <button v-if="bolehKelolaBlok" type="button" class="btn btn-ghost" @click="Object.assign(formBlok, { buka: true, prefix: '', nama: '', err: '' })">+ Blok</button>
        <button v-if="blok" type="button" class="btn btn-secondary" @click="kelolaZona = true; editZona()">🗂️ Rencana blok</button>
        <button v-if="blok" type="button" class="btn btn-primary" @click="ipTerpilih = null; bukaForm()">+ Alokasi IP</button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="!memuat && !daftarBlok.length && !error" class="alert alert-info">Belum ada blok IP. Tambahkan blok (mis. 180.214.165.0/24).</div>

    <template v-if="blok">
      <!-- Ringkasan -->
      <div class="ipam-ringkas">
        <div class="ipam-kartu"><b>{{ blok.Tersedia }}</b><span>Tersedia</span></div>
        <div class="ipam-kartu biru"><b>{{ blok.Dipakai }}</b><span>Dipakai</span></div>
        <div class="ipam-kartu kuning"><b>{{ blok.Dicadangkan }}</b><span>Dicadangkan</span></div>
        <div class="ipam-kartu merah"><b>{{ blok.Karantina }}</b><span>Karantina</span></div>
        <div class="ipam-kartu"><b>{{ blok.jumlah_ip }}</b><span>Total IP</span></div>
      </div>

      <div class="ipam-utama">
        <!-- Grid IP -->
        <div class="table-card ipam-grid-kartu">
          <div class="ipam-legenda">
            <span><i class="kotak tersedia"></i>Tersedia</span>
            <span><i class="kotak dipakai"></i>Dipakai</span>
            <span><i class="kotak dicadangkan"></i>Dicadangkan</span>
            <span><i class="kotak karantina"></i>Karantina</span>
          </div>
          <div class="ipam-grid" :style="{ gridTemplateColumns: `repeat(${kolomGrid}, 1fr)` }">
            <button
              v-for="c in sel" :key="c.o" type="button" class="ipam-sel"
              :class="[c.a ? c.a.status.toLowerCase() : 'tersedia', { 'awal-blok': c.awal, 'akhir-blok': c.akhir, terpilih: ipTerpilih === c.o }]"
              :style="!c.a && c.z ? { background: WARNA_ZONA[c.z.peruntukan] } : undefined"
              :title="c.judul" @click="klikSel(c.o)"
            >{{ c.label }}</button>
          </div>
          <p v-if="(blok.jumlah_ip ?? 0) > 1024" class="muted kecil">Grid hanya menampilkan 1024 IP pertama.</p>
        </div>

        <!-- Rencana zona -->
        <div class="table-card ipam-zona">
          <h4>Rencana blok</h4>
          <p v-if="!zona.length" class="muted kecil">Belum ada rencana pembagian.</p>
          <div v-for="z in zona" :key="z.id_zona" class="ipam-zona-baris" :style="{ borderLeftColor: '#94a3b8', background: WARNA_ZONA[z.peruntukan] }">
            <b>{{ z.prefix }}</b>
            <span>{{ z.nama }}</span>
            <small class="muted">{{ z.peruntukan }} · {{ z.akhir - z.awal + 1 }} IP · terpakai {{ alokasi.filter((a) => a.awal >= z.awal && a.akhir <= z.akhir).reduce((n, a) => n + a.akhir - a.awal + 1, 0) }}</small>
          </div>
          <h4 class="ipam-h4-jarak">Wajib di luar ERP</h4>
          <ul class="ipam-cek">
            <li>RPKI ROA di MyAPNIC (origin {{ blok.asn || 'ASN' }}, max-length /24)</li>
            <li>Route object (IRR) di whois APNIC</li>
            <li>Reverse DNS untuk blok ini</li>
            <li>Kontak abuse di whois aktif</li>
          </ul>
        </div>
      </div>

      <!-- Tabel alokasi -->
      <div class="filter-bar">
        <input v-model="cari" class="search-input" placeholder="Cari IP, site, pelanggan, perangkat…" />
        <select v-model="filterStatus" class="filter-select">
          <option value="">Semua status</option>
          <option>Dipakai</option><option>Dicadangkan</option><option>Karantina</option>
        </select>
      </div>
      <div class="table-card">
        <div v-if="memuat" class="loading-state">Memuat…</div>
        <table v-else class="data-table">
          <thead>
            <tr><th>Prefix</th><th>Status</th><th>Peruntukan</th><th>Site / Pelanggan</th><th>Gateway</th><th>VLAN</th><th>Perangkat</th><th>Sejak</th></tr>
          </thead>
          <tbody>
            <tr v-if="!daftarTampil.length"><td colspan="8" class="muted pusat">Belum ada alokasi.</td></tr>
            <tr v-for="a in daftarTampil" :key="a.id_alokasi" class="klik" @click="bukaDetail(a)">
              <td><b class="mono">{{ a.prefix }}</b></td>
              <td>
                <span class="badge" :class="KELAS_STATUS[a.status]">{{ a.status }}</span>
                <small v-if="a.status === 'Karantina'" class="muted"> s/d {{ fmtTgl(a.karantina_sampai) }}</small>
              </td>
              <td>{{ a.peruntukan }}</td>
              <td>
                <template v-if="a.site">{{ a.site.nama_site }} <small class="muted">{{ a.site.pelanggan?.nama_pelanggan }}</small></template>
                <span v-else class="muted">{{ a.keterangan || '-' }}</span>
              </td>
              <td class="mono">{{ a.gateway || '-' }}</td>
              <td>{{ a.vlan ?? '-' }}</td>
              <td>{{ a.perangkat || '-' }}</td>
              <td>{{ fmtTgl(a.dialokasikan_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Modal: alokasi baru -->
    <div v-if="form.buka" class="modal-overlay" @click.self="form.buka = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Alokasi IP</h3>
          <button type="button" class="btn-modal-close" @click="form.buka = false">×</button>
        </div>
        <div class="modal-body ipam-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Peruntukan</label>
              <select v-model="form.peruntukan" class="form-select"><option v-for="p in PERUNTUKAN" :key="p">{{ p }}</option></select>
            </div>
            <div class="form-group">
              <label class="form-label">Ukuran</label>
              <select v-model.number="form.panjang" class="form-select">
                <option v-for="p in PANJANG" :key="p" :value="p">/{{ p }} — {{ 2 ** (32 - p) }} IP{{ p === 32 ? ' (IP tunggal)' : p === 30 ? ' (2 host)' : p === 29 ? ' (6 host)' : '' }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label form-required">Prefix</label>
            <div class="ipam-baris">
              <input v-model="form.prefix" class="form-input mono" placeholder="180.214.165.130/32" />
              <button type="button" class="btn btn-ghost btn-sm" @click="dariSel = false; saran()">↻ Saran kosong</button>
            </div>
            <small v-if="form.zonaSaran" class="muted">Dari zona: {{ form.zonaSaran }}</small>
            <small v-if="infoForm?.salah" class="teks-merah">{{ infoForm.salah }}</small>
            <small v-else-if="infoForm?.host" class="muted">Host: {{ infoForm.host }}</small>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Status</label>
              <select v-model="form.status" class="form-select"><option>Dipakai</option><option>Dicadangkan</option></select>
            </div>
            <div class="form-group">
              <label class="form-label">Gateway</label>
              <div class="ipam-baris">
                <input v-model="form.gateway" class="form-input mono" placeholder="opsional" />
                <button v-if="infoForm?.usulGateway && !form.gateway" type="button" class="btn btn-ghost btn-sm" @click="form.gateway = infoForm.usulGateway">{{ infoForm.usulGateway }}</button>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Site pelanggan <small class="muted">(kosongkan untuk infrastruktur / server)</small></label>
            <div class="ipam-dropdown">
              <input v-model="siteForm.s.teks" class="form-input" placeholder="Cari nama / kode site / pelanggan…" />
              <ul v-if="siteForm.s.hasil.length || siteForm.s.mencari" class="ipam-dropdown-list">
                <li v-if="siteForm.s.mencari" class="muted">Mencari…</li>
                <li v-for="x in siteForm.s.hasil" :key="x.id_site" @click="siteForm.pilih(x)">
                  <b>{{ x.nama_site }}</b>
                  <small>{{ x.kode_site }}<template v-if="x.pelanggan"> · {{ x.pelanggan.nama_pelanggan }}</template> · {{ x.status_site }}</small>
                </li>
              </ul>
            </div>
            <small v-if="siteForm.s.dipilih" class="teks-hijau">✓ {{ siteForm.s.dipilih.kode_site }} · {{ siteForm.s.dipilih.pelanggan?.nama_pelanggan }}</small>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">VLAN</label>
              <input v-model="form.vlan" type="number" min="1" max="4094" class="form-input" placeholder="opsional" />
            </div>
            <div class="form-group">
              <label class="form-label">Perangkat / interface</label>
              <input v-model="form.perangkat" maxlength="150" class="form-input" placeholder="mis. BRAS-JKT ether5" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Keterangan</label>
            <input v-model="form.keterangan" class="form-input" placeholder="mis. Gateway core, server ERP, mail server pelanggan" />
          </div>
          <div v-if="form.err" class="alert alert-danger">{{ form.err }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" @click="form.buka = false">Batal</button>
          <button type="button" class="btn btn-primary" :disabled="form.simpan || !form.prefix.trim() || !!infoForm?.salah" @click="simpanForm">{{ form.simpan ? 'Menyimpan…' : 'Simpan' }}</button>
        </div>
      </div>
    </div>

    <!-- Modal: detail alokasi -->
    <div v-if="detail" class="modal-overlay" @click.self="detail = null">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3 class="modal-title"><span class="mono">{{ detail.prefix }}</span> <span class="badge" :class="KELAS_STATUS[detail.status]">{{ detail.status }}</span></h3>
          <button type="button" class="btn-modal-close" @click="detail = null">×</button>
        </div>
        <div class="modal-body ipam-form">
          <div v-if="detail.status === 'Karantina'" class="alert alert-warning">Karantina sampai {{ fmtTgl(detail.karantina_sampai) }} — setelah itu otomatis tersedia lagi.</div>
          <div class="ipam-subnet">
            <div v-for="[k, v] in ([['Netmask', detail.subnet.netmask], ['Network', detail.subnet.network], ['Host', `${detail.subnet.host_pertama} – ${detail.subnet.host_terakhir}`], ['Broadcast', detail.subnet.broadcast], ['Jumlah host', String(detail.subnet.jumlah_host)]] as [string, string | null][])" :key="k">
              <template v-if="v">
                <small class="muted">{{ k }}</small>
                <span class="mono klik" title="Klik untuk salin" @click="salin(v)">{{ v }}<template v-if="tersalin === v"> ✓</template></span>
              </template>
            </div>
          </div>
          <p v-if="detail.site">
            📍 <RouterLink :to="`/master/site/${detail.site.id_site}`">{{ detail.site.nama_site }}</RouterLink>
            <small class="muted"> {{ detail.site.kode_site }} · {{ detail.site.pelanggan?.nama_pelanggan }} · {{ detail.site.status_site }}</small>
          </p>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Status</label>
              <select v-model="ubah.status" class="form-select" :disabled="detail.status === 'Karantina'">
                <option>Dipakai</option><option>Dicadangkan</option><option v-if="detail.status === 'Karantina'">Karantina</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Peruntukan</label>
              <select v-model="ubah.peruntukan" class="form-select"><option v-for="p in PERUNTUKAN" :key="p">{{ p }}</option></select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">{{ detail.site ? 'Pindah ke site lain' : 'Tautkan ke site' }}</label>
            <div class="ipam-dropdown">
              <input v-model="siteUbah.s.teks" class="form-input" placeholder="Cari nama / kode site / pelanggan…" />
              <ul v-if="siteUbah.s.hasil.length || siteUbah.s.mencari" class="ipam-dropdown-list">
                <li v-if="siteUbah.s.mencari" class="muted">Mencari…</li>
                <li v-for="x in siteUbah.s.hasil" :key="x.id_site" @click="siteUbah.pilih(x)">
                  <b>{{ x.nama_site }}</b>
                  <small>{{ x.kode_site }}<template v-if="x.pelanggan"> · {{ x.pelanggan.nama_pelanggan }}</template> · {{ x.status_site }}</small>
                </li>
              </ul>
            </div>
            <label v-if="detail.site && !siteUbah.s.dipilih" class="ipam-centang"><input v-model="ubah.hapusSite" type="checkbox" /> Lepas tautan dari site ini</label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Gateway</label>
              <input v-model="ubah.gateway" class="form-input mono" />
            </div>
            <div class="form-group">
              <label class="form-label">VLAN</label>
              <input v-model="ubah.vlan" type="number" min="1" max="4094" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Perangkat / interface</label>
            <input v-model="ubah.perangkat" maxlength="150" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Keterangan</label>
            <input v-model="ubah.keterangan" class="form-input" />
          </div>
          <div v-if="ubah.err" class="alert alert-danger">{{ ubah.err }}</div>

          <h4 class="ipam-h4-jarak">Riwayat</h4>
          <ul class="ipam-riwayat">
            <li v-for="r in riwayat" :key="r.id_riwayat">
              <b>{{ r.aksi }}</b> <span>{{ r.detail }}</span>
              <small class="muted">{{ fmtWaktu(r.created_at) }} · {{ r.nama_karyawan || 'sistem' }}</small>
            </li>
            <li v-if="!riwayat.length" class="muted">—</li>
          </ul>
          <button type="button" class="btn btn-ghost btn-sm" @click="lihatRiwayatIp(detail.awal)">Riwayat pemakaian IP {{ ipOffset(detail.awal) }} sebelumnya</button>
        </div>
        <div class="modal-footer ipam-footer">
          <div>
            <button v-if="detail.status === 'Dipakai'" type="button" class="btn btn-secondary" @click="lepas(false)">Lepas (karantina 30 hari)</button>
            <button type="button" class="btn btn-danger" @click="lepas(true)">{{ detail.status === 'Karantina' ? 'Akhiri karantina' : 'Lepas langsung' }}</button>
          </div>
          <div>
            <button type="button" class="btn btn-ghost" @click="detail = null">Tutup</button>
            <button type="button" class="btn btn-primary" :disabled="ubah.simpan" @click="simpanUbah">{{ ubah.simpan ? 'Menyimpan…' : 'Simpan' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: riwayat satu IP -->
    <div v-if="riwayatIp" class="modal-overlay" @click.self="riwayatIp = null">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Riwayat <span class="mono">{{ riwayatIp.ip }}</span></h3>
          <button type="button" class="btn-modal-close" @click="riwayatIp = null">×</button>
        </div>
        <div class="modal-body">
          <p v-if="!riwayatIp.list.length" class="muted">Belum pernah dialokasikan.</p>
          <div v-for="a in riwayatIp.list" :key="a.id_alokasi" class="ipam-riwayat-ip">
            <b class="mono">{{ a.prefix }}</b> <span class="badge" :class="KELAS_STATUS[a.status] || 'badge-gray'">{{ a.status }}</span>
            <span v-if="a.site"> · {{ a.site.nama_site }}</span>
            <small class="muted"> · {{ fmtTgl(a.dialokasikan_at) }} – {{ a.dilepas_at ? fmtTgl(a.dilepas_at) : 'sekarang' }}</small>
            <ul class="ipam-riwayat">
              <li v-for="r in a.riwayat" :key="r.id_riwayat"><b>{{ r.aksi }}</b> {{ r.detail }} <small class="muted">{{ fmtWaktu(r.created_at) }} · {{ r.nama_karyawan || 'sistem' }}</small></li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: rencana blok (zona) -->
    <div v-if="kelolaZona" class="modal-overlay" @click.self="kelolaZona = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3 class="modal-title">Rencana pembagian {{ blok?.prefix }}</h3>
          <button type="button" class="btn-modal-close" @click="kelolaZona = false">×</button>
        </div>
        <div class="modal-body ipam-form">
          <table class="data-table">
            <thead><tr><th>Prefix</th><th>Nama</th><th>Peruntukan</th><th></th></tr></thead>
            <tbody>
              <tr v-for="z in zona" :key="z.id_zona">
                <td class="mono">{{ z.prefix }}</td><td>{{ z.nama }}</td><td>{{ z.peruntukan }}</td>
                <td class="kanan">
                  <button type="button" class="btn btn-ghost btn-sm" @click="editZona(z)">Ubah</button>
                  <button type="button" class="btn btn-ghost btn-sm" @click="hapusZona(z)">Hapus</button>
                </td>
              </tr>
            </tbody>
          </table>
          <h4 class="ipam-h4-jarak">{{ formZona.id_zona ? 'Ubah zona' : 'Tambah zona' }}</h4>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label form-required">Prefix</label>
              <input v-model="formZona.prefix" class="form-input mono" placeholder="180.214.165.64/26" />
            </div>
            <div class="form-group">
              <label class="form-label">Peruntukan</label>
              <select v-model="formZona.peruntukan" class="form-select"><option v-for="p in PERUNTUKAN" :key="p">{{ p }}</option></select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label form-required">Nama</label>
            <input v-model="formZona.nama" maxlength="100" class="form-input" placeholder="mis. Pelanggan blok (/29, /30)" />
          </div>
          <div v-if="formZona.err" class="alert alert-danger">{{ formZona.err }}</div>
        </div>
        <div class="modal-footer">
          <button v-if="formZona.id_zona" type="button" class="btn btn-ghost" @click="editZona()">Batal ubah</button>
          <button type="button" class="btn btn-primary" :disabled="formZona.simpan || !formZona.prefix.trim() || !formZona.nama.trim()" @click="simpanZona">{{ formZona.simpan ? 'Menyimpan…' : formZona.id_zona ? 'Simpan zona' : 'Tambah zona' }}</button>
        </div>
      </div>
    </div>

    <!-- Modal: blok baru -->
    <div v-if="formBlok.buka" class="modal-overlay" @click.self="formBlok.buka = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3 class="modal-title">Tambah blok IP</h3>
          <button type="button" class="btn-modal-close" @click="formBlok.buka = false">×</button>
        </div>
        <div class="modal-body ipam-form">
          <div class="form-group">
            <label class="form-label form-required">Prefix</label>
            <input v-model="formBlok.prefix" class="form-input mono" placeholder="180.214.166.0/24" />
          </div>
          <div class="form-group">
            <label class="form-label">ASN</label>
            <input v-model="formBlok.asn" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label form-required">Nama</label>
            <input v-model="formBlok.nama" maxlength="100" class="form-input" placeholder="mis. Blok kedua" />
          </div>
          <div v-if="formBlok.err" class="alert alert-danger">{{ formBlok.err }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" @click="formBlok.buka = false">Batal</button>
          <button type="button" class="btn btn-primary" :disabled="formBlok.simpan || !formBlok.prefix.trim() || !formBlok.nama.trim()" @click="simpanBlok">Simpan</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ipam-aksi-atas { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ipam-ringkas { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.ipam-kartu { background: #fff; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; }
.ipam-kartu b { font-size: 22px; line-height: 1.2; }
.ipam-kartu span { font-size: 12px; color: var(--text-3, #64748b); }
.ipam-kartu.biru b { color: #2563eb; }
.ipam-kartu.kuning b { color: #d97706; }
.ipam-kartu.merah b { color: #dc2626; }
.ipam-utama { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; margin-bottom: 14px; align-items: start; }
.ipam-grid-kartu { padding: 14px; }
.ipam-legenda { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--text-3, #64748b); margin-bottom: 10px; }
.ipam-legenda span { display: inline-flex; align-items: center; gap: 5px; }
.kotak { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid #cbd5e1; }
.ipam-grid { display: grid; gap: 3px; }
.ipam-sel {
  min-width: 0; padding: 6px 0; font-size: 11px; font-family: ui-monospace, monospace; text-align: center;
  border: 1px solid #e2e8f0; border-radius: 4px; background: #fff; color: #334155; cursor: pointer;
}
.ipam-sel:hover { outline: 2px solid #64748b; outline-offset: -1px; }
.ipam-sel.terpilih { outline: 2px solid #0f172a; outline-offset: -1px; }
.kotak.tersedia { background: #fff; }
.ipam-sel.dipakai, .kotak.dipakai { background: #2563eb; border-color: #1d4ed8; color: #fff; }
.ipam-sel.dicadangkan, .kotak.dicadangkan { background: #fbbf24; border-color: #d97706; color: #422006; }
.ipam-sel.karantina, .kotak.karantina { background: repeating-linear-gradient(45deg, #fecaca, #fecaca 4px, #fca5a5 4px, #fca5a5 8px); border-color: #ef4444; color: #7f1d1d; }
.ipam-sel.awal-blok { border-left: 3px solid #0f172a; }
.ipam-sel.akhir-blok { border-right: 3px solid #0f172a; }
.ipam-zona { padding: 14px; }
.ipam-zona h4, .ipam-h4-jarak { font-size: 13px; font-weight: 700; margin: 0 0 8px; }
.ipam-h4-jarak { margin-top: 16px; }
.ipam-zona-baris { display: flex; flex-direction: column; gap: 1px; padding: 6px 10px; border-left: 3px solid; border-radius: 6px; margin-bottom: 6px; font-size: 13px; }
.ipam-cek { margin: 0; padding-left: 18px; font-size: 12px; color: var(--text-3, #64748b); }
.ipam-form { display: flex; flex-direction: column; gap: 12px; }
.ipam-baris { display: flex; gap: 6px; align-items: center; }
.ipam-baris .form-input { flex: 1; }
.ipam-dropdown { position: relative; }
.ipam-dropdown-list {
  position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 2px); max-height: 240px; overflow: auto;
  margin: 0; padding: 4px 0; list-style: none; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 8px 20px rgba(15, 23, 42, .12);
}
.ipam-dropdown-list li { padding: 7px 12px; cursor: pointer; display: flex; flex-direction: column; font-size: 13px; }
.ipam-dropdown-list li:hover { background: #f1f5f9; }
.ipam-dropdown-list small { color: #64748b; }
.ipam-centang { display: flex; gap: 6px; align-items: center; font-size: 12.5px; margin-top: 4px; }
.ipam-subnet { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; padding: 10px; background: #f8fafc; border-radius: 8px; }
.ipam-subnet > div { display: flex; flex-direction: column; }
.ipam-riwayat { margin: 0; padding-left: 18px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.ipam-riwayat small { display: block; }
.ipam-riwayat-ip { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
.ipam-footer { justify-content: space-between; }
.ipam-footer > div { display: flex; gap: 8px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.muted { color: var(--text-3, #64748b); }
.kecil { font-size: 12px; }
.pusat { text-align: center; }
.kanan { text-align: right; white-space: nowrap; }
.klik { cursor: pointer; }
.teks-merah { color: #dc2626; }
.teks-hijau { color: #16a34a; }
@media (max-width: 900px) {
  .ipam-utama { grid-template-columns: 1fr; }
  .ipam-ringkas { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ipam-sel { font-size: 9px; padding: 4px 0; }
}
</style>
