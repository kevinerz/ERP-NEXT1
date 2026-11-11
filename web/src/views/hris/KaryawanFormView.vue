<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useHrisStore } from '@/stores/hris'
import { confirmDialog } from '@/composables/useDialog'
import { infoDept, inisial, masaKerjaTeks, umur } from './hris-util'
import { onBeforeUnmount } from 'vue'

const router = useRouter()
const route = useRoute()
const hris = useHrisStore()

const isEdit = computed(() => !!route.params.id && route.params.id !== 'tambah')
const id = computed(() => isEdit.value ? Number(route.params.id) : null)

const EMPTY_FORM = () => ({
  nip: '',
  nama_lengkap: '',
  jabatan: '',
  departemen: '',
  no_hp: '',
  email: '',
  tgl_bergabung: '',
  status_aktif: true,
  tempat_lahir: '',
  tgl_lahir: '',
  jenis_kelamin: '',
  agama: '',
  status_pernikahan: '',
  no_ktp: '',
  alamat_ktp: '',
  no_npwp: '',
  pendidikan_terakhir: '',
  kontak_darurat_nama: '',
  kontak_darurat_hp: '',
  kontak_darurat_hubungan: '',
  bank_nama: '',
  bank_no_rekening: '',
  bank_atas_nama: '',
})

const form = ref(EMPTY_FORM())
const submitting = ref(false)
const errorMsg = ref('')
// status muat data (mode edit) — gagal muat jangan tampil sebagai form kosong
const muatForm = ref(false)
const muatError = ref('')
// snapshot isian awal untuk peringatan perubahan belum disimpan
const awal = ref(JSON.stringify(form.value))
const berubah = computed(() => JSON.stringify(form.value) !== awal.value)
const tersimpan = ref(false)
const departemenGagal = ref(false)

// Muat ulang tiap kali route berubah (Tambah -> Edit -> Tambah tanpa reload
// halaman sebelumnya membuat data karyawan lama tetap nempel di form).
async function loadForm() {
  errorMsg.value = ''
  muatError.value = ''
  form.value = EMPTY_FORM()
  awal.value = JSON.stringify(form.value)
  if (isEdit.value && id.value) {
    muatForm.value = true
    hris.error = ''
    const data = await hris.fetchOne(id.value)
    muatForm.value = false
    if (!data) { muatError.value = hris.error || 'Gagal memuat data karyawan'; return }
    if (data) {
      form.value = {
        nip: data.nip,
        nama_lengkap: data.nama_lengkap,
        jabatan: data.jabatan,
        departemen: data.departemen,
        no_hp: data.no_hp || '',
        email: data.email || '',
        tgl_bergabung: data.tgl_bergabung ? data.tgl_bergabung.substring(0, 10) : '',
        status_aktif: data.status_aktif,
        tempat_lahir: data.tempat_lahir || '',
        tgl_lahir: data.tgl_lahir ? data.tgl_lahir.substring(0, 10) : '',
        jenis_kelamin: data.jenis_kelamin || '',
        agama: data.agama || '',
        status_pernikahan: data.status_pernikahan || '',
        no_ktp: data.no_ktp || '',
        alamat_ktp: data.alamat_ktp || '',
        no_npwp: data.no_npwp || '',
        pendidikan_terakhir: data.pendidikan_terakhir || '',
        kontak_darurat_nama: data.kontak_darurat_nama || '',
        kontak_darurat_hp: data.kontak_darurat_hp || '',
        kontak_darurat_hubungan: data.kontak_darurat_hubungan || '',
        bank_nama: data.bank_nama || '',
        bank_no_rekening: data.bank_no_rekening || '',
        bank_atas_nama: data.bank_atas_nama || '',
      }
      awal.value = JSON.stringify(form.value)
    }
  }
}

async function muatDepartemen() {
  await hris.fetchDepartemen()
  departemenGagal.value = !hris.departemenList.length
}

onMounted(async () => {
  await muatDepartemen()
  await loadForm()
})

onBeforeRouteLeave(async () => {
  if (tersimpan.value || !berubah.value) return true
  return await confirmDialog({ title: 'Perubahan belum disimpan', message: 'Isian karyawan belum disimpan. Tinggalkan halaman ini?', confirmLabel: 'Tinggalkan', variant: 'warning' })
})

