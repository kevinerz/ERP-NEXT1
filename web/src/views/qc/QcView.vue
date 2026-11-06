<script setup lang="ts">
// QC & evaluasi ERP: daftar modul, status & skor, catatan revisi / bug / upgrade; ekspor Excel & PDF
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { alertError, confirmDialog } from '@/composables/useDialog'
import { fmtDateTime } from '@/composables/useFormat'
import { eksporExcel, type QcModul, type QcCatatan, WARNA_STATUS, WARNA_PRIORITAS, IKON_JENIS } from './qc'

const router = useRouter()
const auth = useAuthStore()
const pengelola = computed(() => ['Admin', 'Director', 'Manager_Ops'].some((r) => auth.hasRole(r)))

const modul = ref<QcModul[]>([])
const meta = ref({ status_modul: [] as string[], jenis: [] as string[], prioritas: [] as string[], status_catatan: [] as string[] })
const memuat = ref(false)
async function muat() {
  memuat.value = true
  try {
    const { data } = await api.get('/qc/modul')
    modul.value = data.data
    if (data.meta) meta.value = data.meta
  } catch (e) { alertError(e) } finally { memuat.value = false }
}
onMounted(muat)

// ── Filter ──
const f = reactive({ cari: '', grup: '', status: '', jenis: '', prioritas: '', terbuka: false })
const grupList = computed(() => [...new Set(modul.value.map((m) => m.grup))])
const terbuka = (c: QcCatatan) => c.status === 'Baru' || c.status === 'Dikerjakan'
function catatanTampil(m: QcModul) {
  return m.catatan.filter((c) => (!f.jenis || c.jenis === f.jenis) && (!f.prioritas || c.prioritas === f.prioritas) && (!f.terbuka || terbuka(c)))
}
const tampil = computed(() => modul.value.filter((m) => {
  if (f.grup && m.grup !== f.grup) return false
  if (f.status && m.status !== f.status) return false
  if ((f.jenis || f.prioritas || f.terbuka) && !catatanTampil(m).length) return false
  if (f.cari) {
    const q = f.cari.toLowerCase()
    const teks = [m.nama, m.grup, m.path, m.deskripsi, m.pic, ...m.catatan.map((c) => `${c.judul} ${c.isi ?? ''}`)].join(' ').toLowerCase()
    if (!teks.includes(q)) return false
  }
  return true
}))
const perGrup = computed(() => {
  const g = new Map<string, QcModul[]>()
  for (const m of tampil.value) g.set(m.grup, [...(g.get(m.grup) ?? []), m])
  return [...g.entries()]
})

// ── Ringkasan ──
const ringkas = computed(() => {
  const semua = modul.value.flatMap((m) => m.catatan)
  const buka = semua.filter(terbuka)
  const skor = modul.value.filter((m) => m.skor).map((m) => m.skor!)
  return {
    modul: modul.value.length,
    status: meta.value.status_modul.map((s) => ({ s, n: modul.value.filter((m) => m.status === s).length })),
    catatan: semua.length, terbuka: buka.length,
    prioritas: meta.value.prioritas.map((p) => ({ p, n: buka.filter((c) => c.prioritas === p).length })),
    selesai: semua.filter((c) => c.status === 'Selesai').length,
    skor: skor.length ? (skor.reduce((a, b) => a + b, 0) / skor.length).toFixed(1) : '–',
  }
})

// ── Ubah modul (pengelola) ──
async function ubahModul(m: QcModul, data: Partial<Pick<QcModul, 'status' | 'skor' | 'pic' | 'deskripsi'>>) {
  try {
    const { data: r } = await api.put(`/qc/modul/${m.id}`, data)
    Object.assign(m, r.data)
  } catch (e) { alertError(e, 'Gagal menyimpan') }
}
const editDesk = ref<number | null>(null)
const teksDesk = ref('')
function mulaiEditDesk(m: QcModul) { editDesk.value = m.id; teksDesk.value = m.deskripsi ?? '' }
async function simpanDesk(m: QcModul) { await ubahModul(m, { deskripsi: teksDesk.value }); editDesk.value = null }
async function ubahPic(m: QcModul) {
  const v = window.prompt(`PIC / penanggung jawab modul "${m.nama}"`, m.pic ?? '')
  if (v !== null) ubahModul(m, { pic: v })
}

