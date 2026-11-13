<script setup lang="ts">
// Pencarian global: satu kotak untuk mencari site, pelanggan, tiket, WO, aset/SN, karyawan, invoice,
// kontrak, lead, pasang baru, chat WA, IP router — plus menu halaman. Hasil hanya dari modul yang bisa diakses.
// Pintasan: Ctrl/⌘+K atau "/" untuk fokus, ↑↓ pilih, Enter buka, Esc tutup.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'

interface Item { jenis: string; ikon: string; judul: string; sub?: string; ke: string; lencana?: string }
const router = useRouter()
const auth = useAuthStore()

const q = ref('')
const buka = ref(false)
const memuat = ref(false)
const galat = ref('')
const grup = ref<{ judul: string; items: Item[] }[]>([])
const sorot = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const wadahRef = ref<HTMLElement | null>(null)

// Menu halaman — dicocokkan langsung di browser
const MENU: { t: string; ke: string; i: string; m?: string[]; kata?: string }[] = [
  { t: 'Dashboard', ke: '/dashboard', i: '📊' },
  { t: 'Email', ke: '/email', i: '📧', kata: 'surat inbox' },
  { t: 'WhatsApp', ke: '/whatsapp', i: '💬', m: ['whatsapp'], kata: 'wa chat' },
  { t: 'Tiket gangguan', ke: '/operations', i: '⚡', m: ['operations'], kata: 'tiket gangguan trouble' },
  { t: 'Buat tiket baru', ke: '/operations', i: '➕', m: ['operations'] },
  { t: 'Jadwal visit', ke: '/jadwal-visit', i: '🗓️', m: ['visit'], kata: 'kunjungan teknisi' },
  { t: 'Site pelanggan', ke: '/master/site', i: '📍', m: ['master'], kata: 'lokasi toko cabang' },
  { t: 'Pelanggan', ke: '/master/pelanggan', i: '🏢', m: ['master'], kata: 'customer perusahaan pt' },
  { t: 'Pasang baru', ke: '/pasang-baru', i: '🆕', m: ['pasang-baru', 'sales', 'operations', 'instalasi', 'finance'], kata: 'sph survey order instalasi' },
  { t: 'Sales · Lead', ke: '/sales/lead', i: '💼', m: ['sales'] },
  { t: 'Aset & gudang', ke: '/assets', i: '🖥️', m: ['assets'], kata: 'inventaris stok perangkat' },
  { t: 'Work order', ke: '/public-wo', i: '🗂️', m: ['public-wo'], kata: 'wo' },
  { t: 'NOC Board', ke: '/operations/noc', i: '📺', m: ['operations'] },
  { t: 'Pembanding NOCaaS', ke: '/nocaas', i: '🛰️', m: ['nocaas'], kata: 'router vpn' },
  { t: 'IP Publik', ke: '/ipam', i: '🌐', m: ['ipam'], kata: 'ipam alamat ip' },
  { t: 'Invoice', ke: '/finance/invoice', i: '💰', m: ['finance'], kata: 'tagihan' },
  { t: 'Kontrak', ke: '/contracts', i: '📄', m: ['contracts'] },
  { t: 'Laporan', ke: '/reports', i: '📈', m: ['reports'] },
  { t: 'Laporan SLA', ke: '/reports/sla', i: '📉', m: ['reports'] },
  { t: 'Karyawan (HRIS)', ke: '/hris/karyawan', i: '👥', m: ['hris'], kata: 'pegawai staf' },
  { t: 'Meeting', ke: '/meeting', i: '📹', kata: 'rapat' },
  { t: 'File server', ke: '/file-server', i: '🗃️', m: ['fileserver'], kata: 'berkas dokumen folder smb share nas' },
  { t: 'Profil saya', ke: '/profile', i: '👤', kata: 'password akun' },
]
const menuCocok = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (k.length < 2) return []
  return MENU.filter((m) => (!m.m || m.m.some((x) => auth.canAccess(x))) && `${m.t} ${m.kata ?? ''}`.toLowerCase().includes(k))
    .slice(0, 4).map((m): Item => ({ jenis: 'menu', ikon: m.i, judul: m.t, sub: 'Buka halaman', ke: m.ke }))
})

const semuaGrup = computed<{ judul: string; items: Item[] }[]>(() => [...(menuCocok.value.length ? [{ judul: 'Halaman', items: menuCocok.value }] : []), ...grup.value])
const datar = computed(() => semuaGrup.value.flatMap((g) => g.items))

// Riwayat pencarian (per browser)
const riwayat = ref<string[]>([])
try { riwayat.value = JSON.parse(localStorage.getItem('cari_riwayat') || '[]') } catch { /* abaikan */ }
function simpanRiwayat(k: string) {
  riwayat.value = [k, ...riwayat.value.filter((x) => x !== k)].slice(0, 6)
  try { localStorage.setItem('cari_riwayat', JSON.stringify(riwayat.value)) } catch { /* abaikan */ }
}

