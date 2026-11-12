<script setup lang="ts">
// Pesan kurir lewat api.co.id: alamat pengirim → tujuan → cek ongkir (Rp 5) → pilih kurir → order (ongkir dipotong saldo)
import { computed, onMounted, reactive, ref, watch } from 'vue'
import api from '@/services/api'
import { fmtRupiah } from '@/composables/useFormat'
import { alertError, confirmDialog, toast } from '@/composables/useDialog'

const props = defineProps<{ order: any }>()
const emit = defineEmits<{ tutup: []; selesai: [] }>()

interface Lokasi { code: string; name: string }
interface Alamat { id: string; label: string; contact_name: string; contact_phone: string; district_code: string; address_line: string; is_default?: boolean }
interface Tarif {
  courier_code: string; courier_name: string; service_code: string; service_name: string; etd: string; total_price: number
  price: number; handling_fee: number; insurance_fee: number; is_cheapest: boolean; is_fastest: boolean
}

const memuat = ref(false)
// Pemesanan kurir berbayar sedang dikirim — modal tidak boleh ditutup / dipesan ulang di tengah jalan
const memesan = ref(false)
function tutup() { if (!memesan.value) emit('tutup') }
const saldo = ref<number | null>(null)
const alamat = ref<Alamat[]>([])
const provinsi = ref<Lokasi[]>([])

// Alamat pengirim (gudang)
const pengirim = ref('')
const baru = reactive({ buka: false, label: 'Gudang HO Surabaya', contact_name: '', contact_phone: '', province_code: '', city_code: '', district_code: '', address_line: '', postal_code: '' })
const kotaBaru = ref<Lokasi[]>([])
const kecBaru = ref<Lokasi[]>([])

// Tujuan (site)
const tujuan = reactive({ province_code: '', city_code: '', district_code: '' })
const kotaTujuan = ref<Lokasi[]>([])
const kecTujuan = ref<Lokasi[]>([])

// Tujuan kirim: langsung ke store (PIC) atau ke teknisi vendor (dibawa saat pasang)
const kirimAwal = props.order.network?.wo?.pengiriman?.[0]
const teknisi = props.order.network?.wo?.kontak_teknisi ?? null
const tujuanKirim = ref<'Store' | 'Teknisi'>(kirimAwal?.tujuan_kirim === 'Teknisi' && teknisi ? 'Teknisi' : 'Store')
function isiPenerima() {
  const o = props.order
  if (tujuanKirim.value === 'Teknisi' && teknisi) {
    Object.assign(penerima, {
      recipient_name: teknisi.nama.slice(0, 30), recipient_phone: teknisi.no_hp,
      recipient_address: (teknisi.alamat || '').slice(0, 500),
    })
  } else {
    Object.assign(penerima, {
      recipient_name: (o.pic_store_nama || o.sph?.nama_pic || '').slice(0, 30),
      recipient_phone: o.pic_store_hp || o.sph?.telp_pic || '',
      recipient_address: `${o.nama_site}, ${o.alamat}${o.lantai_unit ? ' — ' + o.lantai_unit : ''}${o.kota ? ', ' + o.kota : ''}`.slice(0, 500),
    })
  }
}
const paket = reactive({ weight: 1000, item_value: 0, insurance: false, sender_type: 'picked up' })
const tarif = ref<{ quote_id: string; rates: Tarif[] } | null>(null)
const dipilih = ref<Tarif | null>(null)
const penerima = reactive({
  recipient_name: '', recipient_phone: '', recipient_address: '', product_name: '', product_price: 0, note: '', picked_up_time: '',
})

async function ambil<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return (await api.get(url, { params })).data.data as T
}

// Daftar kota/kecamatan per bagian (tujuan / alamat baru): tampilkan status memuat & error, bukan dropdown kosong diam-diam
const lok = reactive({ tujuan: { memuat: 0, error: '' }, baru: { memuat: 0, error: '' } })
async function ambilLokasi(bagian: 'tujuan' | 'baru', jenis: 'kota' | 'kecamatan', params: Record<string, unknown>): Promise<Lokasi[]> {
  const st = lok[bagian]
  st.memuat++; st.error = ''
  try {
    return await ambil<Lokasi[]>(`/pasang-baru/kurir-api/${jenis}`, params)
  } catch (e: any) {
    const m = e?.response?.data?.message
    st.error = `Gagal memuat daftar ${jenis}: ${Array.isArray(m) ? m.join(', ') : m || 'coba pilih ulang'}`
    return []
  } finally { st.memuat-- }
}

