<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { alertError, confirmDialog } from '@/composables/useDialog'
import type { Layanan } from './pb'

interface Baris { id_survey_site?: number; nama_site: string; alamat: string; lantai_unit: string; kota: string; id_layanan: number | '' }
interface Pelanggan { id_pelanggan: number; kode_pelanggan: string; nama_pelanggan: string; nama_pic_utama: string | null; no_hp_pic_utama: string | null; email_billing: string | null }

const route = useRoute()
const router = useRouter()
const idSurvey = computed(() => (route.params.id ? Number(route.params.id) : null))

const layanan = ref<Layanan[]>([])
const f = reactive({ id_pelanggan: null as number | null, kode_pelanggan: '', nama_perusahaan: '', nama_pic: '', telp_pic: '', email_pic: '', catatan: '' })
const site = ref<Baris[]>([])
const memuat = ref(true)
const menyimpan = ref(false)
const kosong = (): Baris => ({ nama_site: '', alamat: '', lantai_unit: '', kota: '', id_layanan: '' })

onMounted(async () => {
  try {
    const { data } = await api.get('/pasang-baru/referensi')
    layanan.value = data.data.layanan
    if (idSurvey.value) {
      const { data: d } = await api.get(`/pasang-baru/survey/${idSurvey.value}`)
      const s = d.data
      Object.assign(f, {
        id_pelanggan: s.id_pelanggan, kode_pelanggan: s.pelanggan?.kode_pelanggan || '', nama_perusahaan: s.nama_perusahaan,
        nama_pic: s.nama_pic, telp_pic: s.telp_pic || '', email_pic: s.email_pic || '', catatan: s.catatan || '',
      })
      if (s.status !== 'Draft') { alertError(new Error(`Survey berstatus ${s.status} — hanya Draft yang bisa diubah`)); router.replace(`/pasang-baru/survey/${s.id_survey}`); return }
      site.value = s.site.map((o: any) => ({ id_survey_site: o.id_survey_site, nama_site: o.nama_site, alamat: o.alamat, lantai_unit: o.lantai_unit || '', kota: o.kota || '', id_layanan: o.id_layanan }))
    } else {
      site.value = [kosong()]
    }
  } catch (e) {
    alertError(e, 'Gagal memuat')
  } finally {
    memuat.value = false
  }
})

// ── Perusahaan: ketik bebas (calon pelanggan) atau pilih pelanggan yang sudah ada ──
const hasilP = ref<Pelanggan[]>([])
const saranBuka = ref(false)
let timerP: ReturnType<typeof setTimeout> | null = null
watch(() => f.nama_perusahaan, (q) => {
  if (timerP) clearTimeout(timerP)
  if (f.id_pelanggan || q.trim().length < 2) { hasilP.value = []; return }
  timerP = setTimeout(async () => {
    try {
      const { data } = await api.get('/pasang-baru/pelanggan', { params: { q } })
      hasilP.value = data.data
    } catch { hasilP.value = [] }
  }, 300)
})
function pilihP(p: Pelanggan) {
  Object.assign(f, { id_pelanggan: p.id_pelanggan, kode_pelanggan: p.kode_pelanggan, nama_perusahaan: p.nama_pelanggan })
  if (!f.nama_pic && p.nama_pic_utama) f.nama_pic = p.nama_pic_utama
  if (!f.telp_pic && p.no_hp_pic_utama) f.telp_pic = p.no_hp_pic_utama
  if (!f.email_pic && p.email_billing) f.email_pic = p.email_billing
  hasilP.value = []
  saranBuka.value = false
}
const tutupSaran = () => setTimeout(() => (saranBuka.value = false), 150)
function lepasP() {
  Object.assign(f, { id_pelanggan: null, kode_pelanggan: '' })
}

// ── Site ─────────────────────────────────────────────────────────────────────
const barisKurang = (s: Baris) => s.nama_site.trim().length < 2 || s.alamat.trim().length < 5 || !s.id_layanan
function salinBaris(i: number) { site.value.splice(i + 1, 0, { ...site.value[i]!, id_survey_site: undefined, nama_site: '', alamat: '', lantai_unit: '' }) }

// Tempel dari Excel: Nama Site | Alamat | Lantai/Unit | Kota | Layanan
const KOLOM = ['Nama Site', 'Alamat', 'Lantai/Unit', 'Kota', 'Layanan']
const tempel = reactive({ buka: false, teks: '', ganti: false })
const pratinjauTempel = computed(() => {
  const baris = tempel.teks.split(/\r?\n/).map((b) => b.split('\t')).filter((k) => k.some((x) => x.trim()))
  if (baris[0] && /nama\s*site/i.test(baris[0][0] || '')) baris.shift()
  return baris.map((k) => {
    const teks = (k[4] || '').trim()
    const l = layanan.value.find((x) => x.nama_layanan.toLowerCase() === teks.toLowerCase())
    return { nama_site: (k[0] || '').trim(), alamat: (k[1] || '').trim(), lantai_unit: (k[2] || '').trim(), kota: (k[3] || '').trim(), id_layanan: l ? l.id_layanan : '' as const, layanan_teks: teks }
  })
})
function pakaiTempel() {
  const rows: Baris[] = pratinjauTempel.value.map(({ layanan_teks, ...r }) => r)
  const sisa = site.value.filter((s) => s.nama_site.trim() || s.alamat.trim())
  site.value = tempel.ganti ? rows : [...sisa, ...rows]
  Object.assign(tempel, { buka: false, teks: '', ganti: false })
}