let timer: ReturnType<typeof setTimeout> | undefined
let urutan = 0
async function jalankan() {
  const k = q.value.trim()
  if (k.length < 2) { grup.value = []; memuat.value = false; return }
  const no = ++urutan
  memuat.value = true; galat.value = ''
  try {
    const r = await api.get('/dashboard/cari', { params: { q: k } })
    if (no === urutan) { grup.value = r.data.data.grup ?? []; sorot.value = 0 }
  } catch (e: any) {
    if (no === urutan) { grup.value = []; galat.value = e.response?.data?.message || 'Pencarian gagal' }
  } finally { if (no === urutan) memuat.value = false }
}
watch(q, () => { buka.value = true; clearTimeout(timer); timer = setTimeout(jalankan, 250) })

function pilih(it: Item) {
  simpanRiwayat(q.value.trim())
  buka.value = false
  router.push(it.ke)
}
function tombol(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); sorot.value = Math.min(datar.value.length - 1, sorot.value + 1); gulir() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sorot.value = Math.max(0, sorot.value - 1); gulir() }
  else if (e.key === 'Enter') { const it = datar.value[sorot.value]; if (it) { e.preventDefault(); pilih(it) } }
  else if (e.key === 'Escape') { buka.value = false; inputRef.value?.blur() }
}
function gulir() { nextTick(() => wadahRef.value?.querySelector('.cg-item.sorot')?.scrollIntoView({ block: 'nearest' })) }
const indeks = (gi: number, ii: number) => semuaGrup.value.slice(0, gi).reduce((s, g) => s + g.items.length, 0) + ii

// Ctrl/⌘+K atau "/" dari mana saja di halaman ini
function pintasan(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  const mengetik = !!t.closest('input, textarea, select, [contenteditable="true"]')
  if ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !mengetik)) {
    e.preventDefault(); inputRef.value?.focus(); buka.value = true
  }
}
function klikLuar(e: MouseEvent) { if (!wadahRef.value?.contains(e.target as Node)) buka.value = false }
onMounted(() => { window.addEventListener('keydown', pintasan); document.addEventListener('mousedown', klikLuar) })
onBeforeUnmount(() => { window.removeEventListener('keydown', pintasan); document.removeEventListener('mousedown', klikLuar); clearTimeout(timer) })

function sorotTeks(t: string) {
  const k = q.value.trim()
  if (!k) return [{ t, h: false }]
  const i = t.toLowerCase().indexOf(k.toLowerCase())
  return i < 0 ? [{ t, h: false }] : [{ t: t.slice(0, i), h: false }, { t: t.slice(i, i + k.length), h: true }, { t: t.slice(i + k.length), h: false }]
}
const CONTOH = ['nama site / toko', 'nomor tiket', 'SN perangkat', 'IP 192.168…', 'nama karyawan', 'nomor invoice']
</script>

<template>
  <div ref="wadahRef" class="cg" :class="{ buka: buka && (q.trim().length >= 2 || riwayat.length) }">
    <div class="cg-kotak">
      <span class="cg-ikon" aria-hidden="true">🔎</span>
      <input ref="inputRef" v-model="q" type="search" class="cg-input" autocomplete="off"
        placeholder="Cari apa saja — site, pelanggan, tiket, SN, IP, karyawan, invoice…"
        aria-label="Cari apa saja" role="combobox" :aria-expanded="buka"
        @focus="buka = true" @keydown="tombol" />
      <span v-if="memuat" class="cg-putar" aria-hidden="true" />
      <kbd v-else class="cg-kbd">Ctrl K</kbd>
    </div>

    <div v-if="buka && (q.trim().length >= 2 || riwayat.length)" class="cg-panel" role="listbox">
      <!-- Belum mengetik: riwayat & contoh -->
      <template v-if="q.trim().length < 2">
        <div class="cg-judul">Pencarian terakhir</div>
        <div class="cg-chip">
          <button v-for="r in riwayat" :key="r" type="button" @click="q = r">🕘 {{ r }}</button>
        </div>
        <div class="cg-tips">Bisa cari: <span v-for="c in CONTOH" :key="c">{{ c }}</span></div>
      </template>
      <template v-else>
        <div v-if="galat" class="cg-kosong merah">😵 {{ galat }}</div>
        <div v-else-if="!memuat && !datar.length" class="cg-kosong">
          <span class="cg-maskot">🔍</span>Tidak ada yang cocok dengan “{{ q }}”
          <small>Coba kata lain, nomor tiket lengkap, atau sebagian SN / IP.</small>
        </div>
        <template v-for="(g, gi) in semuaGrup" :key="g.judul">
          <div class="cg-judul">{{ g.judul }} <small>{{ g.items.length }}</small></div>
          <button v-for="(it, ii) in g.items" :key="it.ke + it.judul" type="button" role="option"
            :class="['cg-item', { sorot: indeks(gi, ii) === sorot }]" :aria-selected="indeks(gi, ii) === sorot"
            @mouseenter="sorot = indeks(gi, ii)" @click="pilih(it)">
            <span class="cg-it-ikon">{{ it.ikon }}</span>
            <span class="cg-it-teks">
              <b><template v-for="(p, pi) in sorotTeks(it.judul)" :key="pi"><mark v-if="p.h">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></b>
              <small v-if="it.sub">{{ it.sub }}</small>
            </span>
            <span v-if="it.lencana" class="cg-lencana">{{ it.lencana }}</span>
            <span class="cg-enter" aria-hidden="true">↵</span>
          </button>
        </template>
        <div v-if="datar.length" class="cg-kaki"><kbd>↑</kbd><kbd>↓</kbd> pilih · <kbd>Enter</kbd> buka · <kbd>Esc</kbd> tutup</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cg { position: relative; z-index: 20; }
