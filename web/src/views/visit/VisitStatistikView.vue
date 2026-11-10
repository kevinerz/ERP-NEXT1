<script setup lang="ts">
// KPI teknisi & peta kunjungan (Jadwal Visit tahap 3)
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/services/api'
import StatBatang from '@/views/wa/StatBatang.vue'

// Palet kategorikal yang sama dengan Statistik Helpdesk: selesai = biru, gagal = oranye
const BIRU = '#2a78d6'
const ORANYE = '#eb6834'

const router = useRouter()
const tglLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const geser = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return tglLokal(d) }
const filter = reactive({ preset: '30', dari: geser(-29), sampai: geser(0) })
function pilihPreset(p: string) {
  filter.preset = p
  if (p === 'bulan') { const d = new Date(); filter.dari = tglLokal(new Date(d.getFullYear(), d.getMonth(), 1)); filter.sampai = geser(0) }
  else if (p !== 'custom') { filter.dari = geser(-(Number(p) - 1)); filter.sampai = geser(0) }
}

const d = ref<any>(null)
const pt = ref<any>(null)
const memuat = ref(false)
const galat = ref('')
async function muat() {
  memuat.value = true
  galat.value = ''
  try {
    const params = { dari: filter.dari, sampai: filter.sampai }
    const [a, b] = await Promise.all([api.get('/visit/statistik', { params }), api.get('/visit/peta', { params })])
    d.value = a.data.data
    pt.value = b.data.data
    await nextTick()
    gambarPeta()
  } catch (e: any) {
    const m = e?.response?.data?.message
    galat.value = (Array.isArray(m) ? m.join(', ') : m) || 'Gagal memuat statistik visit'
  } finally { memuat.value = false }
}
watch(() => [filter.dari, filter.sampai], muat)
onMounted(muat)

const k = computed(() => d.value?.kpi ?? {})
const angka = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString('id-ID'))
function menit(m: number | null | undefined) {
  if (m == null) return '–'
  if (m < 60) return `${m} mnt`
  const j = Math.floor(m / 60), s = m % 60
  return j < 24 ? `${j} j${s ? ` ${s} m` : ''}` : `${Math.floor(j / 24)} h ${j % 24} j`
}
const labelHari = (l: string) => { const [, b, t] = l.split('-'); return `${+t!}/${+b!}` }
const pctGagal = computed(() => {
  const s = k.value.selesai ?? 0, g = k.value.gagal ?? 0
  return s + g ? Math.round((g / (s + g)) * 100) : null
})

