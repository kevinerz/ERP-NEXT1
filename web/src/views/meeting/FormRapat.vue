<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import api from '@/services/api'
import { toast, pesanGalat } from '@/composables/useDialog'
import KaryawanPicker from './KaryawanPicker.vue'
import { KATEGORI, TEMPLAT, labelKategori, tglPanjang } from './rapat-util'

// Modal buat / ubah rapat
interface Awal {
  id_rapat?: number; judul?: string; deskripsi?: string | null; jadwal_at?: string | null; durasi_menit?: number | null
  kategori?: string | null; lokasi?: string | null; status?: string
}
const props = defineProps<{ awal?: Awal; mode?: 'baru' | 'ubah'; segera?: boolean }>()
const emit = defineEmits<{ tutup: []; tersimpan: [data: any, masuk: boolean] }>()

const pad = (n: number) => String(n).padStart(2, '0')
const keLokal = (d: Date) => ({ tgl: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, jam: `${pad(d.getHours())}:${pad(d.getMinutes())}` })
function bulatkan() {
  const d = new Date(Date.now() + 3600_000)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return d
}
const ubah = props.mode === 'ubah'
const awalJadwal = props.awal?.jadwal_at ? new Date(props.awal.jadwal_at) : bulatkan()
const f = reactive({
  judul: props.awal?.judul ?? '',
  deskripsi: props.awal?.deskripsi ?? '',
  mode: (ubah ? (props.awal?.jadwal_at ? 'jadwal' : 'sekarang') : props.segera ? 'sekarang' : 'jadwal') as 'sekarang' | 'jadwal',
  tgl: keLokal(awalJadwal).tgl,
  jam: keLokal(awalJadwal).jam,
  durasi: props.awal?.durasi_menit ?? 60,
  kategori: props.awal?.kategori ?? '',
  lokasi: props.awal?.lokasi ?? '',
  peserta: [] as number[],
  ulang: 1,
})
const simpan = ref(false)
const err = ref('')

const jadwalIso = computed(() => (f.mode === 'jadwal' && f.tgl && f.jam ? new Date(`${f.tgl}T${f.jam}`) : null))
const lewat = computed(() => !!jadwalIso.value && +jadwalIso.value < Date.now() - 60_000)
const siap = computed(() => f.judul.trim().length >= 2 && (f.mode === 'sekarang' || (!!jadwalIso.value && !isNaN(+jadwalIso.value))))

function pakaiTemplat(t: (typeof TEMPLAT)[number]) {
  f.judul = t.judul
  f.kategori = t.kategori
  f.durasi = t.durasi
  if (!f.deskripsi.trim()) f.deskripsi = t.agenda
}
function cepat(jenis: 'jam' | 'besok' | 'senin' | 'sore') {
  const d = new Date()
  if (jenis === 'jam') { d.setTime(bulatkan().getTime()) }
  else if (jenis === 'sore') { d.setHours(16, 0, 0, 0); if (+d < Date.now()) d.setDate(d.getDate() + 1) }
  else if (jenis === 'besok') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0) }
  else { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0) }
  f.mode = 'jadwal'
  Object.assign(f, keLokal(d))
}

async function kirim() {
  if (!siap.value || simpan.value) return
  simpan.value = true
  err.value = ''
  let ulang = 1
  let dibuat = 0
  let pertama: any = null
  try {
    const dasar = {
      judul: f.judul.trim(), deskripsi: f.deskripsi.trim(), durasi_menit: f.durasi || undefined,
      kategori: f.kategori || undefined, lokasi: f.lokasi.trim() || undefined,
    }
    if (ubah) {
      const { data } = await api.patch(`/meeting/${props.awal!.id_rapat}`, {
        ...dasar, kategori: f.kategori || null, lokasi: f.lokasi.trim() || null,
        jadwal_at: f.mode === 'jadwal' ? jadwalIso.value!.toISOString() : null,
      })
      toast('Rapat diperbarui')
      emit('tersimpan', data.data, false)
      return
    }
    ulang = f.mode === 'jadwal' ? Math.max(1, Math.min(8, f.ulang)) : 1
    for (let i = 0; i < ulang; i++) {
      const jadwal = f.mode === 'jadwal' ? new Date(+jadwalIso.value! + i * 7 * 86400_000).toISOString() : undefined
      const { data } = await api.post('/meeting', { ...dasar, deskripsi: dasar.deskripsi || undefined, peserta: f.peserta, jadwal_at: jadwal })
      pertama ??= data.data
      dibuat++
    }
    toast(ulang > 1 ? `${ulang} rapat mingguan dijadwalkan` : f.mode === 'sekarang' ? 'Rapat dibuat — menyambungkan…' : 'Rapat dijadwalkan & undangan terkirim')
    emit('tersimpan', pertama, f.mode === 'sekarang')
  } catch (e: any) {
    // Rapat berulang gagal di tengah jalan: yang sudah terbuat tetap ada — tutup form agar tidak dikirim ulang (dobel)
    if (dibuat > 0) {
      toast(`${dibuat} dari ${ulang} rapat terjadwal; sisanya gagal dibuat: ${pesanGalat(e, 'kesalahan server')}`, 'warning', 9000)
      emit('tersimpan', pertama, false)
      return
    }
    err.value = pesanGalat(e, 'Gagal menyimpan rapat')
  } finally {
    simpan.value = false
  }
}
</script>