.cg-kotak { display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 54px; border-radius: 18px; background: #fff; border: 2px solid transparent; box-shadow: 0 12px 30px rgba(42, 120, 214, .18), 0 2px 6px rgba(15, 23, 42, .06); transition: border-color .2s, box-shadow .2s; }
.cg.buka .cg-kotak, .cg-kotak:focus-within { border-color: #2a78d6; box-shadow: 0 16px 40px rgba(42, 120, 214, .28); }
.cg-ikon { font-size: 20px; }
.cg-input { flex: 1; min-width: 0; border: 0; outline: none; background: none; font: inherit; font-size: 15.5px; color: #0f172a; }
.cg-input::placeholder { color: #94a3b8; }
.cg-kbd, .cg-kaki kbd { padding: 2px 7px; border: 1px solid #cbd5e1; border-bottom-width: 2px; border-radius: 6px; background: #f8fafc; font: 600 11px ui-monospace, monospace; color: #475569; white-space: nowrap; }
.cg-putar { width: 18px; height: 18px; border: 2.5px solid #dbeafe; border-top-color: #2a78d6; border-radius: 50%; animation: putar .7s linear infinite; }
.cg-panel { position: absolute; left: 0; right: 0; top: calc(100% + 8px); max-height: min(70vh, 560px); overflow-y: auto; padding: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; box-shadow: 0 24px 60px rgba(15, 23, 42, .18); animation: muncul .18s ease-out; }
.cg-judul { display: flex; align-items: center; gap: 6px; padding: 10px 10px 4px; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
.cg-judul small { padding: 0 6px; border-radius: 99px; background: #f1f5f9; color: #64748b; letter-spacing: 0; }
.cg-item { width: 100%; display: flex; align-items: center; gap: 12px; padding: 9px 10px; border: 0; border-radius: 12px; background: none; text-align: left; cursor: pointer; font: inherit; }
.cg-item.sorot { background: #eef5ff; }
.cg-it-ikon { width: 34px; height: 34px; flex-shrink: 0; display: grid; place-items: center; border-radius: 10px; background: #f1f5f9; font-size: 17px; }
.cg-item.sorot .cg-it-ikon { background: #dbeafe; }
.cg-it-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cg-it-teks b { font-size: 13.5px; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cg-it-teks small { font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
mark { background: #fef08a; color: inherit; border-radius: 3px; padding: 0 1px; }
.cg-lencana { flex-shrink: 0; padding: 2px 9px; border-radius: 99px; background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; }
.cg-enter { color: #94a3b8; font-size: 13px; opacity: 0; }
.cg-item.sorot .cg-enter { opacity: 1; }
.cg-chip { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 10px 8px; }
.cg-chip button { padding: 5px 11px; border-radius: 99px; border: 1px solid #e2e8f0; background: #fff; font-size: 12.5px; color: #334155; cursor: pointer; }
.cg-chip button:hover { background: #eef5ff; }
.cg-tips { padding: 6px 10px 8px; font-size: 12px; color: #64748b; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cg-tips span { padding: 2px 8px; border-radius: 6px; background: #f8fafc; border: 1px dashed #cbd5e1; }
.cg-kosong { padding: 26px 12px; text-align: center; color: #475569; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.cg-kosong small { color: #94a3b8; }
.cg-kosong.merah { color: #b91c1c; }
.cg-maskot { font-size: 30px; animation: lompat 1.6s ease-in-out infinite; }
.cg-kaki { display: flex; gap: 4px; align-items: center; padding: 8px 10px 4px; font-size: 11.5px; color: #94a3b8; border-top: 1px solid #f1f5f9; margin-top: 6px; }
@keyframes putar { to { transform: rotate(360deg); } }
@keyframes muncul { from { opacity: 0; transform: translateY(-6px); } }
@keyframes lompat { 50% { transform: translateY(-5px); } }
@media (max-width: 640px) { .cg-kbd { display: none; } .cg-input { font-size: 14.5px; } .cg-lencana { display: none; } }
@media (prefers-reduced-motion: reduce) { .cg * { animation: none !important; } }
</style>
