<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtRupiah } from '@/composables/useFormat'
import { alertError, confirmDialog } from '@/composables/useDialog'
import { angka, tanggal, type Layanan } from './pb'

interface Baris {
  nama_site: string; alamat: string; lantai_unit: string; kota: string; id_layanan: number | ''
  biaya_bulanan: number; biaya_instalasi: number; tgl_rfs: string; pic_store_nama: string; pic_store_hp: string
}
interface Pelanggan { id_pelanggan: number; kode_pelanggan: string; nama_pelanggan: string; nama_pic_utama: string | null; no_hp_pic_utama: string | null; email_billing: string | null }

const route = useRoute()
const router = useRouter()
const idSph = computed(() => (route.params.id ? Number(route.params.id) : null))

const layanan = ref<Layanan[]>([])
const f = reactive({
  id_pelanggan: null as number | null, nama_pelanggan: '', baru: false, pelanggan_baru: '',
  nama_pic: '', telp_pic: '', email_pic: '', durasi_bulan: 12, catatan: '',
})
const site = ref<Baris[]>([])
const memuat = ref(true)
const menyimpan = ref(false)

const kosong = (): Baris => ({ nama_site: '', alamat: '', lantai_unit: '', kota: '', id_layanan: '', biaya_bulanan: 0, biaya_instalasi: 0, tgl_rfs: '', pic_store_nama: '', pic_store_hp: '' })

onMounted(async () => {
  try {
    const { data } = await api.get('/pasang-baru/referensi')
    layanan.value = data.data.layanan
    if (idSph.value) {
      const { data: d } = await api.get(`/pasang-baru/sph/${idSph.value}`)
      const s = d.data
      Object.assign(f, {
        id_pelanggan: s.id_pelanggan, nama_pelanggan: s.pelanggan.nama_pelanggan, nama_pic: s.nama_pic, telp_pic: s.telp_pic || '',
        email_pic: s.email_pic || '', durasi_bulan: s.durasi_bulan, catatan: s.catatan || '',
      })
      site.value = s.order.map((o: any) => ({
        nama_site: o.nama_site, alamat: o.alamat, lantai_unit: o.lantai_unit || '', kota: o.kota || '', id_layanan: o.id_layanan,
        biaya_bulanan: Number(o.biaya_bulanan), biaya_instalasi: Number(o.biaya_instalasi), tgl_rfs: o.tgl_rfs ? o.tgl_rfs.slice(0, 10) : '',
        pic_store_nama: o.pic_store_nama || '', pic_store_hp: o.pic_store_hp || '',
      }))
    } else {
      site.value = [kosong()]
    }
  } catch (e) {
    alertError(e, 'Gagal memuat')
  } finally {
    memuat.value = false
  }
})

// ── Pilih pelanggan ──────────────────────────────────────────────────────────
const cariP = ref('')
const hasilP = ref<Pelanggan[]>([])
let timerP: ReturnType<typeof setTimeout> | null = null
watch(cariP, (q) => {
  if (timerP) clearTimeout(timerP)
  if (q.trim().length < 2) { hasilP.value = []; return }
  timerP = setTimeout(async () => {
    const { data } = await api.get('/pasang-baru/pelanggan', { params: { q } })
    hasilP.value = data.data
  }, 300)
})
function pilihP(p: Pelanggan) {
  f.id_pelanggan = p.id_pelanggan
  f.nama_pelanggan = p.nama_pelanggan
  f.baru = false
  if (!f.nama_pic && p.nama_pic_utama) f.nama_pic = p.nama_pic_utama
  if (!f.telp_pic && p.no_hp_pic_utama) f.telp_pic = p.no_hp_pic_utama
  if (!f.email_pic && p.email_billing) f.email_pic = p.email_billing
  cariP.value = ''
  hasilP.value = []
}
function pelangganBaru() {
  f.baru = true
  f.id_pelanggan = null
  f.pelanggan_baru = cariP.value.trim()
  cariP.value = ''
  hasilP.value = []
}

// ── Baris site ───────────────────────────────────────────────────────────────
const totalBulanan = computed(() => site.value.reduce((a, s) => a + (Number(s.biaya_bulanan) || 0), 0))
const totalInstalasi = computed(() => site.value.reduce((a, s) => a + (Number(s.biaya_instalasi) || 0), 0))
function hapusBaris(i: number) { site.value.splice(i, 1) }
function salinBaris(i: number) { site.value.splice(i + 1, 0, { ...site.value[i]!, nama_site: '', alamat: '', lantai_unit: '', pic_store_nama: '', pic_store_hp: '' }) }
const barisKurang = (s: Baris) => !s.nama_site.trim() || s.alamat.trim().length < 5 || !s.id_layanan