// ── Peta ────────────────────────────────────────────────────────────────────
const elPeta = ref<HTMLDivElement | null>(null)
const tampilStore = ref(true)
let peta: L.Map | null = null
let lapisKunjungan: L.LayerGroup | null = null
let lapisStore: L.LayerGroup | null = null
function esc(s: string | null | undefined) { return (s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) }
function gambarPeta() {
  if (!elPeta.value || !pt.value) return
  if (!peta) {
    peta = L.map(elPeta.value, { scrollWheelZoom: false }).setView([-2.5, 118], 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(peta)
    lapisStore = L.layerGroup().addTo(peta)
    lapisKunjungan = L.layerGroup().addTo(peta)
  }
  lapisStore!.clearLayers(); lapisKunjungan!.clearLayers()
  for (const s of pt.value.store) {
    L.circleMarker([s.lat, s.lng], { radius: 4, color: '#64748b', weight: 1, fillColor: '#94a3b8', fillOpacity: 0.6 })
      .bindPopup(`<b>${esc(s.nama)}</b><br>${esc(s.kode)} · ${esc(s.pelanggan)}`).addTo(lapisStore!)
  }
  for (const v of pt.value.kunjungan) {
    const selesai = v.status === 'Completed'
    L.circleMarker([v.lat, v.lng], { radius: 7, color: '#fff', weight: 2, fillColor: selesai ? BIRU : ORANYE, fillOpacity: 0.95 })
      .bindPopup(`<b>${esc(v.site)}</b> (${esc(v.kode)})<br>${esc(v.jenis)} · ${esc(v.teknisi)}<br>${new Date(v.waktu).toLocaleString('id-ID')}<br>${selesai ? '✅ Selesai' : '⏳ Belum selesai'} · <a href="/jadwal-visit?wo=${v.id_wo}">${esc(v.nomor_wo)}</a>`)
      .addTo(lapisKunjungan!)
  }
  const titik = [...pt.value.kunjungan, ...(tampilStore.value ? pt.value.store : [])].map((x: any) => [x.lat, x.lng] as [number, number])
  if (titik.length) peta.fitBounds(L.latLngBounds(titik), { padding: [30, 30], maxZoom: 14 })
  setTimeout(() => peta?.invalidateSize(), 50)
}
watch(tampilStore, (v) => { if (!peta || !lapisStore) return; v ? lapisStore.addTo(peta) : lapisStore.remove() })
onBeforeUnmount(() => { peta?.remove(); peta = null })
</script>

<template>
  <div class="page vs">
    <div class="page-header">
      <div>
        <h2 class="page-title">📊 Statistik & Peta Visit</h2>
        <p class="page-subtitle">Kinerja teknisi lapangan dari laporan check-in, selesai, dan gagal</p>
      </div>
      <div class="st-tombol">
        <button class="btn btn-ghost" @click="router.push('/jadwal-visit')">← Jadwal Visit</button>
        <button class="btn btn-ghost" @click="router.push('/jadwal-visit/maintenance')">🔁 Maintenance rutin</button>
        <button class="btn btn-ghost" :disabled="memuat" aria-label="Muat ulang" title="Muat ulang" @click="muat">↻</button>
      </div>
    </div>

    <div class="st-filter">
      <div class="st-seg">
        <button v-for="p in [['7', '7 hari'], ['30', '30 hari'], ['90', '90 hari'], ['bulan', 'Bulan ini'], ['custom', 'Pilih tanggal']]" :key="p[0]"
          :class="{ on: filter.preset === p[0] }" @click="pilihPreset(p[0]!)">{{ p[1] }}</button>
      </div>
      <template v-if="filter.preset === 'custom'">
        <input v-model="filter.dari" type="date" class="form-input st-tgl" /> – <input v-model="filter.sampai" type="date" class="form-input st-tgl" />
      </template>
    </div>

    <div v-if="galat" class="alert alert-danger st-galat" role="alert">
      <span>⚠ {{ galat }}<template v-if="d"> — menampilkan data sebelumnya.</template></span>
      <button class="btn btn-ghost btn-sm" :disabled="memuat" @click="muat">Coba lagi</button>
    </div>
    <p v-if="!d && memuat" class="muted">Memuat…</p>
    <template v-else-if="d">
      <div class="st-kpi">
        <div class="stat-tile"><span class="stat-tile-label">Visit selesai</span><span class="stat-tile-value">{{ angka(k.selesai) }}</span><span class="stat-tile-sub">{{ angka(k.checkin) }} check-in di lokasi</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Gagal / dijadwal ulang</span><span class="stat-tile-value">{{ angka(k.gagal) }}</span><span class="stat-tile-sub">{{ pctGagal == null ? '–' : pctGagal + '%' }} dari kunjungan · {{ angka(k.batal) }} batal</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Selesai tepat jadwal</span><span class="stat-tile-value">{{ k.pct_tepat == null ? '–' : k.pct_tepat + '%' }}</span><span class="stat-tile-sub">selesai di tanggal yang dijadwalkan</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Lama di lokasi</span><span class="stat-tile-value">{{ menit(k.durasi_median) }}</span><span class="stat-tile-sub">median check-in → selesai</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Tiket → teknisi tiba</span><span class="stat-tile-value">{{ menit(k.tiba_median) }}</span><span class="stat-tile-sub">median dari {{ angka(k.tiba_n) }} visit gangguan</span></div>
        <div class="stat-tile" :class="{ 'st-alarm': k.ulang > 0 }"><span class="stat-tile-label">Kunjungan ulang ≤30 hari</span><span class="stat-tile-value">{{ angka(k.ulang) }}</span><span class="stat-tile-sub">store perlu didatangi lagi</span></div>
        <div class="stat-tile" :class="{ 'st-alarm': k.terlewat > 0 }"><span class="stat-tile-label">Antrean sekarang</span><span class="stat-tile-value">{{ angka(k.antrean) }}</span><span class="stat-tile-sub">{{ angka(k.terlewat) }} terlewat · {{ angka(k.terjadwal) }} terjadwal</span></div>
      </div>

      <div class="card st-kartu">
        <h3>Kunjungan per hari</h3>
        <StatBatang
          :label="d.harian.label" :label-sumbu="labelHari"
          :seri="[{ nama: 'Selesai', warna: BIRU, nilai: d.harian.selesai }, { nama: 'Gagal', warna: ORANYE, nilai: d.harian.gagal }]"
        />
      </div>

      <div class="card st-kartu">
        <h3>Kinerja per teknisi</h3>
        <p v-if="!d.teknisi.length" class="muted">Belum ada laporan lapangan pada periode ini.</p>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Teknisi</th><th class="kanan">Selesai</th><th class="kanan">Gagal</th><th class="kanan">Tepat jadwal</th>
                <th class="kanan">Lama di lokasi</th><th class="kanan">Tiket → tiba</th><th class="kanan">Kunjungan ulang</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in d.teknisi" :key="t.id_karyawan">
                <td><b>{{ t.nama }}</b></td>
                <td class="kanan">{{ angka(t.selesai) }}</td>
                <td class="kanan">{{ angka(t.gagal) }}</td>
                <td class="kanan">{{ t.pct_tepat == null ? '–' : t.pct_tepat + '%' }}</td>
                <td class="kanan">{{ menit(t.durasi_median) }}</td>
                <td class="kanan">{{ menit(t.tiba_median) }}</td>
                <td class="kanan">{{ angka(t.ulang) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="st-cat">Lama di lokasi & tiket → tiba memakai median (tidak terpengaruh satu-dua kasus ekstrem). Kunjungan ulang = store yang sama butuh visit perbaikan lagi ≤30 hari setelah visit selesai.</p>
      </div>

      <div class="card st-kartu">
        <h3>
          Peta kunjungan
          <span class="muted vs-legenda"><i :style="{ background: BIRU }" /> selesai <i :style="{ background: ORANYE }" /> belum selesai <i class="abu" /> store</span>
          <label class="st-cek vs-kanan"><input v-model="tampilStore" type="checkbox" /> tampilkan store</label>
        </h3>
        <div ref="elPeta" class="vs-peta" />
        <p class="st-cat">
          {{ angka(pt?.kunjungan.length) }} titik check-in pada periode ini · {{ angka(pt?.store.length) }} store sudah punya titik GPS,
          {{ angka(pt?.store_tanpa_titik) }} belum. Titik store terisi otomatis dari check-in pertama teknisi di store tersebut.
        </p>
      </div>

      <div class="st-grid3">
        <div class="card st-kartu">
          <h3>Jenis pekerjaan selesai</h3>
          <p v-if="!d.jenis.length" class="muted">–</p>
          <div v-for="j in d.jenis" :key="j.nama" class="vs-baris"><span>{{ j.nama }}</span><b>{{ angka(j.n) }}</b></div>
        </div>
        <div class="card st-kartu">
          <h3>Alasan gagal</h3>
          <p v-if="!d.alasan_gagal.length" class="muted">Tidak ada visit gagal. 👍</p>
          <div v-for="a in d.alasan_gagal" :key="a.alasan" class="vs-baris"><span>{{ a.alasan }}</span><b>{{ angka(a.n) }}</b></div>
        </div>
        <div class="card st-kartu">
          <h3>Store paling sering dikunjungi</h3>
          <p v-if="!d.top_site.length" class="muted">–</p>
          <div v-for="s in d.top_site" :key="s.kode" class="vs-baris"><span>{{ s.nama }} <small class="muted">{{ s.kode }}</small></span><b>{{ angka(s.n) }}</b></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.st-galat { align-items: center; justify-content: space-between; margin-bottom: 12px; }
.st-tombol { display: flex; gap: 6px; flex-wrap: wrap; }
.st-filter { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
.st-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.st-seg button { border: 0; background: none; padding: 6px 11px; font-size: 13px; cursor: pointer; color: var(--text-2); border-right: 1px solid var(--border); }
.st-seg button:last-child { border-right: 0; }
.st-seg button.on { background: var(--primary-light, #eff6ff); color: var(--primary, #1d4ed8); font-weight: 600; }
.st-tgl { width: auto; padding: 5px 8px; }
.st-cek { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--text-2); cursor: pointer; font-weight: 400; }
.st-kpi { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.st-alarm .stat-tile-value { color: #d03b3b; }
.st-kartu { padding: 16px; margin-bottom: 16px; min-width: 0; }
.st-kartu h3 { margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--text-1); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-cat { margin: 10px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5; }
.st-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.st-grid3 .st-kartu { margin-bottom: 0; }
.kanan { text-align: right; font-variant-numeric: tabular-nums; }
.vs-peta { height: 440px; border-radius: 10px; border: 1px solid var(--border); z-index: 0; }
.vs-legenda { font-size: 12px; font-weight: 400; display: inline-flex; align-items: center; gap: 4px; }
.vs-legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-left: 8px; }
.vs-legenda i.abu { background: #94a3b8; }
.vs-kanan { margin-left: auto; }
.vs-baris { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-light, #f1f5f9); font-size: 13px; }
.vs-baris b { font-variant-numeric: tabular-nums; }
@media (max-width: 900px) { .st-grid3 { grid-template-columns: 1fr; } .vs-peta { height: 340px; } }
</style>
