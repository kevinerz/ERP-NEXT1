<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { MENU_MASTER, jumlahMenu, muatRingkasan, ringkasan } from './master-menu'

// Pusat Master Data — satu kotak cari untuk semua data, lalu pilih kategori
const router = useRouter()
const auth = useAuthStore()

const q = ref('')
const cariEl = ref<HTMLInputElement | null>(null)
interface Hasil {
  pelanggan: { id_pelanggan: number; kode_pelanggan: string; nama_pelanggan: string; jumlah_site: number }[]
  site: { id_site: number; kode_site: string; nama_site: string; status_site: string; kota: string | null; pelanggan: string }[]
  vendor: { id_vendor: number; nama_vendor: string; tipe_vendor: string; is_aktif: boolean }[]
  layanan: { id_layanan: number; kode_layanan: string; nama_layanan: string; is_aktif: boolean }[]
  teknisi: { id_kontak: number; nama: string; no_hp: string; asal_vendor: string | null; is_aktif: boolean }[]
  gudang: { id_gudang: number; kode_gudang: string; nama_gudang: string; kota: string | null }[]
}
const hasil = ref<Hasil | null>(null)
const mencari = ref(false)
const galatCari = ref(false)
let tunda: ReturnType<typeof setTimeout> | undefined
let urutan = 0
watch(q, (v) => {
  clearTimeout(tunda)
  if (v.trim().length < 2) { hasil.value = null; mencari.value = false; galatCari.value = false; return }
  mencari.value = true
  tunda = setTimeout(async () => {
    const ke = ++urutan
    try {
      const { data } = await api.get('/master/cari', { params: { q: v.trim() } })
      if (ke === urutan) { hasil.value = data.data; galatCari.value = false }
    } catch { if (ke === urutan) { hasil.value = null; galatCari.value = true } } finally { if (ke === urutan) mencari.value = false }
  }, 250)
})
const totalHasil = computed(() => (hasil.value ? Object.values(hasil.value).reduce((a, x) => a + x.length, 0) : 0))

// Hasil dalam satu daftar datar supaya bisa dipilih dengan panah atas/bawah + Enter
const daftar = computed(() => {
  const h = hasil.value
  if (!h) return []
  return [
    ...h.pelanggan.map((x) => ({ grup: 'Pelanggan', ikon: '👥', judul: x.nama_pelanggan, sub: `${x.kode_pelanggan} · ${x.jumlah_site} site`, to: `/master/site?pelanggan=${x.id_pelanggan}`, label: '' })),
    ...h.site.map((x) => ({ grup: 'Site', ikon: '📍', judul: x.nama_site, sub: `${x.kode_site} · ${x.pelanggan}${x.kota ? ` · ${x.kota}` : ''}`, to: `/master/site/${x.id_site}`, label: x.status_site })),
    ...h.vendor.map((x) => ({ grup: 'Vendor', ikon: '🏢', judul: x.nama_vendor, sub: x.tipe_vendor, to: `/master/vendor?search=${encodeURIComponent(x.nama_vendor)}`, label: x.is_aktif ? '' : 'Nonaktif' })),
    ...h.layanan.map((x) => ({ grup: 'Layanan', ikon: '🌐', judul: x.nama_layanan, sub: x.kode_layanan, to: '/master/layanan', label: x.is_aktif ? '' : 'Nonaktif' })),
    ...h.teknisi.map((x) => ({ grup: 'Teknisi mitra', ikon: '🧰', judul: x.nama, sub: `${x.no_hp}${x.asal_vendor ? ` · ${x.asal_vendor}` : ''}`, to: `/master/kontak-teknisi?search=${encodeURIComponent(x.nama)}`, label: x.is_aktif ? '' : 'Nonaktif' })),
    ...h.gudang.map((x) => ({ grup: 'Gudang', ikon: '🏬', judul: x.nama_gudang, sub: `${x.kode_gudang}${x.kota ? ` · ${x.kota}` : ''}`, to: '/master/gudang', label: '' })),
  ]
})
const pilih = ref(0)
watch(daftar, () => { pilih.value = 0 })
function tombolCari(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); pilih.value = Math.min(daftar.value.length - 1, pilih.value + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); pilih.value = Math.max(0, pilih.value - 1) }
  else if (e.key === 'Enter' && daftar.value[pilih.value]) router.push(daftar.value[pilih.value]!.to)
  else if (e.key === 'Escape') q.value = ''
}
function pintas(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { e.preventDefault(); cariEl.value?.focus() }
}
const ringkasanGagal = ref(false)
async function muatPanel() {
  ringkasanGagal.value = false
  ringkasanGagal.value = !(await muatRingkasan(true))
}
onMounted(() => { muatPanel(); window.addEventListener('keydown', pintas); cariEl.value?.focus() })
onBeforeUnmount(() => clearTimeout(tunda))
onBeforeUnmount(() => window.removeEventListener('keydown', pintas))