// ── Catatan ──
const formCat = reactive({ id_modul: 0, jenis: 'Revisi', prioritas: 'Sedang', judul: '', isi: '', simpan: false })
function bukaForm(m: QcModul) { Object.assign(formCat, { id_modul: m.id, jenis: 'Revisi', prioritas: 'Sedang', judul: '', isi: '', simpan: false }) }
async function simpanCatatan(m: QcModul) {
  if (!formCat.judul.trim()) return
  formCat.simpan = true
  try {
    const { data } = await api.post(`/qc/modul/${m.id}/catatan`, { jenis: formCat.jenis, prioritas: formCat.prioritas, judul: formCat.judul, isi: formCat.isi || undefined })
    m.catatan.unshift(data.data)
    formCat.id_modul = 0
  } catch (e) { alertError(e, 'Gagal menyimpan catatan') } finally { formCat.simpan = false }
}
const bolehUbah = (c: QcCatatan) => pengelola.value || (!!auth.user?.id_karyawan && c.id_karyawan === auth.user.id_karyawan)
async function ubahCatatan(c: QcCatatan, data: Partial<QcCatatan>) {
  try {
    const { data: r } = await api.put(`/qc/catatan/${c.id}`, data)
    Object.assign(c, r.data)
  } catch (e) { alertError(e, 'Gagal menyimpan') }
}
async function hapusCatatan(m: QcModul, c: QcCatatan) {
  if (!(await confirmDialog({ title: 'Hapus catatan?', message: c.judul, confirmLabel: 'Hapus', variant: 'danger' }))) return
  try {
    await api.delete(`/qc/catatan/${c.id}`)
    m.catatan = m.catatan.filter((x) => x.id !== c.id)
  } catch (e) { alertError(e, 'Gagal menghapus') }
}

// ── Tambah modul (pengelola) ──
const formModul = reactive({ buka: false, grup: '', nama: '', path: '', deskripsi: '' })
async function simpanModul() {
  try {
    const { data } = await api.post('/qc/modul', { grup: formModul.grup, nama: formModul.nama, path: formModul.path || undefined, deskripsi: formModul.deskripsi || undefined })
    modul.value.push({ ...data.data, catatan: [] })
    Object.assign(formModul, { buka: false, grup: '', nama: '', path: '', deskripsi: '' })
  } catch (e) { alertError(e, 'Gagal menambah modul') }
}