// ── Tempel dari Excel ────────────────────────────────────────────────────────
const KOLOM = ['Nama Site', 'Alamat', 'Lantai/Unit', 'Kota', 'Layanan', 'Biaya Bulanan', 'Biaya Instalasi', 'RFS', 'Nama PIC Store', 'HP PIC Store']
const tempel = reactive({ buka: false, teks: '', ganti: false })
const pratinjauTempel = computed(() => {
  const baris = tempel.teks.split(/\r?\n/).map((b) => b.split('\t')).filter((k) => k.some((x) => x.trim()))
  // Lewati baris judul bila ada
  if (baris[0] && /nama\s*site/i.test(baris[0][0] || '')) baris.shift()
  return baris.map((k) => {
    const nama = (k[4] || '').trim().toLowerCase()
    const l = layanan.value.find((x) => x.nama_layanan.toLowerCase() === nama)
    return {
      nama_site: (k[0] || '').trim(), alamat: (k[1] || '').trim(), lantai_unit: (k[2] || '').trim(), kota: (k[3] || '').trim(),
      id_layanan: l ? l.id_layanan : '' as const, layanan_teks: (k[4] || '').trim(),
      biaya_bulanan: angka(k[5]), biaya_instalasi: angka(k[6]), tgl_rfs: tanggal(k[7] || ''),
      pic_store_nama: (k[8] || '').trim(), pic_store_hp: (k[9] || '').trim(),
    }
  })
})
function pakaiTempel() {
  const rows: Baris[] = pratinjauTempel.value.map(({ layanan_teks, ...r }) => r)
  const sisa = site.value.filter((s) => s.nama_site.trim() || s.alamat.trim())
  site.value = tempel.ganti ? rows : [...sisa, ...rows]
  Object.assign(tempel, { buka: false, teks: '', ganti: false })
}

// ── Simpan ───────────────────────────────────────────────────────────────────
const siap = computed(() => (f.id_pelanggan || (f.baru && f.pelanggan_baru.trim().length >= 2)) && f.nama_pic.trim().length >= 2
  && site.value.length > 0 && !site.value.some(barisKurang))