const GRUP = ['Pelanggan', 'Jaringan', 'Operasional'] as const
const KET_GRUP: Record<string, string> = { Pelanggan: 'Siapa pelanggan kita & di mana layanannya', Jaringan: 'Produk yang dijual & pemasok jaringan', Operasional: 'Pendukung kerja lapangan & tiket' }
const menuGrup = (g: string) => MENU_MASTER.filter((m) => m.grup === g)
// Pengaturan hanya untuk Admin / Director / Manager_Ops (sama dengan guard rute)
const bisaPengaturan = computed(() => auth.hasRole('Admin') || auth.hasRole('Director') || auth.hasRole('Manager_Ops') || auth.isSuperAdmin)
const SAPA = computed(() => (auth.user?.nama_lengkap || '').split(' ')[0])
const subJumlah = (kunci: string) => {
  const j = ringkasan.value?.jumlah
  if (!j) return ''
  if (kunci === 'pelanggan') return `${j.grup} grup holding`
  if (kunci === 'site') return `${j.site_dismantle.toLocaleString('id-ID')} dismantle${j.site_lain ? ` · ${j.site_lain} lainnya` : ''}`
  return 'aktif'
}
const warnaStatus = (s: string) => (s === 'Aktif' ? '#16a34a' : s === 'Dismantle' ? '#94a3b8' : '#d97706')
const relatif = (d: string) => {
  const m = Math.round((Date.now() - +new Date(d)) / 60_000)
  return m < 60 ? `${Math.max(1, m)} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`
}
</script>