watch(() => route.params.id, () => { loadForm() })

async function submit() {
  errorMsg.value = ''
  if (!form.value.nip || !form.value.nama_lengkap || !form.value.jabatan || !form.value.departemen) {
    errorMsg.value = 'NIP, Nama, Jabatan, dan Departemen wajib diisi'
    return
  }
  if (form.value.no_ktp && !/^\d{16}$/.test(form.value.no_ktp.trim())) {
    errorMsg.value = 'No. KTP harus 16 digit angka'
    return
  }
  if (form.value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim())) {
    errorMsg.value = 'Format email tidak valid'
    return
  }

  submitting.value = true
  try {
    // Saat edit, field opsional yang dikosongkan dikirim null agar benar-benar
    // terhapus di server; saat tambah cukup dihilangkan (undefined).
    const kosong = isEdit.value ? null : undefined
    const f = form.value
    const payload = {
      ...f,
      tgl_bergabung: f.tgl_bergabung || kosong,
      no_hp: f.no_hp || kosong,
      email: f.email || kosong,
      tempat_lahir: f.tempat_lahir || kosong,
      tgl_lahir: f.tgl_lahir || kosong,
      jenis_kelamin: f.jenis_kelamin || kosong,
      agama: f.agama || kosong,
      status_pernikahan: f.status_pernikahan || kosong,
      no_ktp: f.no_ktp || kosong,
      alamat_ktp: f.alamat_ktp || kosong,
      no_npwp: f.no_npwp || kosong,
      pendidikan_terakhir: f.pendidikan_terakhir || kosong,
      kontak_darurat_nama: f.kontak_darurat_nama || kosong,
      kontak_darurat_hp: f.kontak_darurat_hp || kosong,
      kontak_darurat_hubungan: f.kontak_darurat_hubungan || kosong,
      bank_nama: f.bank_nama || kosong,
      bank_no_rekening: f.bank_no_rekening || kosong,
      bank_atas_nama: f.bank_atas_nama || kosong,
    }

    if (isEdit.value && id.value) {
      await hris.updateKaryawan(id.value, payload)
      tersimpan.value = true
      router.push(`/hris/karyawan/${id.value}`)
    } else {
      const result = await hris.createKaryawan(payload)
      tersimpan.value = true
      router.push(`/hris/karyawan/${result.id_karyawan}`)
    }
  } catch (e: any) {
    errorMsg.value = e.response?.data?.message || 'Terjadi kesalahan'
  } finally {
    submitting.value = false
  }
}