async function simpan(ajukan: boolean) {
  if (!siap.value) return
  if (ajukan && !(await confirmDialog({ title: 'Ajukan ke Director', message: `Ajukan SPH berisi ${site.value.length} site ke Director untuk disetujui?` }))) return
  menyimpan.value = true
  try {
    const body = {
      ...(f.baru ? { pelanggan_baru: f.pelanggan_baru.trim() } : { id_pelanggan: f.id_pelanggan }),
      nama_pic: f.nama_pic, telp_pic: f.telp_pic || undefined, email_pic: f.email_pic || undefined,
      durasi_bulan: Number(f.durasi_bulan), catatan: f.catatan || undefined,
      site: site.value.map((s) => ({
        ...s, id_layanan: Number(s.id_layanan), biaya_bulanan: Number(s.biaya_bulanan) || 0, biaya_instalasi: Number(s.biaya_instalasi) || 0,
        tgl_rfs: s.tgl_rfs || undefined, lantai_unit: s.lantai_unit || undefined, kota: s.kota || undefined,
        pic_store_nama: s.pic_store_nama || undefined, pic_store_hp: s.pic_store_hp || undefined,
      })),
    }
    const { data } = idSph.value ? await api.put(`/pasang-baru/sph/${idSph.value}`, body) : await api.post('/pasang-baru/sph', body)
    const id = idSph.value ?? data.data.id_sph
    if (ajukan) await api.post(`/pasang-baru/sph/${id}/ajukan`)
    router.push(`/pasang-baru/sph/${id}`)
  } catch (e) {
    alertError(e, 'Gagal menyimpan SPH')
  } finally {
    menyimpan.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ idSph ? 'Ubah SPH' : 'SPH Baru' }}</h2>
        <p class="page-subtitle">Satu penawaran untuk satu pelanggan, berisi satu atau banyak site</p>
      </div>
      <button class="btn btn-ghost" @click="router.back()">← Kembali</button>
    </div>

    <p v-if="memuat" class="muted">Memuat…</p>
    <template v-else>
      <div class="detail-section">
        <div class="detail-section-header"><b>Pelanggan</b></div>
        <div class="detail-section-body">
          <div class="form-group">
            <label class="form-label form-required">Perusahaan</label>
            <div v-if="f.id_pelanggan && !f.baru" class="sf-pilih">
              <b>{{ f.nama_pelanggan }}</b>
              <button class="btn btn-sm btn-ghost" @click="f.id_pelanggan = null">Ganti</button>
            </div>
            <div v-else-if="f.baru" class="sf-pilih">
              <input v-model="f.pelanggan_baru" class="form-input" maxlength="200" placeholder="Nama perusahaan baru (mis. PT Contoh Jaya)" />
              <span class="badge badge-blue">Baru</span>
              <button class="btn btn-sm btn-ghost" @click="f.baru = false">Batal</button>
            </div>
            <div v-else class="sf-cari">
              <input v-model="cariP" class="form-input" placeholder="Ketik nama pelanggan…" />
              <div v-if="cariP.trim().length >= 2" class="sf-hasil">
                <button v-for="p in hasilP" :key="p.id_pelanggan" @click="pilihP(p)">
                  <b>{{ p.nama_pelanggan }}</b> <small class="muted">{{ p.kode_pelanggan }}</small>
                </button>
                <button class="sf-baru" @click="pelangganBaru">+ Pelanggan baru "{{ cariP.trim() }}"</button>
              </div>
            </div>
          </div>
          <div class="grid-4 sf-grid">
            <div class="form-group"><label class="form-label form-required">Nama PIC</label><input v-model="f.nama_pic" class="form-input" maxlength="150" /></div>
            <div class="form-group"><label class="form-label">Telp</label><input v-model="f.telp_pic" class="form-input" maxlength="30" /></div>
            <div class="form-group"><label class="form-label">Email</label><input v-model="f.email_pic" type="email" class="form-input" maxlength="150" /></div>
            <div class="form-group"><label class="form-label form-required">Lama berlangganan (bulan)</label><input v-model.number="f.durasi_bulan" type="number" min="1" max="120" class="form-input" /></div>
          </div>
          <div class="form-group"><label class="form-label">Catatan</label><textarea v-model="f.catatan" rows="2" maxlength="5000" class="form-textarea"></textarea></div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-header sf-head">
          <b>Site ({{ site.length }})</b>
          <span>
            <button class="btn btn-sm btn-ghost" @click="tempel.buka = true">📋 Tempel dari Excel</button>
            <button class="btn btn-sm btn-primary" @click="site.push(kosong())">+ Tambah site</button>
          </span>
        </div>
        <div class="table-wrap">
          <table class="data-table sf-tabel">
            <thead>
              <tr>
                <th>#</th><th>Nama site *</th><th>Alamat *</th><th>Lantai/Unit</th><th>Kota</th><th>Layanan *</th>
                <th>Bulanan</th><th>Instalasi</th><th>RFS</th><th>PIC store</th><th>HP PIC</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in site" :key="i" :class="{ kurang: barisKurang(s) }">
                <td class="muted">{{ i + 1 }}</td>
                <td><input v-model="s.nama_site" class="form-input" maxlength="150" /></td>
                <td><textarea v-model="s.alamat" rows="1" class="form-input sf-alamat" maxlength="2000"></textarea></td>
                <td><input v-model="s.lantai_unit" class="form-input sf-kecil" maxlength="100" placeholder="Lt 2 Unit 23" /></td>
                <td><input v-model="s.kota" class="form-input sf-kecil" maxlength="100" /></td>
                <td>
                  <select v-model="s.id_layanan" class="form-input">
                    <option value="">— pilih —</option>
                    <option v-for="l in layanan" :key="l.id_layanan" :value="l.id_layanan">{{ l.nama_layanan }}</option>
                  </select>
                </td>
                <td><input v-model.number="s.biaya_bulanan" type="number" min="0" class="form-input sf-uang" /></td>
                <td><input v-model.number="s.biaya_instalasi" type="number" min="0" class="form-input sf-uang" /></td>
                <td><input v-model="s.tgl_rfs" type="date" class="form-input" /></td>
                <td><input v-model="s.pic_store_nama" class="form-input sf-kecil" maxlength="150" /></td>
                <td><input v-model="s.pic_store_hp" class="form-input sf-kecil" maxlength="30" /></td>
                <td class="sf-aksi">
                  <button class="btn btn-sm btn-ghost" title="Duplikat (layanan & harga sama)" @click="salinBaris(i)">⧉</button>
                  <button class="btn btn-sm btn-ghost" title="Hapus" @click="hapusBaris(i)">✕</button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="6" class="kanan"><b>Total</b></td><td><b>{{ fmtRupiah(totalBulanan) }}</b></td><td><b>{{ fmtRupiah(totalInstalasi) }}</b></td><td colspan="4"></td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="sf-tombol">
        <span v-if="!siap" class="muted">Lengkapi pelanggan, PIC, dan kolom bertanda * di tiap site.</span>
        <button class="btn btn-ghost" :disabled="!siap || menyimpan" @click="simpan(false)">Simpan draft</button>
        <button class="btn btn-primary" :disabled="!siap || menyimpan" @click="simpan(true)">{{ menyimpan ? 'Menyimpan…' : 'Simpan & ajukan ke Director' }}</button>
      </div>
    </template>

    <div v-if="tempel.buka" class="modal-overlay" @click.self="tempel.buka = false">
      <div class="modal modal-xl">
        <div class="modal-header">
          <h3 class="modal-title">📋 Tempel dari Excel</h3>
          <button class="btn-modal-close" @click="tempel.buka = false">×</button>
        </div>
        <div class="modal-body">
          <p class="form-hint">Di Excel, susun kolom berurutan lalu blok dan salin (Ctrl+C), tempel di bawah (Ctrl+V):</p>
          <p class="sf-kolom"><span v-for="(k, i) in KOLOM" :key="k">{{ i + 1 }}. {{ k }}</span></p>
          <p class="form-hint">Nama layanan harus sama dengan daftar layanan ERP. Tanggal RFS boleh 10/11/2026 atau 2026-11-10.</p>
          <textarea v-model="tempel.teks" rows="8" class="form-textarea" placeholder="Tempel baris Excel di sini…"></textarea>
          <div v-if="pratinjauTempel.length" class="table-wrap sf-pratinjau">
            <table class="data-table">
              <thead><tr><th>Site</th><th>Alamat</th><th>Layanan</th><th>Bulanan</th><th>Instalasi</th><th>RFS</th><th>PIC</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in pratinjauTempel" :key="i">
                  <td>{{ r.nama_site }}</td><td>{{ r.alamat }} {{ r.lantai_unit }}</td>
                  <td :class="{ merah: !r.id_layanan }">{{ r.layanan_teks || '—' }}<small v-if="!r.id_layanan"> (tidak dikenal)</small></td>
                  <td>{{ fmtRupiah(r.biaya_bulanan) }}</td><td>{{ fmtRupiah(r.biaya_instalasi) }}</td>
                  <td>{{ r.tgl_rfs || '-' }}</td><td>{{ r.pic_store_nama }} {{ r.pic_store_hp }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <label class="sf-ganti"><input v-model="tempel.ganti" type="checkbox" /> Ganti semua site yang sudah ada</label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="tempel.buka = false">Batal</button>
          <button class="btn btn-primary" :disabled="!pratinjauTempel.length" @click="pakaiTempel">Pakai {{ pratinjauTempel.length }} baris</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sf-pilih { display: flex; gap: 8px; align-items: center; }
.sf-cari { position: relative; max-width: 480px; }
.sf-hasil { position: absolute; z-index: 10; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,.08); max-height: 280px; overflow: auto; }
.sf-hasil button { display: block; width: 100%; text-align: left; padding: 8px 12px; border: none; background: none; cursor: pointer; }
.sf-hasil button:hover { background: #f1f5f9; }
.sf-baru { color: #2563eb; font-weight: 600; border-top: 1px solid #e2e8f0 !important; }
.sf-grid { margin: 12px 0; }
.sf-head { display: flex; justify-content: space-between; align-items: center; }
.sf-head span { display: flex; gap: 6px; }
.sf-tabel td { padding: 4px; vertical-align: top; }
.sf-tabel .form-input { min-width: 0; padding: 6px 8px; font-size: 13px; }
.sf-alamat { min-width: 200px; resize: vertical; }
.sf-kecil { width: 120px; }
.sf-uang { width: 120px; }
.sf-aksi { white-space: nowrap; }
tr.kurang td:first-child { border-left: 3px solid #f59e0b; }
.sf-tombol { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 16px; }
.sf-kolom { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; font-weight: 600; }
.sf-pratinjau { max-height: 260px; overflow: auto; margin-top: 10px; }
.sf-ganti { display: flex; gap: 6px; align-items: center; margin-top: 10px; font-size: 13px; }
.merah { color: #dc2626; }
.kanan { text-align: right; }
.muted { color: var(--text-3); }
</style>
