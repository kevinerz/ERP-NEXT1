<script setup lang="ts">
// Form tambah / ubah site — dipakai di daftar site & halaman detail site.
// Disusun per langkah supaya tidak membingungkan: 1 Pelanggan & layanan · 2 Lokasi (cari / klik peta) · 3 Status · 4 Catatan.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMasterStore } from '@/stores/master'
import CariPilih, { type OpsiCari } from '@/components/CariPilih.vue'
import PetaLokasi from '@/components/PetaLokasi.vue'
import { pesanGalat } from '@/composables/useDialog'

const props = defineProps<{ site?: any | null; idPelangganAwal?: number }>()
const emit = defineEmits<{ (e: 'tutup'): void; (e: 'tersimpan', site: any): void }>()
const master = useMasterStore()
const ubah = computed(() => !!props.site?.id_site)

const form = ref({
  id_pelanggan: props.site?.id_pelanggan ?? props.idPelangganAwal ?? 0,
  id_layanan: props.site?.id_layanan ?? 0,
  kode_site: props.site?.kode_site ?? '',
  nama_site: props.site?.nama_site ?? '',
  alamat_lengkap: props.site?.alamat_lengkap ?? '',
  kota: props.site?.kota ?? '',
  provinsi: props.site?.provinsi ?? '',
  koordinat_gps: props.site?.koordinat_gps ?? '',
  status_site: props.site?.status_site ?? 'Aktif',
  tgl_aktif: props.site?.tgl_aktif ? String(props.site.tgl_aktif).slice(0, 10) : '',
  catatan: props.site?.catatan ?? '',
})
const menyimpan = ref(false)
const galat = ref('')
const salahKolom = ref<Set<string>>(new Set())

onMounted(async () => {
  await Promise.all([
    master.pelangganDropdown.length ? null : master.fetchPelangganDropdown(),
    master.layananList.length ? null : master.fetchLayanan(),
  ])
})

const pelangganTerpilih = computed(() => master.pelangganDropdown.find((p) => p.id_pelanggan === form.value.id_pelanggan))
async function cariPelanggan(q: string): Promise<OpsiCari[]> {
  const k = q.toLowerCase()
  return master.pelangganDropdown
    .filter((p) => !k || p.nama_pelanggan.toLowerCase().includes(k) || (p.kode_pelanggan || '').toLowerCase().includes(k))
    .slice(0, 30).map((p) => ({ value: p.id_pelanggan, label: p.nama_pelanggan, sub: p.kode_pelanggan }))
}

const STATUS = [
  { v: 'Prospek', i: '🔵', d: 'Belum terpasang' },
  { v: 'Aktif', i: '🟢', d: 'Layanan berjalan' },
  { v: 'Suspend', i: '🟡', d: 'Dihentikan sementara' },
  { v: 'Dismantle', i: '🔴', d: 'Sudah dibongkar' },
]

