<script setup lang="ts">
// Aturan maintenance rutin: sistem membuat visit Maintenance otomatis (06:00 WIB) untuk store yang jatuh tempo
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDateTime } from '@/composables/useFormat'
import { alertDialog, alertError, confirmDialog } from '@/composables/useDialog'

interface Aturan {
  id_aturan: number; nama: string; id_pelanggan: number | null; pelanggan: string | null; kota: string | null
  interval_hari: number; maks_per_hari: number; tgl_mulai: string | null; prioritas: string; deskripsi: string; is_aktif: boolean; terakhir_jalan: string | null
  jumlah_site: number; jatuh_tempo: number; tempo_30hari: number; antrean_aktif: number; dibuat_total: number
}
const PRIORITAS = ['Darurat', 'Tinggi', 'Normal', 'Rendah']
const INTERVAL = [[30, 'Tiap bulan'], [60, 'Tiap 2 bulan'], [90, 'Tiap 3 bulan'], [180, 'Tiap 6 bulan'], [365, 'Tiap tahun']] as const

const router = useRouter()
const aturan = ref<Aturan[]>([])
const pelanggan = ref<{ id_pelanggan: number; nama_pelanggan: string; site_aktif: number }[]>([])
const memuat = ref(false)
const proses = ref(false)
const galat = ref('')
const pesanGagal = (e: any, f: string) => { const m = e?.response?.data?.message; return (Array.isArray(m) ? m.join(', ') : m) || f }

async function muat() {
  memuat.value = true
  galat.value = ''
  try { aturan.value = (await api.get('/visit/pm/aturan')).data.data } catch (e) { galat.value = pesanGagal(e, 'Gagal memuat aturan maintenance') } finally { memuat.value = false }
}
// Daftar pelanggan wajib termuat sebelum simpan, agar aturan tidak tersimpan "Semua pelanggan" tanpa sengaja
const pelangganOk = ref(false)
const pelangganMemuat = ref(false)
const pelangganGalat = ref('')
async function muatPelanggan() {
  pelangganMemuat.value = true
  pelangganGalat.value = ''
  try { pelanggan.value = (await api.get('/visit/pm/pelanggan')).data.data; pelangganOk.value = true } catch (e) { pelangganGalat.value = pesanGagal(e, 'Gagal memuat daftar pelanggan') } finally { pelangganMemuat.value = false }
}
onMounted(() => { muat(); muatPelanggan() })

const tglLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const form = ref<any>(null)
function bukaForm(a?: Aturan) {
  form.value = a
    ? { id: a.id_aturan, nama: a.nama, id_pelanggan: a.id_pelanggan ?? 0, kota: a.kota ?? '', interval_hari: a.interval_hari, maks_per_hari: a.maks_per_hari, tgl_mulai: a.tgl_mulai ? tglLokal(new Date(a.tgl_mulai)) : tglLokal(new Date()), prioritas: a.prioritas, deskripsi: a.deskripsi, is_aktif: a.is_aktif }
    : { id: null, nama: '', id_pelanggan: 0, kota: '', interval_hari: 90, maks_per_hari: 5, tgl_mulai: tglLokal(new Date()), prioritas: 'Rendah', deskripsi: 'Pengecekan rutin: kondisi perangkat (ONT/router/switch), kabel & konektor, kebersihan rak, uji kecepatan, foto sebelum & sesudah.', is_aktif: true }
}
async function simpan() {
  const f = form.value
  if (f.nama.trim().length < 3) { alertDialog({ title: 'Isi nama aturan', message: 'mis. "PM Kopi Kenangan 3 bulanan"' }); return }
  if (!pelangganOk.value) { alertDialog({ title: 'Daftar pelanggan belum termuat', message: 'Muat ulang daftar pelanggan dulu agar pilihan pelanggan tidak tersimpan keliru.', variant: 'warning' }); return }
  proses.value = true
  try {
    const body = { nama: f.nama, id_pelanggan: f.id_pelanggan || null, kota: f.kota || undefined, interval_hari: Number(f.interval_hari), maks_per_hari: Number(f.maks_per_hari), tgl_mulai: f.tgl_mulai || undefined, prioritas: f.prioritas, deskripsi: f.deskripsi, is_aktif: f.is_aktif }
    if (f.id) await api.put(`/visit/pm/aturan/${f.id}`, body)
    else await api.post('/visit/pm/aturan', body)
    form.value = null
    muat()
  } catch (e) { alertError(e) } finally { proses.value = false }
}
async function hapus(a: Aturan) {
  if (!(await confirmDialog({ title: 'Hapus aturan?', message: `${a.nama} — visit yang sudah dibuat tetap ada di antrean.`, variant: 'danger', confirmLabel: 'Hapus' }))) return
  try { await api.delete(`/visit/pm/aturan/${a.id_aturan}`); muat() } catch (e) { alertError(e) }
}
async function jalankan(a: Aturan) {
  if (!(await confirmDialog({ title: 'Buat visit sekarang?', message: `Maksimal ${a.maks_per_hari} visit maintenance untuk store yang jatuh tempo akan masuk antrean (dihitung bersama yang sudah dibuat hari ini).`, confirmLabel: 'Jalankan' }))) return
  proses.value = true
  try { const { data } = await api.post(`/visit/pm/aturan/${a.id_aturan}/jalankan`); await alertDialog({ title: 'Maintenance rutin', message: data.message }); muat() } catch (e) { alertError(e) } finally { proses.value = false }
}
const labelInterval = (n: number) => INTERVAL.find((x) => x[0] === n)?.[1] ?? `Tiap ${n} hari`
const angka = (n: number) => n.toLocaleString('id-ID')
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">🔁 Maintenance Rutin</h2>
        <p class="page-subtitle">Tiap pagi 06:00 WIB sistem memasukkan store yang jatuh tempo ke antrean Jadwal Visit</p>
      </div>
      <div class="mr-tombol">
        <button class="btn btn-ghost" @click="router.push('/jadwal-visit')">← Jadwal Visit</button>
        <button class="btn btn-primary" @click="bukaForm()">+ Aturan baru</button>
      </div>
    </div>

    <div class="card mr-info">
      <b>Cara kerja:</b> jatuh tempo = maintenance/instalasi terakhir yang <i>selesai</i> di store itu + interval. Store yang belum pernah di-maintenance jatuh tempo sejak tanggal <i>mulai berlaku</i> aturan.
      Store yang masih punya visit maintenance terbuka dilewati. Per aturan dibuat paling banyak <i>maks per hari</i> visit, dan berhenti menambah
      bila antrean aturan itu yang belum dijadwalkan sudah 5× maks per hari — jadi antrean tidak kebanjiran.
    </div>

    <div v-if="galat" class="alert alert-danger mr-galat" role="alert">
      <span>⚠ {{ galat }}</span>
      <button class="btn btn-ghost btn-sm" :disabled="memuat" @click="muat">Coba lagi</button>
    </div>
    <p v-else-if="memuat && !aturan.length" class="muted">Memuat…</p>
    <div v-else-if="!aturan.length" class="card mr-kosong">
      <p>Belum ada aturan maintenance rutin.</p>
      <button class="btn btn-primary" @click="bukaForm()">+ Buat aturan pertama</button>
    </div>
    <div v-else class="mr-daftar">
      <div v-for="a in aturan" :key="a.id_aturan" class="card mr-kartu" :class="{ mati: !a.is_aktif }">
        <div class="mr-atas">
          <div>
            <h3>{{ a.nama }} <span v-if="!a.is_aktif" class="badge badge-gray">nonaktif</span></h3>
            <p class="muted">{{ a.pelanggan || 'Semua pelanggan' }}<template v-if="a.kota"> · kota “{{ a.kota }}”</template> · {{ labelInterval(a.interval_hari) }}<template v-if="a.tgl_mulai"> · mulai {{ new Date(a.tgl_mulai).toLocaleDateString('id-ID') }}</template> · maks {{ a.maks_per_hari }}/hari · prioritas {{ a.prioritas }}</p>
          </div>
          <div class="mr-tombol">
            <button class="btn btn-ghost btn-sm" :disabled="proses || !a.is_aktif" @click="jalankan(a)">▶ Jalankan sekarang</button>
            <button class="btn btn-ghost btn-sm" @click="bukaForm(a)">✏️ Ubah</button>
            <button class="btn btn-ghost btn-sm" aria-label="Hapus aturan" title="Hapus aturan" @click="hapus(a)">🗑</button>
          </div>
        </div>
        <div class="mr-angka">
          <div><b>{{ angka(a.jumlah_site) }}</b><small>store aktif tercakup</small></div>
          <div :class="{ merah: a.jatuh_tempo }"><b>{{ angka(a.jatuh_tempo) }}</b><small>sudah jatuh tempo</small></div>
          <div><b>{{ angka(a.tempo_30hari) }}</b><small>jatuh tempo ≤30 hari</small></div>
          <div><b>{{ angka(a.antrean_aktif) }}</b><small>visit aktif dari aturan ini</small></div>
          <div><b>{{ angka(a.dibuat_total) }}</b><small>total dibuat</small></div>
        </div>
        <p v-if="a.jatuh_tempo > a.maks_per_hari * 20" class="mr-catatan">
          ⚠ {{ angka(a.jatuh_tempo) }} store jatuh tempo dengan kuota {{ a.maks_per_hari }}/hari butuh ±{{ Math.ceil(a.jatuh_tempo / a.maks_per_hari) }} hari untuk terkejar — naikkan maks per hari bila tim sanggup.
        </p>
        <small class="muted">Terakhir jalan: {{ a.terakhir_jalan ? fmtDateTime(a.terakhir_jalan) : 'belum pernah' }}</small>
      </div>
    </div>

    <div v-if="form" class="modal-overlay" @click.self="form = null">
      <div class="modal" v-focus-trap>
        <div class="modal-header">
          <span class="modal-title">{{ form.id ? 'Ubah aturan' : 'Aturan maintenance baru' }}</span>
          <button type="button" class="btn-modal-close" aria-label="Tutup" @click="form = null">✕</button>
        </div>
        <div class="modal-body mr-form">
          <div class="form-group"><label class="form-label form-required">Nama aturan</label><input v-model="form.nama" class="form-input" placeholder="mis. PM Kopi Kenangan 3 bulanan" /></div>
          <div class="form-group">
            <label class="form-label">Pelanggan</label>
            <select v-model="form.id_pelanggan" class="form-select" :disabled="!pelangganOk">
              <option :value="0">Semua pelanggan</option>
              <option v-for="p in pelanggan" :key="p.id_pelanggan" :value="p.id_pelanggan">{{ p.nama_pelanggan }} ({{ p.site_aktif }} store)</option>
            </select>
            <span v-if="pelangganMemuat" class="form-hint">Memuat daftar pelanggan…</span>
            <span v-else-if="pelangganGalat" class="form-error">
              {{ pelangganGalat }} — aturan belum bisa disimpan.
              <button type="button" class="btn btn-ghost btn-sm" @click="muatPelanggan">Coba lagi</button>
            </span>
          </div>
          <div class="form-group"><label class="form-label">Kota (opsional)</label><input v-model="form.kota" class="form-input" placeholder="mis. Surabaya — kosongkan untuk semua kota" /></div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Interval</label>
              <select v-model.number="form.interval_hari" class="form-select">
                <option v-for="i in INTERVAL" :key="i[0]" :value="i[0]">{{ i[1] }}</option>
                <option v-if="!INTERVAL.some((i) => i[0] === form.interval_hari)" :value="form.interval_hari">Tiap {{ form.interval_hari }} hari</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Maks visit dibuat per hari</label><input v-model.number="form.maks_per_hari" type="number" min="1" max="100" class="form-input" /></div>
          </div>
          <div class="form-group">
            <label class="form-label">Mulai berlaku</label>
            <input v-model="form.tgl_mulai" type="date" class="form-input" />
            <span class="form-hint">Store yang belum pernah di-maintenance mulai masuk antrean sejak tanggal ini, dicicil sesuai maks per hari.</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Prioritas</label>
              <select v-model="form.prioritas" class="form-select"><option v-for="p in PRIORITAS" :key="p" :value="p">{{ p }}</option></select>
            </div>
            <div class="form-group"><label class="form-label">Status</label><label class="mr-cek"><input v-model="form.is_aktif" type="checkbox" /> Aktif</label></div>
          </div>
          <div class="form-group"><label class="form-label form-required">Tugas maintenance</label><textarea v-model="form.deskripsi" class="form-textarea" rows="4" /></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="form = null">Batal</button>
          <button class="btn btn-primary" :disabled="proses || !pelangganOk" @click="simpan">Simpan</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mr-galat { align-items: center; justify-content: space-between; margin-bottom: 12px; }
.mr-tombol { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-start; }
.mr-info { padding: 12px 16px; font-size: 13px; color: var(--text-2); line-height: 1.6; margin-bottom: 16px; }
.mr-kosong { padding: 32px; text-align: center; }
.mr-daftar { display: flex; flex-direction: column; gap: 12px; }
.mr-kartu { padding: 14px 16px; }
.mr-kartu.mati { opacity: .6; }
.mr-atas { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.mr-atas h3 { margin: 0 0 2px; font-size: 15px; }
.mr-atas p { margin: 0; font-size: 13px; }
.mr-angka { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin: 12px 0 8px; }
.mr-angka div { background: var(--bg, #f8fafc); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; }
.mr-angka b { font-size: 18px; font-variant-numeric: tabular-nums; }
.mr-angka small { color: var(--text-muted); font-size: 11.5px; }
.mr-angka .merah b { color: #c2410c; }
.mr-catatan { font-size: 12.5px; color: #b45309; margin: 0 0 6px; }
.mr-form { display: flex; flex-direction: column; gap: 12px; }
.mr-cek { display: flex; gap: 6px; align-items: center; height: 38px; font-size: 14px; }
</style>