// ── Simpan ───────────────────────────────────────────────────────────────────
const emailSalah = computed(() => !!f.email_pic.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email_pic.trim()))
const siap = computed(() => f.nama_perusahaan.trim().length >= 2 && f.nama_pic.trim().length >= 2 && !emailSalah.value
  && site.value.length > 0 && !site.value.some(barisKurang))

async function simpan(ajukan: boolean) {
  if (!siap.value) return
  if (ajukan && !(await confirmDialog({ title: 'Ajukan ke OPS', message: `Ajukan survey berisi ${site.value.length} site ke OPS untuk dicek vendor ISP, IKG, deposit, dan cover?`, confirmLabel: 'Ajukan' }))) return
  menyimpan.value = true
  try {
    const body = {
      id_pelanggan: f.id_pelanggan || undefined, nama_perusahaan: f.nama_perusahaan.trim(),
      nama_pic: f.nama_pic.trim(), telp_pic: f.telp_pic.trim() || undefined, email_pic: f.email_pic.trim() || undefined,
      catatan: f.catatan.trim() || undefined,
      site: site.value.map((s) => ({
        id_survey_site: s.id_survey_site, nama_site: s.nama_site.trim(), alamat: s.alamat.trim(), lantai_unit: s.lantai_unit.trim() || undefined,
        kota: s.kota.trim() || undefined, id_layanan: Number(s.id_layanan),
      })),
    }
    const { data } = idSurvey.value ? await api.put(`/pasang-baru/survey/${idSurvey.value}`, body) : await api.post('/pasang-baru/survey', body)
    const id = idSurvey.value ?? data.data.id_survey
    if (ajukan) await api.post(`/pasang-baru/survey/${id}/ajukan`, {})
    router.push(`/pasang-baru/survey/${id}`)
  } catch (e) {
    alertError(e, 'Gagal menyimpan survey')
  } finally {
    menyimpan.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ idSurvey ? 'Ubah Survey' : 'Survey Baru' }}</h2>
        <p class="page-subtitle">Langkah pertama pasang baru — data calon pelanggan dan lokasi yang akan disurvey</p>
      </div>
      <button class="btn btn-ghost" @click="router.back()">← Kembali</button>
    </div>

    <p v-if="memuat" class="muted">Memuat…</p>
    <template v-else>
      <div class="detail-section">
        <div class="detail-section-header"><b>Perusahaan &amp; PIC</b></div>
        <div class="detail-section-body">
          <div class="grid-2 sv-grid">
            <div class="form-group sv-perusahaan">
              <label class="form-label form-required">Perusahaan</label>
              <div class="sv-input-pel">
                <input
                  v-model="f.nama_perusahaan" class="form-input" maxlength="200" placeholder="mis. PT Contoh Jaya"
                  :readonly="!!f.id_pelanggan" @focus="saranBuka = true" @blur="tutupSaran"
                />
                <span v-if="f.id_pelanggan" class="sv-tag">
                  <span class="badge badge-green">Pelanggan {{ f.kode_pelanggan }}</span>
                  <button class="btn btn-sm btn-ghost" @click="lepasP">Ganti</button>
                </span>
              </div>
              <div v-if="saranBuka && hasilP.length && !f.id_pelanggan" class="sv-hasil">
                <small class="sv-hasil-judul">Sudah jadi pelanggan? Pilih supaya terhubung:</small>
                <button v-for="p in hasilP" :key="p.id_pelanggan" @mousedown.prevent="pilihP(p)">
                  <b>{{ p.nama_pelanggan }}</b> <small class="muted">{{ p.kode_pelanggan }}</small>
                </button>
              </div>
              <small v-if="!f.id_pelanggan && f.nama_perusahaan.trim().length >= 2" class="form-hint">Calon pelanggan baru — data pelanggan baru dibuat saat SPH.</small>
            </div>
            <div class="form-group"><label class="form-label form-required">Nama PIC</label><input v-model="f.nama_pic" class="form-input" maxlength="150" /></div>
            <div class="form-group"><label class="form-label">Telp</label><input v-model="f.telp_pic" class="form-input" maxlength="30" inputmode="tel" placeholder="08…" /></div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input v-model="f.email_pic" type="email" class="form-input" :class="{ 'is-invalid': emailSalah }" maxlength="150" />
              <small v-if="emailSalah" class="merah">Format email tidak valid</small>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Catatan</label><textarea v-model="f.catatan" rows="2" maxlength="5000" class="form-textarea" placeholder="Kebutuhan, jadwal survey yang diminta, dll."></textarea></div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-header sv-head">
          <b>Site ({{ site.length }})</b>
          <span>
            <button class="btn btn-sm btn-ghost" @click="tempel.buka = true">📋 Tempel dari Excel</button>
            <button class="btn btn-sm btn-primary" @click="site.push(kosong())">+ Tambah site</button>
          </span>
        </div>
        <div class="table-wrap">
          <table class="data-table sv-tabel">
            <thead><tr><th>#</th><th>Nama site *</th><th>Alamat *</th><th>Lantai/Unit</th><th>Kota</th><th>Layanan *</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(s, i) in site" :key="i" :class="{ kurang: barisKurang(s) }">
                <td class="muted">{{ i + 1 }}</td>
                <td><input v-model="s.nama_site" class="form-input" maxlength="150" /></td>
                <td><textarea v-model="s.alamat" rows="1" class="form-input sv-alamat" maxlength="2000"></textarea></td>
                <td><input v-model="s.lantai_unit" class="form-input sv-kecil" maxlength="100" placeholder="Lt 2 Unit 23" /></td>
                <td><input v-model="s.kota" class="form-input sv-kecil" maxlength="100" /></td>
                <td>
                  <select v-model="s.id_layanan" class="form-input">
                    <option value="">— pilih —</option>
                    <option v-for="l in layanan" :key="l.id_layanan" :value="l.id_layanan">{{ l.nama_layanan }}</option>
                  </select>
                </td>
                <td class="sv-aksi">
                  <button class="btn btn-sm btn-ghost" title="Duplikat (kota & layanan sama)" @click="salinBaris(i)">⧉</button>
                  <button class="btn btn-sm btn-ghost" title="Hapus" :disabled="site.length === 1" @click="site.splice(i, 1)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="sv-tombol">
        <span v-if="!siap" class="muted">Lengkapi perusahaan, nama PIC, dan kolom bertanda * di tiap site.</span>
        <button class="btn btn-ghost" :disabled="!siap || menyimpan" @click="simpan(false)">Simpan draft</button>
        <button class="btn btn-primary" :disabled="!siap || menyimpan" @click="simpan(true)">{{ menyimpan ? 'Menyimpan…' : 'Simpan & ajukan ke OPS →' }}</button>
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
          <p class="sv-kolom"><span v-for="(k, i) in KOLOM" :key="k">{{ i + 1 }}. {{ k }}</span></p>
          <p class="form-hint">Nama layanan harus sama dengan daftar layanan ERP.</p>
          <textarea v-model="tempel.teks" rows="8" class="form-textarea" placeholder="Tempel baris Excel di sini…"></textarea>
          <div v-if="pratinjauTempel.length" class="table-wrap sv-pratinjau">
            <table class="data-table">
              <thead><tr><th>Site</th><th>Alamat</th><th>Kota</th><th>Layanan</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in pratinjauTempel" :key="i">
                  <td>{{ r.nama_site }}</td><td>{{ r.alamat }} {{ r.lantai_unit }}</td><td>{{ r.kota }}</td>
                  <td :class="{ merah: !r.id_layanan }">{{ r.layanan_teks || '—' }}<small v-if="!r.id_layanan"> (tidak dikenal)</small></td>
                </tr>
              </tbody>
            </table>
          </div>
          <label class="sv-ganti"><input v-model="tempel.ganti" type="checkbox" /> Ganti semua site yang sudah ada</label>
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
.sv-grid { gap: 0 16px; }
.sv-perusahaan { position: relative; }
.sv-input-pel { display: flex; gap: 8px; align-items: center; }
.sv-input-pel .form-input { flex: 1; min-width: 0; }
.sv-tag { display: flex; gap: 4px; align-items: center; white-space: nowrap; }
.sv-hasil { position: absolute; z-index: 10; top: 100%; left: 0; right: 0; background: var(--surface, #fff); border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,.08); max-height: 280px; overflow: auto; }
.sv-hasil-judul { display: block; padding: 6px 12px; color: var(--text-3); }
.sv-hasil button { display: block; width: 100%; text-align: left; padding: 8px 12px; border: none; background: none; cursor: pointer; color: inherit; }
.sv-hasil button:hover { background: rgba(37, 99, 235, .08); }
.sv-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.sv-head span { display: flex; gap: 6px; }
.sv-tabel td { padding: 4px; vertical-align: top; }
.sv-tabel .form-input { min-width: 0; padding: 6px 8px; font-size: 13px; }
.sv-alamat { min-width: 240px; resize: vertical; }
.sv-kecil { width: 130px; }
.sv-aksi { white-space: nowrap; }
tr.kurang td:first-child { border-left: 3px solid #f59e0b; }
.sv-tombol { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 16px; flex-wrap: wrap; }
.sv-kolom { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; font-weight: 600; }
.sv-pratinjau { max-height: 260px; overflow: auto; margin-top: 10px; }
.sv-ganti { display: flex; gap: 6px; align-items: center; margin-top: 10px; font-size: 13px; }
.merah { color: #dc2626; }
.muted { color: var(--text-3); }
@media (max-width: 700px) { .sv-grid { grid-template-columns: 1fr; } }
</style>