// ── Cari lokasi (HERE Maps) ──
const HERE_KEY = import.meta.env.VITE_HERE_API_KEY
const cariPeta = ref(props.site?.nama_site ?? '')
const hasilPeta = ref<any[]>([])
const memuatPeta = ref(false)
const bukaPeta = ref(false)
let tunda: ReturnType<typeof setTimeout> | null = null
let urutanPeta = 0
function ketikPeta() {
  if (tunda) clearTimeout(tunda)
  tunda = setTimeout(async () => {
    const q = cariPeta.value.trim()
    const ke = ++urutanPeta
    if (q.length < 2 || !HERE_KEY) { hasilPeta.value = []; memuatPeta.value = false; return }
    memuatPeta.value = true
    try {
      const url = new URL('https://autosuggest.search.hereapi.com/v1/autosuggest')
      url.searchParams.set('q', q); url.searchParams.set('at', '-6.2,106.8'); url.searchParams.set('limit', '6'); url.searchParams.set('apiKey', HERE_KEY)
      const d = await (await fetch(url.toString())).json()
      if (ke !== urutanPeta) return
      hasilPeta.value = (d.items || []).filter((x: any) => x.position).map((x: any) => ({
        name: (x.title.match(/^[^(]+\((.+)\)\s*$/)?.[1]) ?? x.title,
        address: x.address?.label || '', city: x.address?.city || x.address?.district || '', province: x.address?.state || '',
        lat: x.position.lat, lng: x.position.lng,
      }))
      bukaPeta.value = hasilPeta.value.length > 0
    } catch { if (ke === urutanPeta) hasilPeta.value = [] } finally { if (ke === urutanPeta) memuatPeta.value = false }
  }, 350)
}
function tutupSaranNanti() { setTimeout(() => (bukaPeta.value = false), 200) }
function pilihPeta(r: any) {
  if (!form.value.nama_site) form.value.nama_site = r.name
  form.value.alamat_lengkap = r.address || form.value.alamat_lengkap
  form.value.kota = r.city || form.value.kota
  form.value.provinsi = r.province || form.value.provinsi
  form.value.koordinat_gps = `${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`
  cariPeta.value = r.name; bukaPeta.value = false
}
onUnmounted(() => { if (tunda) clearTimeout(tunda) })

const linkGmaps = computed(() => form.value.koordinat_gps ? `https://www.google.com/maps?q=${encodeURIComponent(form.value.koordinat_gps)}` : '')

async function simpan() {
  if (menyimpan.value) return
  const f = form.value
  const wajib: [string, any, string][] = [
    ['id_pelanggan', f.id_pelanggan, 'Pelanggan'], ['id_layanan', f.id_layanan, 'Layanan'], ['kode_site', f.kode_site.trim(), 'Kode site'],
    ['nama_site', f.nama_site.trim(), 'Nama site'], ['alamat_lengkap', f.alamat_lengkap.trim(), 'Alamat'],
    ...(!ubah.value ? [['kota', f.kota.trim(), 'Kota'], ['provinsi', f.provinsi.trim(), 'Provinsi']] as [string, any, string][] : []),
  ]
  const kurang = wajib.filter(([, v]) => !v)
  salahKolom.value = new Set(kurang.map(([k]) => k))
  if (kurang.length) { galat.value = `Lengkapi dulu: ${kurang.map(([, , l]) => l).join(', ')}`; return }
  if (f.koordinat_gps && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(f.koordinat_gps.trim())) { galat.value = 'Format koordinat: lintang, bujur — contoh -6.123456, 106.123456'; salahKolom.value = new Set(['koordinat_gps']); return }
  menyimpan.value = true; galat.value = ''
  try {
    const payload: any = { ...f }
    Object.keys(payload).forEach((k) => { if (payload[k] === '' || payload[k] === 0) delete payload[k] })
    let hasil
    if (ubah.value) {
      for (const k of ['kota', 'provinsi', 'koordinat_gps', 'tgl_aktif', 'catatan'] as const) if (!f[k]) payload[k] = null
      delete payload.id_pelanggan; delete payload.kode_site
      hasil = await master.updateSite(props.site.id_site, payload)
    } else hasil = await master.createSite(payload)
    emit('tersimpan', hasil)
  } catch (e: any) { galat.value = pesanGalat(e, 'Gagal menyimpan site') }
  finally { menyimpan.value = false }
}
</script>

<template>
  <div class="modal-overlay sf-latar" @click.self="emit('tutup')">
    <div class="sf" role="dialog" :aria-label="ubah ? 'Ubah site' : 'Tambah site'">
      <div class="sf-kepala">
        <div>
          <b>{{ ubah ? '✏️ Ubah data site' : '📍 Tambah site baru' }}</b>
          <small v-if="ubah">{{ site.kode_site }} · {{ site.nama_site }}</small>
        </div>
        <button type="button" class="sf-x" aria-label="Tutup" @click="emit('tutup')">✕</button>
      </div>

      <div class="sf-badan">
        <!-- 1. Pelanggan & layanan -->
        <section class="sf-bagian">
          <h4><span>1</span> Pelanggan &amp; layanan</h4>
          <div class="sf-kisi">
            <label class="sf-f lebar" :class="{ salah: salahKolom.has('id_pelanggan') }"><span class="sf-l">Pelanggan <i>*</i></span>
              <div v-if="ubah" class="sf-tetap">🏢 {{ pelangganTerpilih?.nama_pelanggan ?? site.pelanggan?.nama_pelanggan }} <small>(tidak bisa diganti)</small></div>
              <CariPilih v-else :model-value="form.id_pelanggan || null" :cari="cariPelanggan" placeholder="Cari nama perusahaan…"
                :label-terpilih="pelangganTerpilih?.nama_pelanggan" @update:model-value="(v) => (form.id_pelanggan = v || 0)" />
            </label>
            <label class="sf-f" :class="{ salah: salahKolom.has('id_layanan') }"><span class="sf-l">Layanan <i>*</i></span>
              <select v-model.number="form.id_layanan">
                <option :value="0">— Pilih layanan —</option>
                <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">{{ l.nama_layanan }}</option>
              </select>
            </label>
            <label class="sf-f" :class="{ salah: salahKolom.has('kode_site') }"><span class="sf-l">Kode site <i>*</i></span>
              <input v-model="form.kode_site" :disabled="ubah" placeholder="mis. ERA-0028" />
              <small v-if="ubah">Kode tidak bisa diubah</small>
            </label>
          </div>
        </section>

        <!-- 2. Lokasi -->
        <section class="sf-bagian">
          <h4><span>2</span> Lokasi</h4>
          <div class="sf-cari-peta">
            <span aria-hidden="true">🔎</span>
            <input v-model="cariPeta" placeholder="Cari tempat / alamat untuk isi otomatis (mis. Manado Town Square)" autocomplete="off"
              @input="ketikPeta" @focus="bukaPeta = hasilPeta.length > 0" @blur="tutupSaranNanti" />
            <span v-if="memuatPeta" class="sf-putar" />
            <ul v-if="bukaPeta" class="sf-saran">
              <li v-for="r in hasilPeta" :key="r.name + r.lat" @mousedown.prevent="pilihPeta(r)"><b>{{ r.name }}</b><small>{{ r.address }}</small></li>
            </ul>
          </div>
          <div class="sf-kisi">
            <label class="sf-f lebar" :class="{ salah: salahKolom.has('nama_site') }"><span class="sf-l">Nama site <i>*</i></span>
              <input v-model="form.nama_site" placeholder="Nama toko / kantor / outlet" />
            </label>
            <label class="sf-f lebar" :class="{ salah: salahKolom.has('alamat_lengkap') }"><span class="sf-l">Alamat lengkap <i>*</i></span>
              <textarea v-model="form.alamat_lengkap" rows="2" placeholder="Jl. …, lantai / unit" />
            </label>
            <label class="sf-f" :class="{ salah: salahKolom.has('kota') }"><span class="sf-l">Kota <i v-if="!ubah">*</i></span><input v-model="form.kota" placeholder="Manado" /></label>
            <label class="sf-f" :class="{ salah: salahKolom.has('provinsi') }"><span class="sf-l">Provinsi <i v-if="!ubah">*</i></span><input v-model="form.provinsi" placeholder="Sulawesi Utara" /></label>
          </div>
          <div class="sf-peta-baris">
            <PetaLokasi v-model:koordinat="form.koordinat_gps" bisa-ubah :tinggi="200" />
            <label class="sf-f" :class="{ salah: salahKolom.has('koordinat_gps') }">Koordinat GPS
              <input v-model="form.koordinat_gps" placeholder="-6.123456, 106.123456" />
              <small>Klik / seret pin di peta, atau tempel dari Google Maps.</small>
              <a v-if="linkGmaps" :href="linkGmaps" target="_blank" rel="noopener" class="sf-link">Buka di Google Maps ↗</a>
            </label>
          </div>
        </section>

        <!-- 3. Status -->
        <section class="sf-bagian">
          <h4><span>3</span> Status layanan</h4>
          <div class="sf-status" role="radiogroup" aria-label="Status site">
            <button v-for="s in STATUS" :key="s.v" type="button" role="radio" :aria-checked="form.status_site === s.v"
              :class="{ on: form.status_site === s.v }" @click="form.status_site = s.v">
              <span>{{ s.i }}</span><b>{{ s.v }}</b><small>{{ s.d }}</small>
            </button>
          </div>
          <label class="sf-f kecil">Tanggal aktif<input v-model="form.tgl_aktif" type="date" /></label>
        </section>

        <!-- 4. Catatan -->
        <section class="sf-bagian">
          <h4><span>4</span> Catatan <small>(opsional)</small></h4>
          <textarea v-model="form.catatan" rows="2" class="sf-catatan" placeholder="Info akses lokasi, jam operasional, dll." />
        </section>
      </div>

      <div class="sf-kaki">
        <p v-if="galat" class="sf-galat" role="alert">⚠️ {{ galat }}</p>
        <span class="spasi" />
        <button type="button" class="btn btn-ghost" :disabled="menyimpan" @click="emit('tutup')">Batal</button>
        <button type="button" class="btn btn-primary" :disabled="menyimpan" @click="simpan">{{ menyimpan ? 'Menyimpan…' : ubah ? 'Simpan perubahan' : 'Tambah site' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sf-latar { align-items: flex-start; padding: 24px 12px; overflow-y: auto; }
.sf { width: min(760px, 100%); background: #fff; border-radius: 20px; box-shadow: 0 30px 70px rgba(15, 23, 42, .3); display: flex; flex-direction: column; max-height: calc(100vh - 48px); overflow: hidden; animation: naik .25s ease-out; }
.sf-kepala { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: linear-gradient(120deg, #eaf2fd, #f3effd); border-bottom: 1px solid #e2e8f0; }
.sf-kepala b { display: block; font-size: 17px; color: #0f172a; }
.sf-kepala small { color: #64748b; font-size: 12.5px; }
.sf-x { width: 34px; height: 34px; border-radius: 10px; border: 0; background: #fff; cursor: pointer; font-size: 15px; }
.sf-badan { padding: 6px 20px 10px; overflow-y: auto; }
.sf-bagian { padding: 14px 0; border-bottom: 1px dashed #e2e8f0; }
.sf-bagian:last-child { border-bottom: 0; }
.sf-bagian h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 14px; color: #0f172a; }
.sf-bagian h4 span { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: #2a78d6; color: #fff; font-size: 12px; }
.sf-bagian h4 small { color: #94a3b8; font-weight: 500; }
.sf-kisi { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sf-f { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 700; color: #334155; min-width: 0; }
.sf-f i { color: #dc2626; font-style: normal; }
.sf-f.lebar { grid-column: 1 / -1; }
.sf-f.kecil { max-width: 220px; margin-top: 12px; }
.sf-f input, .sf-f select, .sf-f textarea, .sf-catatan { padding: 9px 11px; border: 1px solid #e2e8f0; border-radius: 10px; font: inherit; font-weight: 400; font-size: 14px; color: #0f172a; background: #fff; width: 100%; }
.sf-f input:focus, .sf-f select:focus, .sf-f textarea:focus, .sf-catatan:focus { outline: none; border-color: #2a78d6; box-shadow: 0 0 0 3px #dbeafe; }
.sf-f input:disabled { background: #f8fafc; color: #64748b; }
.sf-f small { font-weight: 500; color: #94a3b8; }
.sf-f.salah input, .sf-f.salah select, .sf-f.salah textarea, .sf-f.salah :deep(.cp-input) { border-color: #f87171; background: #fff7f7; }
.sf-tetap { padding: 9px 11px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600; color: #0f172a; }
.sf-tetap small { color: #94a3b8; font-weight: 500; }
.sf-cari-peta { position: relative; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 44px; margin-bottom: 12px; border-radius: 12px; background: #f8fafc; border: 1px dashed #93c5fd; }
.sf-cari-peta input { flex: 1; min-width: 0; border: 0; background: none; outline: none; font: inherit; font-size: 14px; }
.sf-saran { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 1000; margin: 0; padding: 4px; list-style: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 12px 28px rgba(15, 23, 42, .15); }
.sf-saran li { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.sf-saran li:hover { background: #eef5ff; }
.sf-saran small { color: #64748b; }
.sf-putar { width: 16px; height: 16px; border: 2px solid #dbeafe; border-top-color: #2a78d6; border-radius: 50%; animation: putar .7s linear infinite; }
.sf-peta-baris { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-top: 12px; align-items: start; }
.sf-link { font-weight: 700; color: #1d4ed8; text-decoration: none; font-size: 12.5px; }
.sf-status { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.sf-status button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 12px; border: 2px solid #e2e8f0; background: #fff; cursor: pointer; transition: all .15s; }
.sf-status button b { font-size: 13px; color: #0f172a; }
.sf-status button small { font-size: 11px; color: #64748b; text-align: center; }
.sf-status button.on { border-color: #2a78d6; background: #eef5ff; box-shadow: 0 4px 12px rgba(42, 120, 214, .15); }
.sf-catatan { min-height: 60px; }
.sf-kaki { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid #e2e8f0; background: #fbfcfe; flex-wrap: wrap; }
.sf-galat { margin: 0; color: #b91c1c; font-size: 13px; font-weight: 600; }
.spasi { flex: 1; }
@keyframes naik { from { opacity: 0; transform: translateY(16px); } }
@keyframes putar { to { transform: rotate(360deg); } }
@media (max-width: 640px) {
  .sf-latar { padding: 0; }
  .sf { max-height: 100vh; height: 100%; border-radius: 0; }
  .sf-kisi, .sf-peta-baris { grid-template-columns: 1fr; }
  .sf-status { grid-template-columns: 1fr 1fr; }
}
</style>