// ── Ekspor ──
const mengekspor = ref(false)
async function unduhExcel() {
  mengekspor.value = true
  try { await eksporExcel(tampil.value.map((m) => ({ ...m, catatan: catatanTampil(m) }))) } catch (e) { alertError(e, 'Gagal membuat Excel') } finally { mengekspor.value = false }
}
function cetakPdf() {
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString()
  window.open(router.resolve(`/qc/cetak${q ? `?${q}` : ''}`).href, '_blank')
}
const tgl = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="page qc">
    <div class="page-header">
      <div>
        <h2 class="page-title">🧪 QC &amp; Evaluasi ERP</h2>
        <p class="page-subtitle">Daftar modul, kondisi, dan catatan revisi / bug / upgrade — bahan evaluasi bersama</p>
      </div>
      <div class="qc-tombol">
        <button v-if="pengelola" class="btn btn-ghost" @click="formModul.buka = !formModul.buka">+ Modul</button>
        <button class="btn btn-ghost" :disabled="!modul.length || mengekspor" @click="unduhExcel">{{ mengekspor ? 'Membuat…' : '⬇ Excel' }}</button>
        <button class="btn btn-primary" :disabled="!modul.length" @click="cetakPdf">🖨 PDF</button>
      </div>
    </div>

    <form v-if="formModul.buka" class="card qc-form-modul" @submit.prevent="simpanModul">
      <input v-model="formModul.grup" class="form-input" list="qc-grup" placeholder="Grup (mis. Komersial)" required />
      <datalist id="qc-grup"><option v-for="g in grupList" :key="g" :value="g" /></datalist>
      <input v-model="formModul.nama" class="form-input" placeholder="Nama modul" required />
      <input v-model="formModul.path" class="form-input" placeholder="Alamat halaman (opsional, mis. /finance)" />
      <input v-model="formModul.deskripsi" class="form-input qc-lebar" placeholder="Deskripsi singkat (opsional)" />
      <button type="submit" class="btn btn-primary btn-sm">Simpan</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="formModul.buka = false">Batal</button>
    </form>

    <div class="qc-kpi">
      <div class="stat-tile"><span class="stat-tile-label">Modul</span><span class="stat-tile-value">{{ ringkas.modul }}</span><span class="stat-tile-sub">skor rata-rata {{ ringkas.skor }} / 5</span></div>
      <div class="stat-tile qc-status-tile">
        <span class="stat-tile-label">Kondisi modul</span>
        <div class="qc-chips">
          <button v-for="x in ringkas.status" :key="x.s" type="button" class="qc-chip" :class="{ on: f.status === x.s }" :style="{ '--w': WARNA_STATUS[x.s] }" @click="f.status = f.status === x.s ? '' : x.s">
            {{ x.s }} <b>{{ x.n }}</b>
          </button>
        </div>
      </div>
      <div class="stat-tile"><span class="stat-tile-label">Catatan terbuka</span><span class="stat-tile-value">{{ ringkas.terbuka }}</span><span class="stat-tile-sub">dari {{ ringkas.catatan }} · {{ ringkas.selesai }} selesai</span></div>
      <div class="stat-tile qc-status-tile">
        <span class="stat-tile-label">Prioritas terbuka</span>
        <div class="qc-chips">
          <button v-for="x in ringkas.prioritas" :key="x.p" type="button" class="qc-chip" :class="{ on: f.prioritas === x.p }" :style="{ '--w': WARNA_PRIORITAS[x.p] }" @click="f.prioritas = f.prioritas === x.p ? '' : x.p; f.terbuka = !!f.prioritas">
            {{ x.p }} <b>{{ x.n }}</b>
          </button>
        </div>
      </div>
    </div>

    <div class="qc-filter">
      <input v-model="f.cari" type="search" class="form-input" placeholder="Cari modul / catatan…" />
      <select v-model="f.grup" class="form-select"><option value="">Semua grup</option><option v-for="g in grupList" :key="g" :value="g">{{ g }}</option></select>
      <select v-model="f.status" class="form-select"><option value="">Semua kondisi</option><option v-for="s in meta.status_modul" :key="s" :value="s">{{ s }}</option></select>
      <select v-model="f.jenis" class="form-select"><option value="">Semua jenis catatan</option><option v-for="j in meta.jenis" :key="j" :value="j">{{ IKON_JENIS[j] }} {{ j }}</option></select>
      <label class="qc-cek"><input v-model="f.terbuka" type="checkbox" /> Hanya catatan terbuka</label>
      <span class="muted">{{ tampil.length }} modul</span>
    </div>

    <p v-if="memuat && !modul.length" class="muted">Memuat…</p>
    <section v-for="[grup, ms] in perGrup" :key="grup" class="qc-grup">
      <h3>{{ grup }} <small>{{ ms.length }} modul</small></h3>
      <article v-for="m in ms" :key="m.id" class="card qc-modul" :style="{ '--w': WARNA_STATUS[m.status] }">
        <header class="qc-modul-atas">
          <div class="qc-modul-nama">
            <b>{{ m.nama }}</b>
            <RouterLink v-if="m.path" :to="m.path" class="qc-path">{{ m.path }}</RouterLink>
          </div>
          <div class="qc-modul-aksi">
            <select v-if="pengelola" class="form-select qc-status" :value="m.status" :style="{ color: WARNA_STATUS[m.status] }" @change="ubahModul(m, { status: ($event.target as HTMLSelectElement).value })">
              <option v-for="s in meta.status_modul" :key="s" :value="s">{{ s }}</option>
            </select>
            <span v-else class="qc-badge" :style="{ color: WARNA_STATUS[m.status], borderColor: WARNA_STATUS[m.status] }">{{ m.status }}</span>
            <span class="qc-skor" :title="pengelola ? 'Klik untuk memberi skor' : 'Skor'">
              <button v-for="n in 5" :key="n" type="button" :class="{ isi: (m.skor ?? 0) >= n }" :disabled="!pengelola" @click="ubahModul(m, { skor: m.skor === n ? null : n })">★</button>
            </span>
          </div>
        </header>
        <div v-if="editDesk === m.id" class="qc-desk-edit">
          <textarea v-model="teksDesk" class="form-input" rows="2"></textarea>
          <button class="btn btn-primary btn-sm" @click="simpanDesk(m)">Simpan</button>
          <button class="btn btn-ghost btn-sm" @click="editDesk = null">Batal</button>
        </div>
        <p v-else class="qc-desk">
          {{ m.deskripsi || '—' }}
          <button v-if="pengelola" type="button" class="qc-link" @click="mulaiEditDesk(m)">ubah</button>
        </p>
        <p class="qc-info">
          PIC: <b>{{ m.pic || '—' }}</b><button v-if="pengelola" type="button" class="qc-link" @click="ubahPic(m)">ubah</button>
          · diperbarui {{ tgl(m.updated_at) }}<template v-if="m.diubah_oleh"> oleh {{ m.diubah_oleh }}</template>
        </p>

        <ul v-if="catatanTampil(m).length" class="qc-catatan">
          <li v-for="c in catatanTampil(m)" :key="c.id" :class="{ tutup: !terbuka(c) }">
            <span class="qc-jenis" :title="c.jenis">{{ IKON_JENIS[c.jenis] }} {{ c.jenis }}</span>
            <div class="qc-cat-isi">
              <div class="qc-cat-judul">
                <span class="qc-prio" :style="{ background: WARNA_PRIORITAS[c.prioritas] }">{{ c.prioritas }}</span>
                <b>{{ c.judul }}</b>
              </div>
              <p v-if="c.isi" class="qc-cat-teks">{{ c.isi }}</p>
              <small class="muted">{{ c.pembuat }} · {{ fmtDateTime(c.created_at) }}<template v-if="c.selesai_at"> · selesai {{ tgl(c.selesai_at) }}</template></small>
            </div>
            <div class="qc-cat-aksi">
              <select v-if="bolehUbah(c)" class="form-select qc-cat-status" :value="c.status" @change="ubahCatatan(c, { status: ($event.target as HTMLSelectElement).value })">
                <option v-for="s in meta.status_catatan" :key="s" :value="s">{{ s }}</option>
              </select>
              <span v-else class="qc-badge">{{ c.status }}</span>
              <select v-if="bolehUbah(c)" class="form-select qc-cat-status" :value="c.prioritas" title="Prioritas" @change="ubahCatatan(c, { prioritas: ($event.target as HTMLSelectElement).value })">
                <option v-for="p in meta.prioritas" :key="p" :value="p">{{ p }}</option>
              </select>
              <button v-if="bolehUbah(c)" type="button" class="qc-hapus" title="Hapus catatan" @click="hapusCatatan(m, c)">🗑</button>
            </div>
          </li>
        </ul>

        <form v-if="formCat.id_modul === m.id" class="qc-form-cat" @submit.prevent="simpanCatatan(m)">
          <select v-model="formCat.jenis" class="form-select"><option v-for="j in meta.jenis" :key="j" :value="j">{{ IKON_JENIS[j] }} {{ j }}</option></select>
          <select v-model="formCat.prioritas" class="form-select"><option v-for="p in meta.prioritas" :key="p" :value="p">{{ p }}</option></select>
          <input v-model="formCat.judul" class="form-input qc-lebar" maxlength="200" placeholder="Judul singkat (wajib)" required autofocus />
          <textarea v-model="formCat.isi" class="form-input qc-penuh" rows="2" placeholder="Detail: apa masalahnya, langkah reproduksi, usulan perbaikan…"></textarea>
          <button type="submit" class="btn btn-primary btn-sm" :disabled="formCat.simpan || !formCat.judul.trim()">Simpan</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="formCat.id_modul = 0">Batal</button>
        </form>
        <button v-else type="button" class="btn btn-ghost btn-sm qc-tambah" @click="bukaForm(m)">+ Catatan</button>
      </article>
    </section>
    <p v-if="!memuat && modul.length && !tampil.length" class="muted">Tidak ada modul yang cocok dengan filter.</p>
  </div>
