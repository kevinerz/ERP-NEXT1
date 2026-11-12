<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import type { Karyawan } from '@/stores/hris'
import { useSettingsStore } from '@/stores/settings'
import { useFilterUrl } from '@/composables/useFilterUrl'
import { exportCsv } from '@/composables/useExport'
import { toast, pesanGalat } from '@/composables/useDialog'
import { infoDept, inisial, kelengkapan, masaKerjaBulan, masaKerjaTeks, hariMenuju, umur, tgl, tglPendek, nomorWa } from './hris-util'

type K = Karyawan & { ada_foto?: boolean }
const router = useRouter()
const cfg = useSettingsStore()
const semua = ref<K[]>([])
const foto = ref<Record<number, string>>({})
const memuat = ref(true)
const error = ref('')

const q = ref('')
const dept = ref('')
const status = ref('aktif')
const akun = ref('')
const tampil = ref<'kartu' | 'tabel' | 'struktur'>('kartu')
const urut = ref('nama')
useFilterUrl({ q, dept, status, akun, tampil, urut })

async function muat() {
  memuat.value = true
  try {
    const { data } = await api.get('/hris/karyawan', { params: { limit: 500 } })
    semua.value = data.data ?? []
    error.value = ''
    const ids = semua.value.filter((k) => k.ada_foto).map((k) => k.id_karyawan)
    if (ids.length) {
      api.get('/hris/foto', { params: { ids: ids.join(',') } }).then(({ data }) => {
        foto.value = Object.fromEntries((data.data ?? []).map((f: any) => [f.id_karyawan, f.foto_url]))
      }).catch(() => {})
    }
  } catch (e: any) {
    error.value = pesanGalat(e, 'Gagal memuat data karyawan')
  } finally {
    memuat.value = false
  }
}
onMounted(() => { muat(); window.addEventListener('keydown', pintasan) })
onBeforeUnmount(() => window.removeEventListener('keydown', pintasan))