// ─── Pratinjau & kelengkapan per bagian ───────────────────────
const dept = computed(() => infoDept(form.value.departemen))
const BAGIAN = [
  { kunci: 'kerja', judul: 'Pekerjaan', ikon: '💼', field: ['nip', 'nama_lengkap', 'jabatan', 'departemen', 'no_hp', 'email', 'tgl_bergabung'] },
  { kunci: 'pribadi', judul: 'Data pribadi', ikon: '🪪', field: ['tempat_lahir', 'tgl_lahir', 'jenis_kelamin', 'agama', 'status_pernikahan', 'no_ktp', 'no_npwp', 'pendidikan_terakhir', 'alamat_ktp'] },
  { kunci: 'darurat', judul: 'Kontak darurat', ikon: '🚑', field: ['kontak_darurat_nama', 'kontak_darurat_hp', 'kontak_darurat_hubungan'] },
  { kunci: 'bank', judul: 'Rekening payroll', ikon: '🏦', field: ['bank_nama', 'bank_no_rekening', 'bank_atas_nama'] },
] as const
const isi = (f: string) => !!String((form.value as any)[f] ?? '').trim()
const progres = computed(() => BAGIAN.map((b) => ({ ...b, terisi: b.field.filter(isi).length, total: b.field.length })))
const totalPersen = computed(() => {
  const semua = BAGIAN.flatMap((b) => b.field)
  return Math.round((semua.filter(isi).length / semua.length) * 100)
})
function lompat(kunci: string) { document.getElementById(`bag-${kunci}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
const ktpValid = computed(() => !form.value.no_ktp || /^\d{16}$/.test(form.value.no_ktp.trim()))
const emailValid = computed(() => !form.value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim()))
function simpanPintas(e: KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!submitting.value) submit() } }
onMounted(() => window.addEventListener('keydown', simpanPintas))
onBeforeUnmount(() => window.removeEventListener('keydown', simpanPintas))
</script>

<template>
  <div class="fk">
    <button type="button" class="fk-kembali" @click="router.push(isEdit && id ? `/hris/karyawan/${id}` : '/hris/karyawan')">← {{ isEdit ? 'Kembali ke profil' : 'Buku Tim' }}</button>
    <header class="fk-kepala">
      <h1>{{ isEdit ? 'Ubah profil' : 'Rekan baru' }}<em v-if="form.nama_lengkap">, {{ form.nama_lengkap.split(' ')[0] }}</em></h1>
      <p>{{ isEdit ? 'Perbarui data karyawan. Kolom bertanda * wajib diisi.' : 'Catat rekan yang baru bergabung. Kolom bertanda * wajib diisi — sisanya bisa dilengkapi nanti.' }}</p>
    </header>

    <div v-if="muatError" class="fk-kartu fk-galat-muat">
      <p>⚠ {{ muatError }}</p>
      <div class="fk-aksi-baris">
        <button type="button" class="fk-btn" @click="router.push('/hris/karyawan')">← Buku Tim</button>
        <button type="button" class="fk-btn utama" @click="loadForm">Coba lagi</button>
      </div>
    </div>
    <div v-else-if="muatForm" class="fk-kartu fk-memuat">Memuat data karyawan…</div>

    <div v-else class="fk-tata">
      <!-- SAMPING: pratinjau & navigasi -->
      <aside class="fk-samping">
        <div class="fk-pratinjau" :style="{ '--c': dept.warna, '--l': dept.lembut }">
          <div class="fk-av">{{ inisial(form.nama_lengkap || '?') }}</div>
          <b>{{ form.nama_lengkap || 'Nama lengkap' }}</b>
          <span>{{ form.jabatan || 'Jabatan' }}</span>
          <small>{{ dept.ikon }} {{ form.departemen || 'Departemen' }}</small>
          <div class="fk-pratinjau-fakta">
            <span v-if="form.nip"><code>{{ form.nip }}</code></span>
            <span v-if="form.tgl_bergabung">🌱 {{ masaKerjaTeks(form.tgl_bergabung) }}</span>
            <span v-if="umur(form.tgl_lahir) != null">🎂 {{ umur(form.tgl_lahir) }} th</span>
          </div>
        </div>
        <nav class="fk-nav">
          <div class="fk-nav-kepala"><b>Kelengkapan</b><span>{{ totalPersen }}%</span></div>
          <div class="fk-bar"><i :style="{ width: totalPersen + '%' }"></i></div>
          <button v-for="b in progres" :key="b.kunci" type="button" @click="lompat(b.kunci)">
            <span>{{ b.ikon }} {{ b.judul }}</span>
            <em :class="{ penuh: b.terisi === b.total }">{{ b.terisi }}/{{ b.total }}</em>
          </button>
        </nav>
      </aside>

      <!-- FORM -->
      <form class="fk-form" @submit.prevent="submit">
        <section id="bag-kerja" class="fk-kartu">
          <h3>💼 Pekerjaan</h3>
          <div class="fk-grid">
            <label class="fk-f"><span>NIP <b>*</b></span>
              <input v-model="form.nip" type="text" placeholder="mis. N1-002" :disabled="isEdit" />
              <small v-if="isEdit">NIP tidak bisa diubah.</small>
            </label>
            <label class="fk-f"><span>Nama lengkap <b>*</b></span><input v-model="form.nama_lengkap" type="text" placeholder="Nama lengkap karyawan" /></label>
            <label class="fk-f"><span>Jabatan <b>*</b></span><input v-model="form.jabatan" type="text" placeholder="mis. Network Engineer" /></label>
            <div class="fk-f"><span>Departemen <b>*</b></span>
              <div class="fk-dept">
                <button v-for="d in hris.departemenList" :key="d" type="button" :class="{ on: form.departemen === d }" :style="{ '--c': infoDept(d).warna, '--l': infoDept(d).lembut }" @click="form.departemen = d">{{ infoDept(d).ikon }} {{ d }}</button>
              </div>
              <small v-if="departemenGagal" class="fk-merah">⚠ Gagal memuat daftar departemen — <a href="#" @click.prevent="muatDepartemen">coba lagi</a></small>
            </div>
            <label class="fk-f">No. HP<input v-model="form.no_hp" type="tel" placeholder="08xx-xxxx-xxxx" /></label>
            <label class="fk-f">Email<input v-model="form.email" type="email" placeholder="nama@nextone.id" :class="{ salah: !emailValid }" /><small v-if="!emailValid" class="fk-merah">Format email belum benar</small></label>
            <label class="fk-f">Tanggal bergabung<input v-model="form.tgl_bergabung" type="date" /></label>
            <div v-if="isEdit" class="fk-f">Status
              <div class="fk-segmen">
                <button type="button" :class="{ on: form.status_aktif }" @click="form.status_aktif = true">Aktif</button>
                <button type="button" :class="{ on: !form.status_aktif }" @click="form.status_aktif = false">Nonaktif</button>
              </div>
            </div>
          </div>
        </section>

        <section id="bag-pribadi" class="fk-kartu">
          <h3>🪪 Data pribadi</h3>
          <div class="fk-grid">
            <label class="fk-f">Tempat lahir<input v-model="form.tempat_lahir" type="text" placeholder="mis. Surabaya" /></label>
            <label class="fk-f">Tanggal lahir<input v-model="form.tgl_lahir" type="date" /></label>
            <div class="fk-f">Jenis kelamin
              <div class="fk-segmen">
                <button type="button" :class="{ on: form.jenis_kelamin === 'L' }" @click="form.jenis_kelamin = form.jenis_kelamin === 'L' ? '' : 'L'">Laki-laki</button>
                <button type="button" :class="{ on: form.jenis_kelamin === 'P' }" @click="form.jenis_kelamin = form.jenis_kelamin === 'P' ? '' : 'P'">Perempuan</button>
              </div>
            </div>
            <label class="fk-f">Agama
              <select v-model="form.agama">
                <option value="">Pilih agama</option>
                <option v-for="a in ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya']" :key="a" :value="a">{{ a }}</option>
              </select>
            </label>
            <div class="fk-f">Status pernikahan
              <div class="fk-segmen">
                <button v-for="s in ['Belum Menikah', 'Menikah', 'Cerai']" :key="s" type="button" :class="{ on: form.status_pernikahan === s }" @click="form.status_pernikahan = form.status_pernikahan === s ? '' : s">{{ s }}</button>
              </div>
            </div>
            <label class="fk-f">Pendidikan terakhir
              <select v-model="form.pendidikan_terakhir">
                <option value="">Pilih pendidikan</option>
                <option v-for="p in ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2', 'S3']" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
            <label class="fk-f">No. KTP (NIK)<input v-model="form.no_ktp" type="text" inputmode="numeric" maxlength="16" placeholder="16 digit NIK" :class="{ salah: !ktpValid }" /><small :class="{ 'fk-merah': !ktpValid }">{{ form.no_ktp.length }}/16 digit</small></label>
            <label class="fk-f">NPWP<input v-model="form.no_npwp" type="text" placeholder="xx.xxx.xxx.x-xxx.xxx" /></label>
            <label class="fk-f lebar">Alamat sesuai KTP<textarea v-model="form.alamat_ktp" rows="2" placeholder="Alamat lengkap sesuai KTP"></textarea></label>
          </div>
        </section>

        <section id="bag-darurat" class="fk-kartu">
          <h3>🚑 Kontak darurat</h3>
          <div class="fk-grid tiga">
            <label class="fk-f">Nama<input v-model="form.kontak_darurat_nama" type="text" placeholder="Nama kontak darurat" /></label>
            <label class="fk-f">No. HP<input v-model="form.kontak_darurat_hp" type="tel" placeholder="08xx-xxxx-xxxx" /></label>
            <label class="fk-f">Hubungan<input v-model="form.kontak_darurat_hubungan" type="text" list="fk-hubungan" placeholder="mis. Orang tua" /></label>
            <datalist id="fk-hubungan"><option value="Suami" /><option value="Istri" /><option value="Orang tua" /><option value="Saudara kandung" /><option value="Anak" /></datalist>
          </div>
        </section>

        <section id="bag-bank" class="fk-kartu">
          <h3>🏦 Rekening payroll</h3>
          <div class="fk-grid tiga">
            <label class="fk-f">Bank<input v-model="form.bank_nama" type="text" list="fk-bank" placeholder="mis. BCA" /></label>
            <label class="fk-f">No. rekening<input v-model="form.bank_no_rekening" type="text" inputmode="numeric" placeholder="Nomor rekening" /></label>
            <label class="fk-f">Atas nama<input v-model="form.bank_atas_nama" type="text" :placeholder="form.nama_lengkap || 'Sesuai buku tabungan'" /></label>
            <datalist id="fk-bank"><option value="BCA" /><option value="Mandiri" /><option value="BRI" /><option value="BNI" /><option value="BSI" /><option value="CIMB Niaga" /><option value="Permata" /><option value="Danamon" /></datalist>
          </div>
        </section>

        <div class="fk-kaki">
          <p v-if="errorMsg" class="fk-galat">{{ errorMsg }}</p>
          <small v-else-if="berubah" class="fk-redup">● Ada perubahan belum disimpan · <kbd>Ctrl</kbd>+<kbd>S</kbd> untuk simpan</small>
          <span class="fk-spasi"></span>
          <button type="button" class="fk-btn" @click="router.back()">Batal</button>
          <button type="submit" class="fk-btn utama" :disabled="submitting">{{ submitting ? 'Menyimpan…' : isEdit ? 'Simpan perubahan' : 'Tambah ke Buku Tim' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.fk { --kertas: #fbf8f2; --tinta: #1c2a22; --hutan: #1f4d3a; --terakota: #c2552d; --garis: #e9e2d4; --redup: #8a8170;
  --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;
  background: var(--kertas); padding: 18px 24px 40px; min-height: 100%; box-sizing: border-box; color: var(--tinta); }
.fk-redup { color: var(--redup); font-size: 12.5px; }
.fk-merah { color: #b42318 !important; }
code { font-size: 11.5px; background: #f3eee3; padding: 1px 6px; border-radius: 5px; }
kbd { display: inline-block; padding: 0 4px; border-radius: 4px; border: 1px solid var(--garis); border-bottom-width: 2px; font: 700 10px/15px ui-monospace, monospace; background: #fff; }
.fk-kembali { border: 0; background: none; color: var(--hutan); font-weight: 800; font-size: 13px; cursor: pointer; padding: 2px 0 8px; }
.fk-kepala { margin-bottom: 16px; }
.fk-kepala h1 { margin: 0; font-family: var(--serif); font-size: 32px; font-weight: 700; letter-spacing: -.5px; }
.fk-kepala h1 em { font-weight: 400; color: var(--terakota); }
.fk-kepala p { margin: 4px 0 0; color: var(--redup); font-size: 13.5px; }
.fk-tata { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 18px; align-items: start; max-width: 1100px; }
.fk-samping { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 12px; }
.fk-pratinjau { --c: #1f4d3a; --l: #e6f3ea; position: relative; text-align: center; padding: 18px 14px 14px; border-radius: 22px; background: #fff; border: 1px solid var(--garis); display: flex; flex-direction: column; align-items: center; gap: 2px; overflow: hidden; transition: all .25s; }
.fk-pratinjau::before { content: ''; position: absolute; inset: 0 0 auto; height: 58px; background: var(--l); transition: background .25s; }
.fk-av { position: relative; width: 76px; height: 76px; border-radius: 50%; background: var(--c); color: #fff; display: grid; place-items: center; font-family: var(--serif); font-size: 28px; font-weight: 700; box-shadow: 0 0 0 4px #fff, 0 0 0 6px var(--l); margin-bottom: 8px; transition: background .25s; }
.fk-pratinjau b { position: relative; font-family: var(--serif); font-size: 17px; }
.fk-pratinjau span { font-size: 12.5px; color: #5b5242; }
.fk-pratinjau small { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--c); margin-top: 4px; }
.fk-pratinjau-fakta { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 10px; margin-top: 8px; font-size: 11.5px; color: var(--redup); }
.fk-nav { background: #fff; border: 1px solid var(--garis); border-radius: 18px; padding: 12px; display: flex; flex-direction: column; gap: 2px; }
.fk-nav-kepala { display: flex; justify-content: space-between; font-size: 13px; }
.fk-nav-kepala span { font-family: var(--serif); font-weight: 700; color: var(--terakota); }
.fk-bar { height: 6px; background: #f0eadd; border-radius: 99px; overflow: hidden; margin: 6px 0 8px; }
.fk-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--terakota), #e0a35a 60%, #2f7a4d); border-radius: 99px; transition: width .3s; }
.fk-nav button { display: flex; justify-content: space-between; align-items: center; border: 0; background: none; padding: 7px 6px; border-radius: 10px; font: inherit; font-size: 13px; cursor: pointer; color: var(--tinta); }
.fk-nav button:hover { background: #f8f4ea; }
.fk-nav em { font-style: normal; font-size: 11.5px; font-weight: 800; color: var(--redup); }
.fk-nav em.penuh { color: #2f7a4d; }
.fk-form { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.fk-kartu { background: #fff; border: 1px solid var(--garis); border-radius: 22px; padding: 18px 20px; scroll-margin-top: 12px; }
.fk-kartu h3 { margin: 0 0 14px; font-family: var(--serif); font-size: 19px; }
.fk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
.fk-grid.tiga { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.fk-f { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #5b5242; min-width: 0; }
.fk-f.lebar, .fk-grid > .fk-f:has(.fk-dept) { grid-column: 1 / -1; }
.fk-f b { color: var(--terakota); }
.fk-f small { text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--redup); font-size: 11.5px; }
.fk-f input, .fk-f select, .fk-f textarea { text-transform: none; letter-spacing: 0; font: inherit; font-weight: 500; font-size: 14px; color: var(--tinta); border: 1px solid var(--garis); border-radius: 12px; padding: 10px 12px; background: #fdfcf9; transition: border-color .15s, box-shadow .15s; }
.fk-f input:focus, .fk-f select:focus, .fk-f textarea:focus { outline: none; border-color: #2f6b4f; background: #fff; box-shadow: 0 0 0 3px rgba(47, 107, 79, .13); }
.fk-f input:disabled { background: #f3eee3; color: var(--redup); }
.fk-f .salah { border-color: #e7a59b; }
.fk-f textarea { resize: vertical; }
.fk-dept { display: flex; flex-wrap: wrap; gap: 6px; text-transform: none; letter-spacing: 0; }
.fk-dept button { --c: #1f4d3a; --l: #e6f3ea; border: 1px solid var(--garis); background: #fff; border-radius: 99px; padding: 6px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--tinta); transition: all .12s; }
.fk-dept button:hover { border-color: var(--c); }
.fk-dept button.on { background: var(--c); border-color: var(--c); color: #fff; }
.fk-segmen { display: inline-flex; flex-wrap: wrap; gap: 3px; background: #f3eee3; border-radius: 12px; padding: 3px; align-self: flex-start; text-transform: none; letter-spacing: 0; }
.fk-segmen button { border: 0; background: none; padding: 7px 12px; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; color: #6b6253; }
.fk-segmen button.on { background: #fff; color: var(--hutan); box-shadow: 0 1px 4px rgba(28, 42, 34, .12); }
.fk-kaki { position: sticky; bottom: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 16px; border-radius: 18px; background: rgba(251, 248, 242, .94); backdrop-filter: blur(6px); border: 1px solid var(--garis); }
.fk-spasi { flex: 1; }
.fk-galat { margin: 0; color: #b42318; font-size: 13px; font-weight: 600; }
.fk-btn { border: 1px solid var(--garis); background: #fff; color: var(--tinta); border-radius: 999px; padding: 9px 18px; font: inherit; font-weight: 700; font-size: 13.5px; cursor: pointer; }
.fk-btn.utama { background: var(--hutan); border-color: var(--hutan); color: #f7f3ea; }
.fk-btn:disabled { opacity: .5; cursor: default; }
.fk-galat-muat p { margin: 0 0 10px; color: #b42318; }
.fk-aksi-baris { display: flex; gap: 8px; }
.fk-memuat { color: var(--redup); }
@media (max-width: 900px) { .fk-tata { grid-template-columns: 1fr; } .fk-samping { position: static; flex-direction: row; flex-wrap: wrap; } .fk-pratinjau, .fk-nav { flex: 1; min-width: 240px; } }
@media (max-width: 640px) { .fk { padding: 12px 12px 30px; } .fk-grid, .fk-grid.tiga { grid-template-columns: 1fr; } .fk-kepala h1 { font-size: 26px; } }
</style>