onMounted(async () => {
  memuat.value = true
  try {
    const [s, a, p] = await Promise.all([
      ambil<{ balance: number }>('/pasang-baru/kurir-api/saldo').catch(() => null),
      ambil<Alamat[]>('/pasang-baru/kurir-api/alamat'),
      ambil<Lokasi[]>('/pasang-baru/kurir-api/provinsi'),
    ])
    saldo.value = s?.balance ?? null
    alamat.value = a ?? []
    provinsi.value = p ?? []
    pengirim.value = (alamat.value.find((x) => x.is_default) ?? alamat.value[0])?.id ?? ''
    baru.buka = !alamat.value.length
    // Isi otomatis dari order
    const o = props.order
    const perangkat = (o.network?.perangkat || []).filter((x: any) => x.aset).map((x: any) => x.aset.nama_perangkat)
    isiPenerima()
    Object.assign(penerima, {
      product_name: (perangkat.join(', ') || 'Perangkat jaringan').slice(0, 100),
      product_price: 1000000, note: `Pasang baru ${o.nomor_pb}`,
    })
    paket.item_value = penerima.product_price
    // jemput besok 09:00 WIB
    const b = new Date(Date.now() + 86400_000)
    penerima.picked_up_time = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-${String(b.getDate()).padStart(2, '0')}T09:00`
    tebakTujuan(tujuanKirim.value === 'Teknisi' ? teknisi?.alamat ?? '' : props.order.kota)
  } catch (e) {
    alertError(e, 'Gagal memuat data kurir')
  } finally {
    memuat.value = false
  }
})

// Tebak provinsi/kota tujuan dari nama kota site / teks alamat teknisi
let urutTebak = 0
async function tebakTujuan(teks: string | null | undefined) {
  const urut = ++urutTebak
  const cari = String(teks || '').toLowerCase().replace(/^(kota|kab\.?|kabupaten)\s+/, '').trim()
  if (!cari) return
  const norm = (n: string) => n.toLowerCase().replace(/^(kota|kab\.?|kabupaten)\s+/, '').replace(/\s*\(.*\)$/, '').trim()
  for (const p of provinsi.value) {
    const ks = await ambil<Lokasi[]>('/pasang-baru/kurir-api/kota', { province: p.code }).catch(() => [])
    // tujuan sudah diganti / dipilih manual selama pencarian → hasil tebakan lama dibuang
    if (urut !== urutTebak || tujuan.province_code) return
    // kota site: nama kota mengandung teks; alamat teknisi: teks alamat mengandung nama kota
    const cocok = ks.find((k) => norm(k.name).includes(cari) || (norm(k.name).length > 3 && cari.includes(norm(k.name))))
    if (cocok) {
      kotaTujuan.value = ks
      tujuan.province_code = p.code
      tujuan.city_code = cocok.code
      return
    }
  }
}

watch(() => tujuan.province_code, async (v, lama) => {
  if (!v || (lama === '' && kotaTujuan.value.length)) return
  tujuan.city_code = ''; tujuan.district_code = ''
  kotaTujuan.value = await ambilLokasi('tujuan', 'kota', { province: v })
})
watch(() => tujuan.city_code, async (v) => {
  tujuan.district_code = ''; kecTujuan.value = []
  if (v) kecTujuan.value = await ambilLokasi('tujuan', 'kecamatan', { city: v })
})
watch(() => baru.province_code, async (v) => {
  baru.city_code = ''; baru.district_code = ''; kecBaru.value = []
  kotaBaru.value = v ? await ambilLokasi('baru', 'kota', { province: v }) : []
})
watch(() => baru.city_code, async (v) => {
  baru.district_code = ''
  kecBaru.value = v ? await ambilLokasi('baru', 'kecamatan', { city: v }) : []
})
// Ubah data paket/tujuan → tarif lama tidak berlaku
watch([() => tujuan.district_code, pengirim, () => ({ ...paket })], () => { tarif.value = null; dipilih.value = null }, { deep: true })

function gantiTujuan(t: 'Store' | 'Teknisi') {
  if (tujuanKirim.value === t || memesan.value) return
  tujuanKirim.value = t
  isiPenerima()
  Object.assign(tujuan, { province_code: '', city_code: '', district_code: '' })
  kotaTujuan.value = []; kecTujuan.value = []
  tebakTujuan(t === 'Teknisi' ? teknisi?.alamat ?? '' : props.order.kota)
}
const baruSiap = computed(() => baru.label.trim() && baru.contact_name.trim() && baru.contact_phone.trim() && baru.district_code && baru.address_line.trim())
async function simpanAlamat() {
  if (memuat.value) return
  memuat.value = true
  try {
    const { data } = await api.post('/pasang-baru/kurir-api/alamat', { ...baru, buka: undefined, is_default: !alamat.value.length })
    alamat.value = await ambil<Alamat[]>('/pasang-baru/kurir-api/alamat')
    pengirim.value = data.data?.id ?? alamat.value[0]?.id ?? ''
    baru.buka = false
  } catch (e) { alertError(e) } finally { memuat.value = false }
}

async function cekOngkir() {
  if (memuat.value) return
  memuat.value = true
  try {
    tarif.value = await ambil(`/pasang-baru/order/${props.order.id_pb}/kurir-api/ongkir`, {
      sender_address_id: pengirim.value, destination_district_code: tujuan.district_code, weight: paket.weight,
      item_value: paket.item_value || undefined, insurance: paket.insurance || undefined, sender_type: paket.sender_type,
    })
    dipilih.value = tarif.value?.rates.find((r) => r.is_cheapest) ?? tarif.value?.rates[0] ?? null
    saldo.value = (await ambil<{ balance: number }>('/pasang-baru/kurir-api/saldo').catch(() => null))?.balance ?? saldo.value
  } catch (e) { alertError(e) } finally { memuat.value = false }
}

const siapPesan = computed(() => !!dipilih.value && penerima.recipient_name.trim().length >= 3 && penerima.recipient_phone.trim() && penerima.recipient_address.trim()
  && penerima.product_name.trim() && (paket.sender_type === 'dropped' || penerima.picked_up_time))
async function pesan() {
  const t = dipilih.value
  if (!t || !tarif.value || memuat.value || memesan.value) return
  // Kunci sejak dialog konfirmasi dibuka: klik ganda tidak boleh memunculkan dua konfirmasi / dua order berbayar
  memesan.value = true
  try {
    if (!(await confirmDialog({
      title: 'Pesan kurir (berbayar)',
      message: `${t.courier_name} ${t.service_name} untuk ${penerima.recipient_name} — total ${fmtRupiah(t.total_price)} akan dipotong dari saldo api.co.id${saldo.value !== null ? ` (saldo ${fmtRupiah(saldo.value)})` : ''}. Order kurir sungguhan langsung dibuat. Lanjutkan?`,
      confirmLabel: 'Ya, pesan kurir',
      variant: 'warning',
    }))) return
    await kirimPesanan(t)
  } finally { memesan.value = false }
}
async function kirimPesanan(t: Tarif) {
  memuat.value = true
  try {
    await api.post(`/pasang-baru/order/${props.order.id_pb}/kurir-api/pesan`, {
      quote_id: tarif.value!.quote_id, courier_code: t.courier_code, service_code: t.service_code, ...penerima,
      quantity: 1, insurance: paket.insurance, tujuan_kirim: tujuanKirim.value,
      picked_up_time: paket.sender_type === 'dropped' ? undefined : new Date(penerima.picked_up_time).toISOString(),
    })
    toast('Order kurir dibuat — resi akan terisi otomatis')
    emit('selesai')
  } catch (e) { alertError(e, 'Gagal memesan kurir') } finally { memuat.value = false }
}
</script>

<template>
  <div class="modal-overlay" @click.self="tutup">
    <div class="modal modal-xl">
      <div class="modal-header">
        <h3 class="modal-title">📦 Pesan kurir via api.co.id</h3>
        <span class="ka-saldo" :class="{ merah: saldo === 0 }">Saldo {{ saldo === null ? '-' : fmtRupiah(saldo) }}</span>
        <button type="button" class="btn-modal-close" aria-label="Tutup" :disabled="memesan" @click="tutup">×</button>
      </div>
      <div class="modal-body">
        <div v-if="saldo === 0" class="alert alert-warning">Saldo api.co.id Rp 0 — top up dulu di dashboard api.co.id. Cek ongkir Rp 5 per cek, ongkir dipotong saat order dibuat.</div>

        <div class="grid-2 ka-grid">
          <!-- Pengirim -->
          <section>
            <h4>1 · Pengirim (gudang)</h4>
            <select v-if="alamat.length" v-model="pengirim" class="form-input">
              <option v-for="a in alamat" :key="a.id" :value="a.id">{{ a.label }} — {{ a.contact_name }}</option>
            </select>
            <button v-if="!baru.buka" class="btn btn-sm btn-ghost" @click="baru.buka = true">+ Alamat pengirim baru</button>
            <div v-if="baru.buka" class="ka-baru">
              <input v-model="baru.label" class="form-input" placeholder="Nama alamat, mis. Gudang HO Surabaya" />
              <div class="grid-2"><input v-model="baru.contact_name" class="form-input" placeholder="Nama kontak" /><input v-model="baru.contact_phone" class="form-input" placeholder="No. HP" /></div>
              <select v-model="baru.province_code" class="form-input"><option value="">Provinsi…</option><option v-for="p in provinsi" :key="p.code" :value="p.code">{{ p.name }}</option></select>
              <div class="grid-2">
                <select v-model="baru.city_code" class="form-input" :disabled="!kotaBaru.length"><option value="">Kota…</option><option v-for="k in kotaBaru" :key="k.code" :value="k.code">{{ k.name }}</option></select>
                <select v-model="baru.district_code" class="form-input" :disabled="!kecBaru.length"><option value="">Kecamatan…</option><option v-for="k in kecBaru" :key="k.code" :value="k.code">{{ k.name }}</option></select>
              </div>
              <small v-if="lok.baru.memuat" class="muted">Memuat daftar wilayah…</small>
              <small v-else-if="lok.baru.error" class="ka-peringatan">⚠ {{ lok.baru.error }}</small>
              <textarea v-model="baru.address_line" rows="2" class="form-textarea" placeholder="Alamat lengkap"></textarea>
              <input v-model="baru.postal_code" class="form-input" placeholder="Kode pos" />
              <div class="ka-aksi">
                <button v-if="alamat.length" class="btn btn-sm btn-ghost" @click="baru.buka = false">Batal</button>
                <button class="btn btn-sm btn-primary" :disabled="!baruSiap || memuat" @click="simpanAlamat">Simpan alamat</button>
              </div>
            </div>
          </section>

          <!-- Tujuan -->
          <section>
            <h4>2 · Tujuan</h4>
            <div class="ka-tujuan">
              <button :class="{ aktif: tujuanKirim === 'Store' }" @click="gantiTujuan('Store')">🏪 Store — {{ order.nama_site }}</button>
              <button :class="{ aktif: tujuanKirim === 'Teknisi' }" :disabled="!teknisi" :title="teknisi ? '' : 'Belum ada teknisi vendor di pemasangan'" @click="gantiTujuan('Teknisi')">👷 Teknisi — {{ teknisi?.nama ?? '-' }}</button>
            </div>
            <p v-if="tujuanKirim === 'Teknisi' && !teknisi?.alamat" class="ka-peringatan">Alamat teknisi belum ada di Master Kontak Teknisi — isi alamat penerima di bawah.</p>
            <select v-model="tujuan.province_code" class="form-input"><option value="">Provinsi…</option><option v-for="p in provinsi" :key="p.code" :value="p.code">{{ p.name }}</option></select>
            <div class="grid-2">
              <select v-model="tujuan.city_code" class="form-input" :disabled="!kotaTujuan.length"><option value="">Kota…</option><option v-for="k in kotaTujuan" :key="k.code" :value="k.code">{{ k.name }}</option></select>
              <select v-model="tujuan.district_code" class="form-input" :disabled="!kecTujuan.length"><option value="">Kecamatan…</option><option v-for="k in kecTujuan" :key="k.code" :value="k.code">{{ k.name }}</option></select>
            </div>
            <small v-if="lok.tujuan.memuat" class="muted">Memuat daftar wilayah…</small>
            <small v-else-if="lok.tujuan.error" class="ka-peringatan">⚠ {{ lok.tujuan.error }}</small>
            <div class="grid-2">
              <label class="form-label">Berat (gram)<input v-model.number="paket.weight" type="number" min="1" class="form-input" /></label>
              <label class="form-label">Nilai barang (Rp)<input v-model.number="paket.item_value" type="number" min="0" class="form-input" /></label>
            </div>
            <div class="ka-opsi">
              <label><input v-model="paket.insurance" type="checkbox" /> Asuransi</label>
              <label><input v-model="paket.sender_type" type="radio" value="picked up" /> Dijemput kurir</label>
              <label><input v-model="paket.sender_type" type="radio" value="dropped" /> Antar sendiri ke gerai</label>
            </div>
            <button class="btn btn-primary" :disabled="memuat || !pengirim || !tujuan.district_code || !(paket.weight > 0)" @click="cekOngkir">🔎 Cek ongkir (Rp 5)</button>
          </section>
        </div>

        <!-- Tarif -->
        <section v-if="tarif" class="ka-tarif">
          <h4>3 · Pilih kurir</h4>
          <p v-if="!tarif.rates.length" class="muted">Tidak ada kurir untuk rute ini.</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th></th><th>Kurir</th><th>Layanan</th><th>Estimasi</th><th class="kanan">Total</th></tr></thead>
              <tbody>
                <tr v-baris v-for="r in tarif.rates" :key="r.courier_code + r.service_code" class="klik" :class="{ pilih: dipilih === r }" @click="!memesan && (dipilih = r)">
                  <td><input type="radio" :checked="dipilih === r" /></td>
                  <td><b>{{ r.courier_name }}</b> <span v-if="r.is_cheapest" class="badge badge-green">termurah</span> <span v-if="r.is_fastest" class="badge badge-blue">tercepat</span></td>
                  <td>{{ r.service_name }}</td>
                  <td>{{ r.etd }}</td>
                  <td class="kanan"><b>{{ fmtRupiah(r.total_price) }}</b><br /><small class="muted">ongkir {{ fmtRupiah(r.price) }} + {{ fmtRupiah(r.handling_fee + r.insurance_fee) }}</small></td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4>4 · Penerima &amp; paket</h4>
          <div class="grid-2">
            <label class="form-label">Nama penerima (3–30)<input v-model="penerima.recipient_name" class="form-input" maxlength="30" /></label>
            <label class="form-label">HP penerima<input v-model="penerima.recipient_phone" class="form-input" maxlength="20" /></label>
          </div>
          <label class="form-label">Alamat penerima<textarea v-model="penerima.recipient_address" rows="2" class="form-textarea" maxlength="500"></textarea></label>
          <div class="grid-2">
            <label class="form-label">Isi paket<input v-model="penerima.product_name" class="form-input" maxlength="100" /></label>
            <label class="form-label">Harga barang (Rp)<input v-model.number="penerima.product_price" type="number" min="1" class="form-input" /></label>
          </div>
          <div class="grid-2">
            <label v-if="paket.sender_type !== 'dropped'" class="form-label">Jadwal jemput (WIB)<input v-model="penerima.picked_up_time" type="datetime-local" class="form-input" /></label>
            <label class="form-label">Catatan kurir<input v-model="penerima.note" class="form-input" maxlength="500" /></label>
          </div>
        </section>
        <p v-if="memuat" class="muted">Memuat…</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" :disabled="memesan" @click="tutup">Tutup</button>
        <button v-if="tarif" type="button" class="btn btn-primary" :class="{ 'is-loading': memesan && memuat }" :disabled="!siapPesan || memuat || memesan" @click="pesan">
          <template v-if="memesan && memuat">Memesan…</template>
          <template v-else>Pesan {{ dipilih ? `${dipilih.courier_name} · ${fmtRupiah(dipilih.total_price)}` : 'kurir' }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ka-saldo { margin-left: auto; margin-right: 12px; font-size: 13px; font-weight: 600; color: #15803d; }
.ka-saldo.merah { color: #dc2626; }
.ka-grid { gap: 16px; }
.ka-tujuan { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.ka-tujuan button { flex: 1 1 160px; border: 1.5px solid var(--border, #e2e8f0); background: var(--surface, #fff); border-radius: 8px; padding: 7px 10px; cursor: pointer; text-align: left; font-size: 13px; color: inherit; }
.ka-tujuan button.aktif { border-color: #2563eb; background: rgba(37, 99, 235, .06); font-weight: 600; }
.ka-tujuan button:disabled { opacity: .5; cursor: default; }
.ka-peringatan { font-size: 12.5px; color: #b45309; margin: 0 0 8px; }
section h4 { margin: 4px 0 8px; font-size: 14px; }
section > .form-input, section > select, section > .grid-2, section > .btn { margin-bottom: 8px; }
.ka-baru { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px dashed #93c5fd; border-radius: 8px; }
.ka-baru .grid-2 { gap: 6px; }
.ka-aksi { display: flex; justify-content: flex-end; gap: 6px; }
.ka-opsi { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; margin-bottom: 10px; }
.ka-opsi label { display: flex; gap: 4px; align-items: center; }
.ka-tarif { margin-top: 14px; }
.ka-tarif .table-wrap { max-height: 260px; overflow: auto; margin-bottom: 12px; }
tr.pilih td { background: rgba(37, 99, 235, .07); }
.form-label .form-input, .form-label .form-textarea { margin-top: 3px; font-weight: 400; }
.klik { cursor: pointer; }
.kanan { text-align: right; }
.muted { color: var(--text-3); }
.merah { color: #dc2626; }
</style>