const aktif = computed(() => semua.value.filter((k) => k.status_aktif))
const daftarDept = computed(() => {
  const m = new Map<string, number>()
  for (const k of aktif.value) m.set(k.departemen, (m.get(k.departemen) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})

const saring = computed(() => {
  const kata = q.value.trim().toLowerCase()
  const out = semua.value.filter((k) => {
    if (status.value === 'aktif' && !k.status_aktif) return false
    if (status.value === 'nonaktif' && k.status_aktif) return false
    if (dept.value && k.departemen !== dept.value) return false
    if (akun.value === 'ada' && !k.user) return false
    if (akun.value === 'tanpa' && k.user) return false
    if (akun.value === 'kurang' && kelengkapan(k).persen >= 70) return false
    if (kata && !`${k.nama_lengkap} ${k.nip} ${k.jabatan} ${k.departemen} ${k.email ?? ''} ${k.no_hp ?? ''} ${k.user?.username ?? ''}`.toLowerCase().includes(kata)) return false
    return true
  })
  const u = urut.value
  return out.sort((a, b) =>
    u === 'masa' ? (masaKerjaBulan(b.tgl_bergabung) ?? -1) - (masaKerjaBulan(a.tgl_bergabung) ?? -1)
      : u === 'baru' ? +new Date(b.tgl_bergabung || b.created_at) - +new Date(a.tgl_bergabung || a.created_at)
        : u === 'profil' ? kelengkapan(a).persen - kelengkapan(b).persen
          : a.nama_lengkap.localeCompare(b.nama_lengkap))
})
const adaFilter = computed(() => !!(q.value || dept.value || akun.value || status.value !== 'aktif'))
function reset() { q.value = ''; dept.value = ''; akun.value = ''; status.value = 'aktif' }

// ── Angka ringkas ────────────────────────────────────────────────────────────
const angka = computed(() => {
  const a = aktif.value
  const masa = a.map((k) => masaKerjaBulan(k.tgl_bergabung)).filter((x): x is number => x != null)
  const rata = masa.length ? masa.reduce((x, y) => x + y, 0) / masa.length : 0
  return {
    aktif: a.length,
    nonaktif: semua.value.length - a.length,
    dept: daftarDept.value.length,
    akun: a.filter((k) => k.user?.is_aktif).length,
    tanpaAkun: a.filter((k) => !k.user).length,
    masa: rata >= 12 ? `${(rata / 12).toFixed(1).replace('.', ',')} th` : `${Math.round(rata)} bln`,
    profil: a.length ? Math.round(a.reduce((x, k) => x + kelengkapan(k).persen, 0) / a.length) : 0,
    ultah: a.filter((k) => (hariMenuju(k.tgl_lahir) ?? 99) <= 30).length,
  }
})

// ── Panel samping ────────────────────────────────────────────────────────────
const ulangTahun = computed(() => aktif.value.filter((k) => k.tgl_lahir).map((k) => ({ k, hari: hariMenuju(k.tgl_lahir)!, umur: (umur(k.tgl_lahir) ?? 0) + ((hariMenuju(k.tgl_lahir) ?? 1) === 0 ? 0 : 1) }))
  .filter((x) => x.hari <= 60).sort((a, b) => a.hari - b.hari).slice(0, 6))
const hariJadi = computed(() => aktif.value.filter((k) => k.tgl_bergabung && (masaKerjaBulan(k.tgl_bergabung) ?? 0) >= 11).map((k) => {
  const hari = hariMenuju(k.tgl_bergabung)!
  const th = Math.floor(((masaKerjaBulan(k.tgl_bergabung) ?? 0) + (hari === 0 ? 0 : 1)) / 12)
  return { k, hari, th: Math.max(1, th) }
}).filter((x) => x.hari <= 60).sort((a, b) => a.hari - b.hari).slice(0, 5))
const baru = computed(() => aktif.value.filter((k) => (masaKerjaBulan(k.tgl_bergabung) ?? 99) < 3).sort((a, b) => +new Date(b.tgl_bergabung!) - +new Date(a.tgl_bergabung!)).slice(0, 5))
const perluLengkap = computed(() => aktif.value.map((k) => ({ k, ...kelengkapan(k) })).filter((x) => x.persen < 100).sort((a, b) => a.persen - b.persen).slice(0, 5))
const kapan = (h: number) => (h === 0 ? 'Hari ini 🎉' : h === 1 ? 'Besok' : `${h} hari lagi`)

// Struktur per departemen
const struktur = computed(() => {
  const m = new Map<string, K[]>()
  for (const k of saring.value) { if (!m.has(k.departemen)) m.set(k.departemen, []); m.get(k.departemen)!.push(k) }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
})

// ── Aksi ─────────────────────────────────────────────────────────────────────
const buka = (k: K) => router.push(`/hris/karyawan/${k.id_karyawan}`)
async function salinKontak(k: K) {
  const teks = `${k.nama_lengkap} — ${k.jabatan} (${k.departemen})${k.no_hp ? `\n📱 ${k.no_hp}` : ''}${k.email ? `\n✉️ ${k.email}` : ''}`
  try { await navigator.clipboard.writeText(teks); toast('Kontak disalin') } catch { toast('Kontak gagal disalin — salin manual', 'warning') }
}
function ekspor() {
  exportCsv(`karyawan-${new Date().toISOString().slice(0, 10)}`, [{
    headers: ['NIP', 'Nama', 'Jabatan', 'Departemen', 'Status', 'No. HP', 'Email', 'Tgl bergabung', 'Masa kerja', 'Akun', 'Role', 'Kelengkapan profil'],
    rows: saring.value.map((k) => [k.nip, k.nama_lengkap, k.jabatan, k.departemen, k.status_aktif ? 'Aktif' : 'Nonaktif', k.no_hp, k.email, k.tgl_bergabung?.slice(0, 10),
      masaKerjaTeks(k.tgl_bergabung), k.user ? `${k.user.username}${k.user.is_aktif ? '' : ' (nonaktif)'}` : '', k.user?.user_roles.map((r) => r.role.nama_role).join(', '), `${kelengkapan(k).persen}%`]),
  }])
}

const cariEl = ref<HTMLInputElement | null>(null)
function pintasan(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { if (e.key === 'Escape') (t as HTMLInputElement).blur?.(); return }
  if (e.key === '/') { e.preventDefault(); cariEl.value?.focus() }
  else if (e.key === 'n') router.push('/hris/karyawan/tambah')
  else if (e.key === '1') tampil.value = 'kartu'
  else if (e.key === '2') tampil.value = 'tabel'
  else if (e.key === '3') tampil.value = 'struktur'
}
const tanggalHariIni = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
</script>

<template>
  <div class="bt">
    <!-- KEPALA -->
    <header class="bt-kepala">
      <div class="bt-kepala-kiri">
        <small class="bt-tanggal">{{ tanggalHariIni }}</small>
        <h1>Buku Tim <em>{{ cfg.settings.company_name || 'NEXT1' }}</em></h1>
        <p>Orang-orang di balik jaringan — {{ angka.aktif }} rekan aktif di {{ angka.dept }} departemen.</p>
      </div>
      <div class="bt-kepala-aksi">
        <button type="button" class="bt-btn garis" @click="router.push('/hris/undangan')">🔗 Undang isi data sendiri</button>
        <button type="button" class="bt-btn isi" @click="router.push('/hris/karyawan/tambah')">＋ Tambah karyawan</button>
      </div>
      <svg class="bt-hias" viewBox="0 0 200 200" aria-hidden="true"><circle cx="150" cy="40" r="90" /><circle cx="40" cy="170" r="50" /></svg>
    </header>

    <div v-if="error && semua.length" class="alert alert-danger" role="alert">{{ error }} <button type="button" class="btn btn-secondary btn-sm" @click="muat">↻ Coba lagi</button></div>

    <!-- ANGKA -->
    <section class="bt-angka">
      <div><b>{{ angka.aktif }}</b><span>Rekan aktif</span><small v-if="angka.nonaktif">{{ angka.nonaktif }} nonaktif</small></div>
      <div><b>{{ angka.dept }}</b><span>Departemen</span></div>
      <button type="button" :class="{ on: akun === 'tanpa' }" @click="akun = akun === 'tanpa' ? '' : 'tanpa'"><b>{{ angka.akun }}</b><span>Punya akun ERP</span><small>{{ angka.tanpaAkun }} belum punya</small></button>
      <div><b>{{ angka.masa }}</b><span>Rata masa kerja</span></div>
      <button type="button" :class="{ on: akun === 'kurang' }" @click="akun = akun === 'kurang' ? '' : 'kurang'"><b>{{ angka.profil }}<i>%</i></b><span>Kelengkapan profil</span><small>rata-rata tim</small></button>
      <div><b>{{ angka.ultah }}</b><span>Ulang tahun</span><small>30 hari ke depan</small></div>
    </section>

    <!-- KOMPOSISI -->
    <section v-if="daftarDept.length" class="bt-komposisi">
      <div class="bt-komposisi-bar">
        <button v-for="[d, n] in daftarDept" :key="d" type="button" :style="{ flex: n, background: infoDept(d).warna }" :class="{ redup: dept && dept !== d }" :title="`${d}: ${n} orang`" @click="dept = dept === d ? '' : d"></button>
      </div>
      <div class="bt-komposisi-label">
        <button v-for="[d, n] in daftarDept" :key="d" type="button" :class="{ on: dept === d }" @click="dept = dept === d ? '' : d">
          <i :style="{ background: infoDept(d).warna }"></i>{{ d }} <b>{{ n }}</b>
        </button>
      </div>
    </section>

    <div class="bt-tata">
      <div class="bt-utama">
        <!-- ALAT -->
        <div class="bt-alat">
          <div class="bt-cari">
            <span>⌕</span>
            <input ref="cariEl" v-model="q" placeholder="Cari nama, NIP, jabatan, nomor HP…  ( / )" />
            <button v-if="q" type="button" aria-label="Hapus pencarian" @click="q = ''">✕</button>
          </div>
          <div class="bt-segmen">
            <button v-for="s in [['aktif', 'Aktif'], ['nonaktif', 'Nonaktif'], ['', 'Semua']]" :key="s[0]" type="button" :class="{ on: status === s[0] }" @click="status = s[0]!">{{ s[1] }}</button>
          </div>
          <select v-model="akun" class="bt-pilih">
            <option value="">Semua akun</option>
            <option value="ada">Punya akun ERP</option>
            <option value="tanpa">Belum punya akun</option>
            <option value="kurang">Profil &lt; 70%</option>
          </select>
          <select v-model="urut" class="bt-pilih">
            <option value="nama">Urut: Nama</option>
            <option value="masa">Urut: Masa kerja</option>
            <option value="baru">Urut: Terbaru bergabung</option>
            <option value="profil">Urut: Profil belum lengkap</option>
          </select>
          <span class="bt-spasi"></span>
          <div class="bt-segmen ikon">
            <button type="button" :class="{ on: tampil === 'kartu' }" title="Kartu (1)" @click="tampil = 'kartu'">▦</button>
            <button type="button" :class="{ on: tampil === 'tabel' }" title="Tabel (2)" @click="tampil = 'tabel'">☰</button>
            <button type="button" :class="{ on: tampil === 'struktur' }" title="Per departemen (3)" @click="tampil = 'struktur'">⫶</button>
          </div>
          <button type="button" class="bt-btn kecil" :disabled="!saring.length" @click="ekspor">⬇ CSV</button>
        </div>
        <p class="bt-hasil">
          Menampilkan <b>{{ saring.length }}</b> orang<template v-if="dept"> di <b>{{ dept }}</b></template>
          <button v-if="adaFilter" type="button" @click="reset">· reset filter</button>
        </p>

        <div v-if="memuat" class="bt-grid"><div v-for="n in 6" :key="n" class="bt-kartu kerangka"></div></div>

        <div v-else-if="error && !semua.length" class="bt-kosong" role="alert">
          <div>🍂</div>
          <b>Gagal memuat data karyawan</b>
          <p>{{ error }}</p>
          <button type="button" class="bt-btn garis" @click="muat">↻ Coba lagi</button>
        </div>

        <div v-else-if="!semua.length" class="bt-kosong">
          <div>🌿</div>
          <b>Buku Tim masih kosong</b>
          <p>Tambahkan karyawan pertama, atau undang rekan mengisi datanya sendiri.</p>
        </div>

        <div v-else-if="!saring.length" class="bt-kosong">
          <div>🌿</div>
          <b>Tidak ada yang cocok</b>
          <p>Coba kata kunci lain atau reset filter.</p>
        </div>

        <!-- KARTU -->
        <div v-else-if="tampil === 'kartu'" class="bt-grid">
          <article v-for="(k, i) in saring" :key="k.id_karyawan" v-baris class="bt-kartu" :class="{ mati: !k.status_aktif }" :style="{ '--c': infoDept(k.departemen).warna, '--l': infoDept(k.departemen).lembut, animationDelay: Math.min(i, 12) * 30 + 'ms' }" @click="buka(k)">
            <div class="bt-kartu-atas">
              <span class="bt-dept">{{ infoDept(k.departemen).ikon }} {{ k.departemen }}</span>
              <span v-if="(hariMenuju(k.tgl_lahir) ?? 99) <= 7" class="bt-ultah" :title="`Ulang tahun ${tglPendek(k.tgl_lahir)}`">🎂</span>
              <span v-if="!k.status_aktif" class="bt-tanda">Nonaktif</span>
              <span v-else-if="!k.user" class="bt-tanda kuning" title="Belum punya akun login ERP">Tanpa akun</span>
            </div>
            <div class="bt-foto">
              <img v-if="foto[k.id_karyawan]" :src="foto[k.id_karyawan]" alt="" />
              <span v-else>{{ inisial(k.nama_lengkap) }}</span>
            </div>
            <h3>{{ k.nama_lengkap }}</h3>
            <p class="bt-jabatan">{{ k.jabatan }}</p>
            <p class="bt-masa">🌱 {{ masaKerjaTeks(k.tgl_bergabung) }}<template v-if="k.tgl_bergabung"> · sejak {{ new Date(k.tgl_bergabung).getFullYear() }}</template></p>
            <div class="bt-profil" :title="kelengkapan(k).kurang.length ? `Belum diisi: ${kelengkapan(k).kurang.join(', ')}` : 'Profil lengkap'">
              <div><i :style="{ width: kelengkapan(k).persen + '%' }"></i></div>
              <small>Profil {{ kelengkapan(k).persen }}%</small>
            </div>
            <div class="bt-kontak" @click.stop>
              <a v-if="k.no_hp" :href="`https://wa.me/${nomorWa(k.no_hp)}`" target="_blank" rel="noopener" title="WhatsApp">💬</a>
              <a v-if="k.no_hp" :href="`tel:${k.no_hp}`" title="Telepon">📞</a>
              <a v-if="k.email" :href="`mailto:${k.email}`" title="Email">✉️</a>
              <button type="button" title="Salin kontak" @click="salinKontak(k)">📋</button>
            </div>
          </article>
        </div>

        <!-- TABEL -->
        <div v-else-if="tampil === 'tabel'" class="bt-tabel">
          <table>
            <thead><tr><th>Nama</th><th>Departemen</th><th>Kontak</th><th>Masa kerja</th><th>Akun ERP</th><th>Profil</th></tr></thead>
            <tbody>
              <tr v-for="k in saring" :key="k.id_karyawan" v-baris :class="{ mati: !k.status_aktif }" @click="buka(k)">
                <td>
                  <div class="bt-orang">
                    <span class="bt-av" :style="{ background: infoDept(k.departemen).warna }"><img v-if="foto[k.id_karyawan]" :src="foto[k.id_karyawan]" alt="" /><template v-else>{{ inisial(k.nama_lengkap) }}</template></span>
                    <div><b>{{ k.nama_lengkap }}</b><small>{{ k.jabatan }} · <code>{{ k.nip }}</code></small></div>
                  </div>
                </td>
                <td><span class="bt-dept kecil" :style="{ '--c': infoDept(k.departemen).warna, '--l': infoDept(k.departemen).lembut }">{{ k.departemen }}</span></td>
                <td><small>{{ k.no_hp || '—' }}<br />{{ k.email || '' }}</small></td>
                <td>{{ masaKerjaTeks(k.tgl_bergabung) }}<br /><small class="bt-redup">{{ tgl(k.tgl_bergabung) }}</small></td>
                <td>
                  <template v-if="k.user"><code>{{ k.user.username }}</code><br /><small :class="k.user.is_aktif ? 'hijau' : 'merah'">{{ k.user.is_aktif ? '● aktif' : '● nonaktif' }}</small></template>
                  <span v-else class="bt-redup">—</span>
                </td>
                <td><div class="bt-profil mini"><div><i :style="{ width: kelengkapan(k).persen + '%' }"></i></div><small>{{ kelengkapan(k).persen }}%</small></div></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- STRUKTUR -->
        <div v-else class="bt-struktur">
          <section v-for="[d, list] in struktur" :key="d" class="bt-kolom" :style="{ '--c': infoDept(d).warna, '--l': infoDept(d).lembut }">
            <header><span>{{ infoDept(d).ikon }}</span><b>{{ d }}</b><i>{{ list.length }}</i></header>
            <button v-for="k in list" :key="k.id_karyawan" type="button" class="bt-kolom-orang" :class="{ mati: !k.status_aktif }" @click="buka(k)">
              <span class="bt-av"><img v-if="foto[k.id_karyawan]" :src="foto[k.id_karyawan]" alt="" /><template v-else>{{ inisial(k.nama_lengkap) }}</template></span>
              <div><b>{{ k.nama_lengkap }}</b><small>{{ k.jabatan }}</small></div>
            </button>
          </section>
        </div>
      </div>

      <!-- SAMPING -->
      <aside class="bt-samping">
        <section class="bt-catatan">
          <h4>🎂 Ulang tahun</h4>
          <p v-if="!ulangTahun.length" class="bt-redup kecil">Tidak ada dalam 60 hari ke depan.</p>
          <button v-for="x in ulangTahun" :key="x.k.id_karyawan" type="button" class="bt-baris" :class="{ hariini: x.hari === 0 }" @click="buka(x.k)">
            <span class="bt-av kecil" :style="{ background: infoDept(x.k.departemen).warna }">{{ inisial(x.k.nama_lengkap) }}</span>
            <div><b>{{ x.k.nama_lengkap }}</b><small>{{ tglPendek(x.k.tgl_lahir) }} · ke-{{ x.umur }}</small></div>
            <em>{{ kapan(x.hari) }}</em>
          </button>
        </section>

        <section class="bt-catatan">
          <h4>🎉 Hari jadi kerja</h4>
          <p v-if="!hariJadi.length" class="bt-redup kecil">Tidak ada dalam 60 hari ke depan.</p>
          <button v-for="x in hariJadi" :key="x.k.id_karyawan" type="button" class="bt-baris" @click="buka(x.k)">
            <span class="bt-av kecil" :style="{ background: infoDept(x.k.departemen).warna }">{{ inisial(x.k.nama_lengkap) }}</span>
            <div><b>{{ x.k.nama_lengkap }}</b><small>{{ x.th }} tahun bersama kita</small></div>
            <em>{{ kapan(x.hari) }}</em>
          </button>
        </section>

        <section v-if="baru.length" class="bt-catatan">
          <h4>🌱 Rekan baru</h4>
          <button v-for="k in baru" :key="k.id_karyawan" type="button" class="bt-baris" @click="buka(k)">
            <span class="bt-av kecil" :style="{ background: infoDept(k.departemen).warna }">{{ inisial(k.nama_lengkap) }}</span>
            <div><b>{{ k.nama_lengkap }}</b><small>{{ k.jabatan }} · {{ tglPendek(k.tgl_bergabung) }}</small></div>
          </button>
        </section>

        <section class="bt-catatan">
          <h4>📝 Profil perlu dilengkapi</h4>
          <p v-if="!perluLengkap.length" class="bt-redup kecil">Semua profil sudah lengkap. 👏</p>
          <button v-for="x in perluLengkap" :key="x.k.id_karyawan" type="button" class="bt-baris" :title="`Belum diisi: ${x.kurang.join(', ')}`" @click="router.push(`/hris/karyawan/${x.k.id_karyawan}/edit`)">
            <span class="bt-cincin" :style="{ '--p': x.persen }"><i>{{ x.persen }}</i></span>
            <div><b>{{ x.k.nama_lengkap }}</b><small>Kurang {{ x.kurang.length }}: {{ x.kurang.slice(0, 3).join(', ') }}{{ x.kurang.length > 3 ? '…' : '' }}</small></div>
          </button>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* Nuansa "buku tim": kertas krem, hijau hutan, aksen terakota, judul serif */
.bt { --kertas: #fbf8f2; --tinta: #1c2a22; --hutan: #1f4d3a; --hutan-2: #2f6b4f; --terakota: #c2552d; --garis: #e9e2d4; --redup: #8a8170;
  --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;
  background: var(--kertas); padding: 22px 24px 70px; min-height: 100%; box-sizing: border-box; color: var(--tinta); }
.bt-redup { color: var(--redup); }
.kecil { font-size: 12.5px; }
.hijau { color: #2f7a4d; } .merah { color: #b42318; }
code { font-size: 11.5px; background: #f3eee3; padding: 0 5px; border-radius: 4px; color: #5b5242; }

/* Kepala */
.bt-kepala { position: relative; overflow: hidden; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; padding: 26px 28px; border-radius: 24px; margin-bottom: 18px;
  background: linear-gradient(135deg, #1f4d3a 0%, #2f6b4f 60%, #4f7f5e 100%); color: #f7f3ea; box-shadow: 0 18px 40px -22px rgba(31, 77, 58, .8); }
.bt-hias { position: absolute; right: -30px; top: -40px; width: 300px; height: 300px; fill: rgba(247, 243, 234, .06); pointer-events: none; }
.bt-kepala-kiri { position: relative; max-width: 640px; }
.bt-tanggal { font-size: 11.5px; letter-spacing: 1.2px; text-transform: uppercase; opacity: .75; }
.bt-kepala h1 { margin: 4px 0 6px; font-family: var(--serif); font-size: 36px; font-weight: 700; letter-spacing: -.5px; line-height: 1.05; color: #fff; }
.bt-kepala h1 em { font-style: italic; font-weight: 400; color: #f2c9a8; }
.bt-kepala p { margin: 0; font-size: 14px; opacity: .88; }
.bt-kepala-aksi { position: relative; display: flex; gap: 8px; flex-wrap: wrap; }
.bt-btn { border-radius: 999px; padding: 10px 18px; font-weight: 700; font-size: 13.5px; cursor: pointer; border: 1.5px solid transparent; transition: transform .15s, background .15s; }
.bt-btn:hover:not(:disabled) { transform: translateY(-1px); }
.bt-btn.garis { background: transparent; border-color: rgba(247, 243, 234, .5); color: #f7f3ea; }
.bt-btn.garis:hover { background: rgba(247, 243, 234, .12); }
.bt-btn.isi { background: #f7f3ea; color: var(--hutan); box-shadow: 0 8px 18px -10px rgba(0, 0, 0, .5); }
.bt-btn.kecil { background: #fff; border-color: var(--garis); color: var(--tinta); padding: 7px 13px; font-size: 12.5px; }
.bt-btn:disabled { opacity: .5; cursor: default; }

/* Angka */
.bt-angka { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 1px solid var(--garis); border-radius: 20px; background: #fff; margin-bottom: 14px; overflow: hidden; }
.bt-angka > * { display: flex; flex-direction: column; gap: 1px; padding: 14px 18px; border: 0; border-right: 1px solid var(--garis); background: none; text-align: left; font: inherit; color: inherit; }
.bt-angka > *:last-child { border-right: 0; }
.bt-angka button { cursor: pointer; transition: background .15s; }
.bt-angka button:hover, .bt-angka button.on { background: #f6f1e6; }
.bt-angka b { font-family: var(--serif); font-size: 30px; font-weight: 700; color: var(--hutan); line-height: 1.05; }
.bt-angka b i { font-style: normal; font-size: 16px; margin-left: 2px; }
.bt-angka span { font-size: 12.5px; font-weight: 700; color: var(--tinta); }
.bt-angka small { font-size: 11px; color: var(--redup); }

/* Komposisi */
.bt-komposisi { margin-bottom: 18px; }
.bt-komposisi-bar { display: flex; gap: 3px; height: 12px; border-radius: 99px; overflow: hidden; margin-bottom: 8px; }
.bt-komposisi-bar button { border: 0; cursor: pointer; padding: 0; transition: opacity .2s; }
.bt-komposisi-bar button.redup { opacity: .25; }
.bt-komposisi-label { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.bt-komposisi-label button { border: 0; background: none; font: inherit; font-size: 12.5px; color: #5b5242; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 0; border-bottom: 2px solid transparent; }
.bt-komposisi-label button.on { border-color: var(--tinta); color: var(--tinta); }
.bt-komposisi-label i { width: 9px; height: 9px; border-radius: 3px; }
.bt-komposisi-label b { color: var(--tinta); }

/* Tata letak */
.bt-tata { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
.bt-utama { min-width: 0; }
.bt-alat { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.bt-cari { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--garis); border-radius: 999px; padding: 0 14px; }
.bt-cari:focus-within { border-color: var(--hutan-2); box-shadow: 0 0 0 3px rgba(47, 107, 79, .12); }
.bt-cari span { font-size: 18px; color: var(--redup); }
.bt-cari input { flex: 1; border: 0; outline: none; background: none; padding: 9px 0; font: inherit; font-size: 13.5px; min-width: 0; color: var(--tinta); }
.bt-cari button { border: 0; background: none; cursor: pointer; color: var(--redup); }
.bt-segmen { display: inline-flex; background: #efe9dc; border-radius: 999px; padding: 3px; gap: 2px; }
.bt-segmen button { border: 0; background: none; padding: 6px 13px; border-radius: 999px; font: inherit; font-size: 12.5px; font-weight: 700; color: #6b6253; cursor: pointer; }
.bt-segmen button.on { background: #fff; color: var(--hutan); box-shadow: 0 1px 4px rgba(28, 42, 34, .12); }
.bt-segmen.ikon button { padding: 6px 11px; font-size: 14px; }
.bt-pilih { border: 1px solid var(--garis); border-radius: 999px; padding: 7px 12px; font-size: 12.5px; background: #fff; color: var(--tinta); font-weight: 600; }
.bt-spasi { flex: 1; }
.bt-hasil { margin: 10px 2px 14px; font-size: 12.5px; color: var(--redup); }
.bt-hasil b { color: var(--tinta); }
.bt-hasil button { border: 0; background: none; color: var(--terakota); font-weight: 700; cursor: pointer; font-size: 12.5px; }

/* Kartu orang */
.bt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
.bt-kartu { --c: #1f4d3a; --l: #e6f3ea; position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 16px 14px 14px; background: #fff; border: 1px solid var(--garis); border-radius: 22px; cursor: pointer;
  transition: transform .2s, box-shadow .2s; animation: bt-muncul .4s both; }
.bt-kartu::before { content: ''; position: absolute; inset: 0 0 auto; height: 64px; border-radius: 22px 22px 0 0; background: var(--l); }
.bt-kartu:hover { transform: translateY(-4px) rotate(-.3deg); box-shadow: 0 18px 32px -20px rgba(28, 42, 34, .45); }
.bt-kartu.mati { filter: grayscale(.9); opacity: .65; }
.bt-kartu.kerangka { height: 280px; background: linear-gradient(90deg, #fff, #f6f1e6, #fff); background-size: 200% 100%; animation: bt-kilau 1.2s infinite; }
@keyframes bt-kilau { to { background-position: -200% 0; } }
@keyframes bt-muncul { from { opacity: 0; transform: translateY(10px); } }
.bt-kartu-atas { position: relative; display: flex; width: 100%; align-items: center; gap: 6px; min-height: 22px; }
.bt-dept { font-size: 11px; font-weight: 800; color: var(--c); letter-spacing: .3px; text-transform: uppercase; }
.bt-dept.kecil { display: inline-block; text-transform: none; letter-spacing: 0; font-size: 12px; padding: 2px 9px; border-radius: 99px; background: var(--l); }
.bt-ultah { margin-left: auto; font-size: 16px; animation: bt-goyang 1.4s ease-in-out infinite; }
@keyframes bt-goyang { 50% { transform: rotate(12deg); } }
.bt-tanda { margin-left: auto; font-size: 10.5px; font-weight: 800; padding: 2px 7px; border-radius: 99px; background: #eee9df; color: #6b6253; }
.bt-tanda.kuning { background: #fdf0d5; color: #8a5a00; }
.bt-ultah + .bt-tanda { margin-left: 0; }
.bt-foto { position: relative; width: 84px; height: 84px; border-radius: 50%; margin: 8px 0 10px; background: var(--c); color: #fff; display: grid; place-items: center; font-family: var(--serif); font-size: 30px; font-weight: 700; overflow: hidden; box-shadow: 0 0 0 4px #fff, 0 0 0 6px var(--l); }
.bt-foto img { width: 100%; height: 100%; object-fit: cover; }
.bt-kartu h3 { margin: 0; font-family: var(--serif); font-size: 17px; font-weight: 700; line-height: 1.2; color: var(--tinta); }
.bt-jabatan { margin: 3px 0 0; font-size: 12.5px; color: #5b5242; min-height: 17px; }
.bt-masa { margin: 8px 0 0; font-size: 11.5px; color: var(--redup); }
.bt-profil { width: 100%; display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.bt-profil div { flex: 1; height: 5px; background: #f0eadd; border-radius: 99px; overflow: hidden; }
.bt-profil i { display: block; height: 100%; background: linear-gradient(90deg, var(--terakota), #e0a35a 60%, #2f7a4d); border-radius: 99px; }
.bt-profil small { font-size: 10.5px; color: var(--redup); white-space: nowrap; }
.bt-profil.mini { min-width: 90px; margin: 0; }
.bt-kontak { display: flex; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--garis); width: 100%; justify-content: center; }
.bt-kontak a, .bt-kontak button { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; text-decoration: none; background: #f6f1e6; border: 0; cursor: pointer; font-size: 14px; transition: transform .15s, background .15s; }
.bt-kontak a:hover, .bt-kontak button:hover { transform: scale(1.12); background: var(--l); }
.bt-kosong { text-align: center; padding: 50px 20px; border: 1.5px dashed var(--garis); border-radius: 22px; background: #fff; }
.bt-kosong div { font-size: 40px; }
.bt-kosong b { display: block; font-family: var(--serif); font-size: 19px; margin: 6px 0 2px; }
.bt-kosong p { margin: 0; color: var(--redup); font-size: 13px; }

/* Tabel */
.bt-tabel { background: #fff; border: 1px solid var(--garis); border-radius: 20px; overflow: auto; }
.bt-tabel table { width: 100%; border-collapse: collapse; font-size: 13px; }
.bt-tabel th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .8px; color: var(--redup); padding: 12px 14px; border-bottom: 1px solid var(--garis); font-weight: 800; }
.bt-tabel td { padding: 10px 14px; border-bottom: 1px solid #f4efe5; vertical-align: middle; }
.bt-tabel tbody tr { cursor: pointer; transition: background .1s; }
.bt-tabel tbody tr:hover { background: #fbf7ef; }
.bt-tabel tr.mati { opacity: .55; }
.bt-orang { display: flex; align-items: center; gap: 10px; }
.bt-orang div { display: flex; flex-direction: column; }
.bt-orang b { font-family: var(--serif); font-size: 14.5px; }
.bt-orang small { font-size: 11.5px; color: var(--redup); }
.bt-av { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-family: var(--serif); font-weight: 700; font-size: 13px; flex-shrink: 0; overflow: hidden; background: var(--c, var(--hutan)); }
.bt-av img { width: 100%; height: 100%; object-fit: cover; }
.bt-av.kecil { width: 30px; height: 30px; font-size: 11px; }

/* Struktur */
.bt-struktur { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; align-items: start; }
.bt-kolom { --c: #1f4d3a; --l: #e6f3ea; background: #fff; border: 1px solid var(--garis); border-top: 4px solid var(--c); border-radius: 18px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.bt-kolom header { display: flex; align-items: center; gap: 8px; padding: 4px 6px 8px; }
.bt-kolom header b { font-family: var(--serif); font-size: 16px; flex: 1; }
.bt-kolom header i { font-style: normal; font-size: 12px; font-weight: 800; color: var(--c); background: var(--l); border-radius: 99px; padding: 1px 8px; }
.bt-kolom-orang { display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 7px 6px; border-radius: 12px; cursor: pointer; text-align: left; font: inherit; }
.bt-kolom-orang:hover { background: var(--l); }
.bt-kolom-orang.mati { opacity: .5; }
.bt-kolom-orang div { display: flex; flex-direction: column; min-width: 0; }
.bt-kolom-orang b { font-size: 13px; }
.bt-kolom-orang small { font-size: 11.5px; color: var(--redup); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Samping */
.bt-samping { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 12px; }
.bt-catatan { background: #fff; border: 1px solid var(--garis); border-radius: 20px; padding: 14px 14px 10px; display: flex; flex-direction: column; gap: 2px; }
.bt-catatan h4 { margin: 0 0 6px; font-family: var(--serif); font-size: 16px; font-weight: 700; }
.bt-baris { display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 7px 6px; border-radius: 12px; cursor: pointer; text-align: left; font: inherit; }
.bt-baris:hover { background: #f8f4ea; }
.bt-baris.hariini { background: #fdf0e3; }
.bt-baris div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.bt-baris b { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bt-baris small { font-size: 11.5px; color: var(--redup); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bt-baris em { font-style: normal; font-size: 11px; font-weight: 800; color: var(--terakota); white-space: nowrap; }
.bt-cincin { --p: 50; width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: conic-gradient(var(--terakota) calc(var(--p) * 1%), #f0eadd 0); }
.bt-cincin i { width: 24px; height: 24px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-style: normal; font-size: 9.5px; font-weight: 800; color: var(--tinta); }

@media (max-width: 1150px) { .bt-tata { grid-template-columns: 1fr; } .bt-samping { position: static; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); } .bt-angka { grid-template-columns: repeat(3, minmax(0, 1fr)); } .bt-angka > *:nth-child(3) { border-right: 0; } .bt-angka > *:nth-child(-n+3) { border-bottom: 1px solid var(--garis); } }
@media (max-width: 640px) { .bt { margin: -12px; padding: 14px 12px 60px; } .bt-kepala { padding: 20px; } .bt-kepala h1 { font-size: 28px; } .bt-angka { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bt-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