<template>
  <div class="fr-overlay" @click.self="emit('tutup')" @keydown.esc="emit('tutup')">
    <form v-focus-trap class="fr" @submit.prevent="kirim">
      <header class="fr-kepala">
        <div>
          <h3>{{ ubah ? 'Ubah rapat' : f.mode === 'sekarang' ? '⚡ Rapat sekarang' : '🗓️ Jadwalkan rapat' }}</h3>
          <p>{{ ubah ? 'Peserta akan diberi tahu bila jadwal berubah.' : 'Anda otomatis menjadi moderator. Undangan masuk ke lonceng notifikasi peserta.' }}</p>
        </div>
        <button type="button" class="fr-x" aria-label="Tutup" @click="emit('tutup')">×</button>
      </header>

      <div class="fr-isi">
        <div v-if="!ubah" class="fr-templat">
          <span>Templat:</span>
          <button v-for="t in TEMPLAT" :key="t.judul" type="button" @click="pakaiTemplat(t)">{{ t.judul }}</button>
        </div>

        <label class="fr-label">Judul rapat <b>*</b></label>
        <input v-model="f.judul" autofocus class="fr-input fr-judul" maxlength="200" placeholder="mis. Koordinasi NOC mingguan" />

        <label class="fr-label">Kategori</label>
        <div class="fr-pil">
          <button v-for="k in KATEGORI" :key="k.kode" type="button" :class="{ on: f.kategori === k.kode }" :style="{ '--c': k.warna }" @click="f.kategori = f.kategori === k.kode ? '' : k.kode">
            {{ k.ikon }} {{ labelKategori(k.kode) }}
          </button>
        </div>

        <label class="fr-label">Waktu</label>
        <div class="fr-segmen">
          <button type="button" :class="{ on: f.mode === 'sekarang' }" @click="f.mode = 'sekarang'">⚡ Mulai sekarang</button>
          <button type="button" :class="{ on: f.mode === 'jadwal' }" @click="f.mode = 'jadwal'">🗓️ Jadwalkan</button>
        </div>
        <template v-if="f.mode === 'jadwal'">
          <div class="fr-baris">
            <input v-model="f.tgl" type="date" class="fr-input" />
            <input v-model="f.jam" type="time" step="300" class="fr-input" />
          </div>
          <div class="fr-cepat">
            <button type="button" @click="cepat('jam')">+1 jam</button>
            <button type="button" @click="cepat('sore')">Sore 16.00</button>
            <button type="button" @click="cepat('besok')">Besok 09.00</button>
            <button type="button" @click="cepat('senin')">Senin 09.00</button>
          </div>
          <small v-if="jadwalIso && !isNaN(+jadwalIso)" class="fr-bantu" :class="{ peringatan: lewat }">
            {{ lewat ? '⚠️ Waktu sudah lewat — ' : '' }}{{ tglPanjang(jadwalIso) }} pukul {{ f.jam }} WIB
          </small>
        </template>

        <label class="fr-label">Durasi</label>
        <div class="fr-pil kecil">
          <button v-for="m in [15, 30, 45, 60, 90, 120]" :key="m" type="button" :class="{ on: f.durasi === m }" @click="f.durasi = m">{{ m < 60 ? `${m} mnt` : `${m / 60} jam` }}</button>
        </div>

        <template v-if="!ubah && f.mode === 'jadwal'">
          <label class="fr-label">Ulangi tiap minggu</label>
          <div class="fr-pil kecil">
            <button v-for="n in [1, 2, 4, 8]" :key="n" type="button" :class="{ on: f.ulang === n }" @click="f.ulang = n">{{ n === 1 ? 'Sekali' : `${n}× minggu` }}</button>
          </div>
        </template>

        <label class="fr-label">Lokasi fisik <small>(opsional — bila sebagian hadir di ruang rapat)</small></label>
        <input v-model="f.lokasi" class="fr-input" maxlength="200" placeholder="mis. Ruang rapat lt. 2 · Kantor Jakarta" />

        <template v-if="!ubah">
          <label class="fr-label">Peserta <small>({{ f.peserta.length }} dipilih)</small></label>
          <KaryawanPicker v-model="f.peserta" />
        </template>

        <label class="fr-label">Agenda <small>(opsional)</small></label>
        <textarea v-model="f.deskripsi" class="fr-input" rows="4" maxlength="5000" placeholder="Poin yang akan dibahas"></textarea>

        <p v-if="err" class="fr-err">{{ err }}</p>
      </div>

      <footer class="fr-kaki">
        <small v-if="!ubah && f.mode === 'jadwal' && f.ulang > 1">{{ f.ulang }} rapat akan dibuat, tiap minggu di jam yang sama.</small>
        <span class="fr-spasi"></span>
        <button type="button" class="fr-btn ghost" @click="emit('tutup')">Batal</button>
        <button type="submit" class="fr-btn utama" :disabled="!siap || simpan">
          {{ simpan ? 'Menyimpan…' : ubah ? 'Simpan perubahan' : f.mode === 'sekarang' ? 'Buat & masuk' : 'Jadwalkan & undang' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.fr-overlay { position: fixed; inset: 0; z-index: 800; background: rgba(15, 23, 42, .55); backdrop-filter: blur(3px); display: flex; align-items: flex-start; justify-content: center; padding: 4vh 12px; overflow: auto; animation: fr-pudar .15s; }
.fr { width: 100%; max-width: 640px; background: #fff; border-radius: 20px; box-shadow: 0 30px 70px -20px rgba(15, 23, 42, .55); display: flex; flex-direction: column; animation: fr-naik .2s; }
@keyframes fr-pudar { from { opacity: 0 } }
@keyframes fr-naik { from { opacity: 0; transform: translateY(14px) scale(.98) } }
.fr-kepala { display: flex; justify-content: space-between; gap: 10px; padding: 18px 22px 12px; border-bottom: 1px solid #f1f5f9; }
.fr-kepala h3 { margin: 0; font-size: 18px; font-weight: 900; color: #0f172a; }
.fr-kepala p { margin: 3px 0 0; font-size: 12.5px; color: #64748b; }
.fr-x { border: 0; background: #f1f5f9; width: 32px; height: 32px; border-radius: 50%; font-size: 20px; cursor: pointer; color: #475569; flex-shrink: 0; }
.fr-isi { padding: 14px 22px; display: flex; flex-direction: column; gap: 6px; }
.fr-templat { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: #64748b; padding: 10px; border-radius: 12px; background: linear-gradient(120deg, #eef2ff, #faf5ff); margin-bottom: 4px; }
.fr-templat button { border: 1px solid #c7d2fe; background: #fff; color: #4338ca; border-radius: 99px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
.fr-templat button:hover { background: #4f46e5; color: #fff; }
.fr-label { font-size: 12.5px; font-weight: 800; color: #334155; margin-top: 8px; }
.fr-label b { color: #e11d48; }
.fr-label small { font-weight: 500; color: #94a3b8; }
.fr-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 11px; font: inherit; font-size: 14px; color: #0f172a; background: #fff; }
.fr-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, .18); }
.fr-judul { font-size: 16px; font-weight: 700; }
textarea.fr-input { resize: vertical; }
.fr-pil { display: flex; flex-wrap: wrap; gap: 6px; }
.fr-pil button { --c: #4f46e5; border: 1px solid #e2e8f0; background: #fff; border-radius: 99px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; color: #334155; transition: all .12s; }
.fr-pil button:hover { border-color: var(--c); }
.fr-pil button.on { background: var(--c); border-color: var(--c); color: #fff; box-shadow: 0 4px 12px -4px var(--c); }
.fr-pil.kecil button { padding: 5px 11px; font-size: 12.5px; }
.fr-segmen { display: inline-flex; background: #f1f5f9; border-radius: 12px; padding: 3px; gap: 3px; align-self: flex-start; }
.fr-segmen button { border: 0; background: none; padding: 7px 14px; border-radius: 9px; font-weight: 700; font-size: 13px; cursor: pointer; color: #475569; }
.fr-segmen button.on { background: #fff; color: #4338ca; box-shadow: 0 2px 6px rgba(15, 23, 42, .1); }
.fr-baris { display: grid; grid-template-columns: 1fr 140px; gap: 8px; margin-top: 4px; }
.fr-cepat { display: flex; flex-wrap: wrap; gap: 6px; }
.fr-cepat button { border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 8px; padding: 4px 9px; font-size: 12px; cursor: pointer; color: #475569; }
.fr-cepat button:hover { border-color: #6366f1; color: #4338ca; }
.fr-bantu { font-size: 12px; color: #4338ca; font-weight: 600; }
.fr-bantu.peringatan { color: #b45309; }
.fr-err { margin: 6px 0 0; padding: 9px 12px; border-radius: 10px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
.fr-kaki { display: flex; align-items: center; gap: 8px; padding: 12px 22px 18px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; }
.fr-kaki small { font-size: 12px; color: #64748b; }
.fr-spasi { flex: 1; }
.fr-btn { border: 0; border-radius: 11px; padding: 10px 16px; font-weight: 800; font-size: 14px; cursor: pointer; }
.fr-btn.ghost { background: #f1f5f9; color: #334155; }
.fr-btn.utama { background: linear-gradient(120deg, #4f46e5, #7c3aed); color: #fff; box-shadow: 0 8px 18px -8px #6d28d9; }
.fr-btn:disabled { opacity: .5; cursor: default; box-shadow: none; }
@media (max-width: 560px) { .fr-baris { grid-template-columns: 1fr 1fr; } .fr-isi, .fr-kepala, .fr-kaki { padding-left: 14px; padding-right: 14px; } }
</style>