<template>
  <div class="md">
    <header class="md-kepala">
      <h1>Master Data</h1>
      <p>Halo{{ SAPA ? `, ${SAPA}` : '' }} — cari apa saja di sini: pelanggan, site, vendor, layanan, teknisi, atau gudang.</p>
      <div class="md-cari" :class="{ aktif: q }">
        <span>🔎</span>
        <input ref="cariEl" v-model="q" placeholder="Ketik nama, kode, kota, atau nomor HP…" @keydown="tombolCari" />
        <small v-if="mencari">mencari…</small>
        <button v-else-if="q" type="button" aria-label="Hapus pencarian" @click="q = ''">✕</button>
        <kbd v-else>/</kbd>
      </div>

      <!-- HASIL CARI -->
      <div v-if="q.trim().length >= 2 && galatCari && !mencari" class="md-hasil">
        <p class="md-kosong">Pencarian gagal — periksa koneksi lalu ketik ulang.</p>
      </div>
      <div v-if="q.trim().length >= 2 && hasil" class="md-hasil">
        <p v-if="!totalHasil" class="md-kosong">Tidak ada yang cocok dengan “{{ q }}”.</p>
        <template v-else>
          <div class="md-hasil-info">{{ totalHasil }} hasil · <kbd>↑</kbd><kbd>↓</kbd> pilih · <kbd>Enter</kbd> buka</div>
          <button v-for="(h, i) in daftar" :key="i" type="button" class="md-baris" :class="{ pilih: i === pilih }" @mouseenter="pilih = i" @click="router.push(h.to)">
            <span class="md-baris-ikon">{{ h.ikon }}</span>
            <div><b>{{ h.judul }}</b><small>{{ h.sub }}</small></div>
            <em v-if="h.label" :style="{ color: warnaStatus(h.label) }">{{ h.label }}</em>
            <span class="md-baris-grup">{{ h.grup }}</span>
          </button>
        </template>
      </div>
    </header>

    <div class="md-tata">
      <div class="md-utama">
        <section v-for="g in GRUP" :key="g" class="md-grup">
          <h2>{{ g }} <small>{{ KET_GRUP[g] }}</small></h2>
          <div class="md-kartu-baris">
            <button v-for="m in menuGrup(g)" :key="m.kunci" type="button" class="md-kartu" :style="{ '--c': m.warna }" @click="router.push(m.to)">
              <span class="md-ikon">{{ m.ikon }}</span>
              <div class="md-kartu-isi">
                <b>{{ m.label }}</b>
                <small>{{ m.desc }}</small>
              </div>
              <div class="md-angka">
                <strong>{{ jumlahMenu(m.kunci)?.toLocaleString('id-ID') ?? '–' }}</strong>
                <small>{{ subJumlah(m.kunci) }}</small>
              </div>
              <span class="md-panah">›</span>
            </button>
          </div>
        </section>
      </div>

      <aside class="md-samping">
        <section class="md-panel">
          <h3>🕘 Site terakhir diubah</h3>
          <p v-if="!ringkasan && ringkasanGagal" class="md-redup">Gagal memuat. <button type="button" class="md-ulang" @click="muatPanel">Coba lagi</button></p>
          <p v-else-if="!ringkasan" class="md-redup">Memuat…</p>
          <p v-else-if="!ringkasan.site_terbaru?.length" class="md-redup">Belum ada perubahan site.</p>
          <button v-for="s in ringkasan?.site_terbaru ?? []" :key="s.id_site" type="button" class="md-terbaru" @click="router.push(`/master/site/${s.id_site}`)">
            <i :style="{ background: warnaStatus(s.status_site) }"></i>
            <div><b>{{ s.nama_site }}</b><small>{{ s.pelanggan }} · {{ relatif(s.updated_at) }}</small></div>
          </button>
        </section>
        <button v-if="bisaPengaturan" type="button" class="md-panel md-atur" @click="router.push('/settings')">
          <span>🔩</span><div><b>Pengaturan sistem</b><small>Logo, nama perusahaan, preferensi aplikasi</small></div><i>›</i>
        </button>
        <section class="md-panel md-tips">
          <h3>💡 Cara cepat</h3>
          <ul>
            <li>Tekan <kbd>/</kbd> lalu ketik — hasil dari semua data muncul sekaligus.</li>
            <li>Di tiap halaman master ada bilah menu di atas untuk pindah data tanpa kembali ke sini.</li>
            <li>Klik pelanggan di hasil cari untuk langsung melihat semua site-nya.</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.md { padding: 22px 24px 50px; max-width: 1240px; }