</template>

<style scoped>
.qc-tombol { display: flex; gap: 8px; flex-wrap: wrap; }
.qc-form-modul { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; margin-bottom: 14px; }
.qc-form-modul .form-input { width: auto; flex: 1 1 180px; }
.qc-lebar { flex: 2 1 260px !important; }
.qc-penuh { flex: 1 1 100% !important; width: 100%; }
.qc-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px; }
.qc-status-tile { grid-column: span 2; }
.qc-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.qc-chip { border: 1px solid var(--w); color: var(--w); background: #fff; border-radius: 999px; padding: 3px 10px; font-size: 12.5px; cursor: pointer; }
.qc-chip.on { background: var(--w); color: #fff; }
.qc-filter { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.qc-filter .form-input, .qc-filter .form-select { width: auto; min-width: 170px; }
.qc-filter .form-input { flex: 1 1 220px; }
.qc-cek { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: #334155; }
.qc-grup h3 { margin: 18px 0 8px; font-size: 15px; }
.qc-grup h3 small { color: #64748b; font-weight: 500; font-size: 12px; margin-left: 6px; }
.qc-modul { padding: 12px 14px; margin-bottom: 10px; border-left: 4px solid var(--w) !important; }
.qc-modul-atas { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.qc-modul-nama { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.qc-modul-nama b { font-size: 15px; }
.qc-path { font-family: monospace; font-size: 12px; color: #2563eb; }
.qc-modul-aksi { display: flex; gap: 10px; align-items: center; }
.qc-status { width: auto; font-weight: 600; padding: 4px 8px; }
.qc-badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 9px; border: 1px solid #cbd5e1; border-radius: 999px; white-space: nowrap; }
.qc-skor button { border: 0; background: none; font-size: 17px; color: #e2e8f0; cursor: pointer; padding: 0 1px; }
.qc-skor button.isi { color: #f59e0b; }
.qc-skor button:disabled { cursor: default; }
.qc-desk { margin: 6px 0 2px; font-size: 13.5px; color: #334155; }
.qc-desk-edit { display: flex; gap: 6px; margin: 6px 0; align-items: flex-start; flex-wrap: wrap; }
.qc-desk-edit textarea { flex: 1 1 300px; }
.qc-info { margin: 0 0 6px; font-size: 12px; color: #64748b; }
.qc-link { border: 0; background: none; color: #2563eb; cursor: pointer; font-size: 12px; margin-left: 4px; }
.qc-catatan { list-style: none; margin: 8px 0 6px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.qc-catatan li { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
.qc-catatan li.tutup { opacity: .6; }
.qc-catatan li.tutup .qc-cat-judul b { text-decoration: line-through; }
.qc-jenis { flex: none; width: 92px; font-size: 12px; font-weight: 600; color: #334155; }
.qc-cat-isi { flex: 1; min-width: 0; }
.qc-cat-judul { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; font-size: 13.5px; }
.qc-prio { color: #fff; font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
.qc-cat-teks { margin: 3px 0; font-size: 13px; color: #475569; white-space: pre-wrap; }
.qc-cat-aksi { flex: none; display: flex; gap: 4px; align-items: center; }
.qc-cat-status { width: auto; font-size: 12px; padding: 3px 6px; }
.qc-hapus { border: 0; background: none; cursor: pointer; }
.qc-form-cat { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding: 10px; background: #f8fafc; border-radius: 8px; }
.qc-form-cat .form-select { width: auto; }
.qc-tambah { margin-top: 4px; }
.muted { color: #64748b; font-size: 12.5px; }
@media (max-width: 700px) {
  .qc-status-tile { grid-column: auto; }
  .qc-catatan li { flex-wrap: wrap; }
  .qc-jenis { width: auto; }
  .qc-cat-aksi { flex-basis: 100%; justify-content: flex-end; }
  .qc-filter .form-select, .qc-filter .form-input { flex: 1 1 100%; }
}
</style>