.md-redup { color: #94a3b8; font-size: 13px; margin: 0; }
.md-ulang { border: 0; background: none; padding: 0; color: #4f46e5; font: inherit; font-weight: 700; cursor: pointer; }
kbd { display: inline-block; min-width: 16px; padding: 0 5px; border-radius: 5px; border: 1px solid #cbd5e1; border-bottom-width: 2px; font: 700 10.5px/16px ui-monospace, monospace; text-align: center; background: #fff; color: #475569; margin: 0 1px; }

.md-kepala { position: relative; margin-bottom: 22px; }
.md-kepala h1 { margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -.6px; color: #0f172a; }
.md-kepala > p { margin: 4px 0 14px; color: #64748b; font-size: 14px; }
.md-cari { display: flex; align-items: center; gap: 10px; background: #fff; border: 2px solid #e2e8f0; border-radius: 16px; padding: 0 16px; max-width: 760px; box-shadow: 0 8px 24px -16px rgba(15, 23, 42, .3); transition: border-color .15s, box-shadow .15s; }
.md-cari:focus-within { border-color: #6366f1; box-shadow: 0 10px 30px -14px rgba(99, 102, 241, .45); }
.md-cari > span { font-size: 18px; }
.md-cari input { flex: 1; border: 0; outline: none; background: none; padding: 15px 0; font: inherit; font-size: 16px; color: #0f172a; min-width: 0; }
.md-cari small { font-size: 12px; color: #94a3b8; }
.md-cari button { border: 0; background: #f1f5f9; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; color: #64748b; }
.md-hasil { position: absolute; z-index: 30; top: 100%; left: 0; width: min(760px, 100%); margin-top: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 24px 50px -20px rgba(15, 23, 42, .4); padding: 6px; max-height: 60vh; overflow: auto; }
.md-hasil-info { font-size: 11.5px; color: #94a3b8; padding: 6px 10px; }
.md-kosong { margin: 0; padding: 18px; text-align: center; color: #64748b; font-size: 13.5px; }
.md-baris { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: none; padding: 9px 10px; border-radius: 10px; cursor: pointer; text-align: left; font: inherit; }
.md-baris.pilih { background: #eef2ff; }
.md-baris-ikon { font-size: 18px; width: 26px; text-align: center; }
.md-baris div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.md-baris b { font-size: 14px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-baris small { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-baris em { font-style: normal; font-size: 11.5px; font-weight: 800; }
.md-baris-grup { font-size: 11px; font-weight: 700; color: #94a3b8; background: #f8fafc; border-radius: 99px; padding: 2px 8px; white-space: nowrap; }

.md-tata { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.md-grup { margin-bottom: 20px; }
.md-grup h2 { margin: 0 0 10px; font-size: 15px; font-weight: 900; color: #0f172a; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.md-grup h2 small { font-size: 12.5px; font-weight: 500; color: #94a3b8; }
.md-kartu-baris { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }
.md-kartu { --c: #4f46e5; display: flex; align-items: center; gap: 14px; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; cursor: pointer; text-align: left; font: inherit; transition: transform .15s, box-shadow .15s, border-color .15s; }
.md-kartu:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 40%, #e2e8f0); box-shadow: 0 12px 24px -16px color-mix(in srgb, var(--c) 60%, transparent); }
.md-ikon { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; font-size: 22px; background: color-mix(in srgb, var(--c) 12%, #fff); flex-shrink: 0; }
.md-kartu-isi { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.md-kartu-isi b { font-size: 15px; color: #0f172a; }
.md-kartu-isi small { font-size: 12px; color: #64748b; }
.md-angka { text-align: right; display: flex; flex-direction: column; }
.md-angka strong { font-size: 22px; font-weight: 900; color: var(--c); letter-spacing: -.5px; line-height: 1.1; }
.md-angka small { font-size: 10.5px; color: #94a3b8; white-space: nowrap; }
.md-panah { font-size: 22px; color: #cbd5e1; transition: transform .15s, color .15s; }
.md-kartu:hover .md-panah { transform: translateX(3px); color: var(--c); }

.md-samping { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }
.md-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 2px; }
.md-panel h3 { margin: 0 0 6px; font-size: 13.5px; font-weight: 800; color: #0f172a; }
.md-terbaru { display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 7px 6px; border-radius: 10px; cursor: pointer; text-align: left; font: inherit; }
.md-terbaru:hover { background: #f8fafc; }
.md-terbaru i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.md-terbaru div { min-width: 0; display: flex; flex-direction: column; }
.md-terbaru b { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #0f172a; }
.md-terbaru small { font-size: 11.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-atur { flex-direction: row; align-items: center; gap: 12px; cursor: pointer; text-align: left; font: inherit; }
.md-atur:hover { border-color: #94a3b8; }
.md-atur > span { font-size: 20px; }
.md-atur div { flex: 1; display: flex; flex-direction: column; }
.md-atur b { font-size: 13.5px; color: #0f172a; }
.md-atur small { font-size: 11.5px; color: #64748b; }
.md-atur i { font-style: normal; font-size: 20px; color: #cbd5e1; }
.md-tips ul { margin: 0; padding-left: 18px; font-size: 12.5px; color: #475569; display: flex; flex-direction: column; gap: 5px; }

@media (max-width: 1050px) { .md-tata { grid-template-columns: 1fr; } .md-samping { position: static; } }
@media (max-width: 640px) { .md { padding: 14px 12px 40px; } .md-kepala h1 { font-size: 23px; } .md-kartu-baris { grid-template-columns: 1fr; } }
</style>
