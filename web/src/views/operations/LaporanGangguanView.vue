<script setup lang="ts">
// Laporan gangguan gabungan: tiket PRTG + NOCaaS (per kategori) + sumber lain, kondisi NOCaaS, ISP & site paling sering putus
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { fmtDateTime } from '@/composables/useFormat'
import StatBatang from '@/views/wa/StatBatang.vue'

const router = useRouter()
const BIRU = '#2a78d6', ORANYE = '#eb6834', ABU = '#94a3b8'
const tglLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const geser = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return tglLokal(d) }
const filter = reactive({ preset: '30', dari: geser(-29), sampai: geser(0) })
function pilih(p: string) {
  filter.preset = p
  if (p === 'bulan') { const d = new Date(); filter.dari = tglLokal(new Date(d.getFullYear(), d.getMonth(), 1)); filter.sampai = geser(0) }
  else if (p !== 'custom') { filter.dari = geser(-(Number(p) - 1)); filter.sampai = geser(0) }
}

const d = ref<any>(null)
const memuat = ref(false)
const galat = ref('')
const rentangSalah = computed(() => !!filter.dari && !!filter.sampai && filter.dari > filter.sampai)
async function muat() {
  galat.value = ''
  // Rentang tidak valid: jangan kirim permintaan
  if (!filter.dari || !filter.sampai || rentangSalah.value) { d.value = null; return }
  memuat.value = true
  try { d.value = (await api.get('/nocaas/laporan', { params: { dari: filter.dari, sampai: filter.sampai } })).data.data } catch (e: any) {
    const m = e?.response?.data?.message
    galat.value = (Array.isArray(m) ? m.join(', ') : m) || 'Gagal memuat laporan gangguan'
    d.value = null
  } finally { memuat.value = false }
}
onMounted(muat)
watch(() => [filter.dari, filter.sampai], muat)

const angka = (n: number | null | undefined) => (n ?? 0).toLocaleString('id-ID')
function durasi(m: number | null | undefined) {
  if (m == null) return '–'
  if (m < 60) return `${m} mnt`
  if (m < 48 * 60) return `${Math.floor(m / 60)} j ${m % 60} m`
  return `${Math.floor(m / 1440)} hari ${Math.floor((m % 1440) / 60)} j`
}
const labelHari = (l: string) => l.slice(8, 10) + '/' + l.slice(5, 7)
const maksKat = computed(() => Math.max(1, ...(d.value?.per_kategori ?? []).map((x: any) => x.n)))
const maksIsp = computed(() => Math.max(1, ...(d.value?.isp ?? []).map((x: any) => x.downs_per_site ?? 0)))

// Tabel tiket + unduh CSV
const cari = ref('')
const filterSumber = ref('')
const tiket = computed(() => ((d.value?.tiket ?? []) as any[]).filter((t) =>
  (!filterSumber.value || t.sumber === filterSumber.value) &&
  (!cari.value || `${t.nomor_tiket} ${t.site} ${t.kode_site} ${t.pelanggan} ${t.kategori}`.toLowerCase().includes(cari.value.toLowerCase()))))
function unduhCsv() {
  const kolom = ['nomor_tiket', 'sumber', 'kategori', 'prioritas', 'status', 'tgl_open', 'tgl_resolved', 'durasi_menit', 'lewat_sla', 'kode_site', 'site', 'kota', 'pelanggan', 'judul_tiket']
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const isi = [kolom.join(','), ...tiket.value.map((t) => kolom.map((k) => esc(k.startsWith('tgl_') && t[k] ? fmtDateTime(t[k]) : t[k])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' }))
  a.download = `laporan-gangguan-${filter.dari}-sd-${filter.sampai}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">📑 Laporan Gangguan</h2>
        <p class="page-subtitle">Semua tiket gangguan (PRTG, NOCaaS per kategori, WhatsApp, manual) + kondisi jaringan dari NOCaaS</p>
      </div>
      <div class="lg-tombol">
        <button class="btn btn-ghost" @click="router.push('/nocaas')">🛰️ Pembanding NOCaaS</button>
        <button class="btn btn-primary" :disabled="!d" @click="unduhCsv">⬇ Unduh CSV</button>
      </div>
    </div>

    <div class="lg-filter">
      <div class="lg-seg">
        <button v-for="p in [['7', '7 hari'], ['30', '30 hari'], ['bulan', 'Bulan ini'], ['90', '90 hari']]" :key="p[0]" :class="{ on: filter.preset === p[0] }" @click="pilih(p[0]!)">{{ p[1] }}</button>
      </div>
      <input v-model="filter.dari" type="date" class="form-input lg-tgl" :max="filter.sampai || undefined" aria-label="Dari tanggal" @change="filter.preset = 'custom'" /> –
      <input v-model="filter.sampai" type="date" class="form-input lg-tgl" :min="filter.dari || undefined" aria-label="Sampai tanggal" @change="filter.preset = 'custom'" />
      <span v-if="memuat" class="muted">Memuat…</span>
    </div>

    <p v-if="rentangSalah" class="form-error" role="alert">Tanggal "dari" tidak boleh setelah tanggal "sampai".</p>
    <div v-else-if="galat" class="alert alert-danger lg-galat" role="alert">
      <span>⚠ {{ galat }}</span>
      <button class="btn btn-ghost btn-sm" :disabled="memuat" @click="muat">Coba lagi</button>
    </div>
    <p v-else-if="memuat && !d" class="muted">Memuat…</p>

    <template v-if="d">
      <div class="lg-kpi">
        <div class="stat-tile"><span class="stat-tile-label">Tiket gangguan</span><span class="stat-tile-value">{{ angka(d.kpi.total) }}</span><span class="stat-tile-sub">{{ angka(d.kpi.site) }} site · {{ angka(d.kpi.aktif) }} masih aktif</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Waktu pulih (median)</span><span class="stat-tile-value">{{ durasi(d.kpi.mttr_menit) }}</span><span class="stat-tile-sub">dari mulai gangguan → selesai, {{ angka(d.kpi.selesai) }} tiket</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Total downtime</span><span class="stat-tile-value">{{ durasi(d.kpi.downtime_menit) }}</span><span class="stat-tile-sub">jumlah durasi semua tiket</span></div>
        <div class="stat-tile" :class="{ 'lg-alarm': d.kpi.lewat_sla > 0 }"><span class="stat-tile-label">Lewat SLA</span><span class="stat-tile-value">{{ angka(d.kpi.lewat_sla) }}</span><span class="stat-tile-sub">{{ d.kpi.total ? Math.round((d.kpi.lewat_sla / d.kpi.total) * 100) : 0 }}% dari tiket</span></div>
        <div v-for="s in d.per_sumber" :key="s.nama" class="stat-tile"><span class="stat-tile-label">Sumber {{ s.nama }}</span><span class="stat-tile-value">{{ angka(s.n) }}</span><span class="stat-tile-sub">{{ d.kpi.total ? Math.round((s.n / d.kpi.total) * 100) : 0 }}% tiket</span></div>
      </div>

      <div class="card lg-kartu">
        <h3>Tiket per hari</h3>
        <StatBatang :label="d.harian.label" :label-sumbu="labelHari" :seri="[{ nama: 'NOCaaS', warna: BIRU, nilai: d.harian.nocaas }, { nama: 'PRTG', warna: ORANYE, nilai: d.harian.prtg }, { nama: 'Lainnya', warna: ABU, nilai: d.harian.lain }]" />
      </div>

      <div class="lg-dua">
        <div class="card lg-kartu">
          <h3>Per jenis gangguan</h3>
          <p v-if="!d.per_kategori.length" class="muted">Belum ada tiket pada periode ini.</p>
          <div v-for="k in d.per_kategori" :key="k.nama" class="lg-bar">
            <span class="lg-bar-nama">{{ k.nama }}</span>
            <span class="lg-bar-isi"><i :style="{ width: (k.n / maksKat) * 100 + '%' }" /></span>
            <b>{{ angka(k.n) }}</b>
          </div>
        </div>
        <div class="card lg-kartu">
          <h3>Kondisi NOCaaS (termasuk yang tidak jadi tiket)</h3>
          <table class="data-table">
            <thead><tr><th>Kategori</th><th>Kejadian</th><th>Jadi tiket</th><th>Masih berjalan</th></tr></thead>
            <tbody><tr v-for="k in d.kondisi_nocaas" :key="k.kategori"><td>{{ k.label }}</td><td>{{ angka(k.n) }}</td><td>{{ angka(k.jadi_tiket) }}</td><td>{{ angka(k.berjalan) }}</td></tr></tbody>
          </table>
          <p class="muted kecil">Mati total &amp; VPN macet langsung menjadi tiket (lihat "Per jenis gangguan").</p>
        </div>
      </div>

      <div class="lg-dua">
        <div class="card lg-kartu">
          <h3>Site paling sering gangguan</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Site</th><th>Tiket</th><th>Downtime</th><th>Jenis</th></tr></thead>
              <tbody>
                <tr v-if="!d.top_site.length"><td colspan="4" class="muted">–</td></tr>
                <tr v-for="s in d.top_site" :key="s.id_site">
                  <td><RouterLink :to="`/master/site/${s.id_site}`">{{ s.nama }}</RouterLink><div class="muted">{{ s.kode }} · {{ s.pelanggan }}</div></td>
                  <td>{{ s.n }}</td><td class="nowrap">{{ durasi(s.downtime) }}</td><td class="muted">{{ s.kategori }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card lg-kartu">
          <h3>Per pelanggan</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Pelanggan</th><th>Tiket</th><th>Site</th><th>Downtime</th></tr></thead>
              <tbody>
                <tr v-if="!d.per_pelanggan.length"><td colspan="4" class="muted">–</td></tr>
                <tr v-for="p in d.per_pelanggan" :key="p.nama"><td>{{ p.nama }}</td><td>{{ p.n }}</td><td>{{ p.site }}</td><td class="nowrap">{{ durasi(p.downtime) }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="lg-dua">
        <div class="card lg-kartu">
          <h3>Stabilitas ISP akses <small class="muted">({{ d.isp_hari }} hari terakhir, data NOCaaS)</small></h3>
          <p v-if="!d.isp.length" class="muted">Data ISP dari NOCaaS tidak tersedia.</p>
          <div v-for="i in d.isp" :key="i.isp" class="lg-bar" :title="`${i.sites} site · ${i.sites_down} pernah putus · ${i.downs} putus`">
            <span class="lg-bar-nama">{{ i.isp }} <small class="muted">({{ i.sites }} site)</small></span>
            <span class="lg-bar-isi"><i :style="{ width: ((i.downs_per_site ?? 0) / maksIsp) * 100 + '%', background: ORANYE }" /></span>
            <b>{{ i.downs_per_site }}</b>
          </div>
          <p class="muted kecil">Angka = rata-rata putus per site. Makin besar makin tidak stabil.</p>
        </div>
        <div class="card lg-kartu">
          <h3>Paling sering putus VPN <small class="muted">(NOCaaS)</small></h3>
          <table class="data-table">
            <thead><tr><th>Router</th><th>Putus</th><th>Terakhir</th></tr></thead>
            <tbody><tr v-for="s in d.sering_putus" :key="s.site_key"><td class="mono">{{ s.site_key }}</td><td>{{ angka(s.downs) }}</td><td class="nowrap">{{ fmtDateTime(s.last_at) }}</td></tr></tbody>
          </table>
          <h4 class="lg-sub">Alasan putus</h4>
          <p class="muted"><template v-for="(r, i) in d.alasan_putus" :key="r.reason">{{ i ? ' · ' : '' }}{{ r.reason }} <b>{{ angka(r.count) }}</b></template></p>
        </div>
      </div>

      <div class="card lg-kartu">
        <div class="lg-tabel-atas">
          <h3>Daftar tiket ({{ angka(tiket.length) }})</h3>
          <select v-model="filterSumber" class="form-select"><option value="">Semua sumber</option><option v-for="s in d.per_sumber" :key="s.nama" :value="s.nama">{{ s.nama }}</option></select>
          <input v-model="cari" class="form-input" placeholder="Cari tiket / site / pelanggan / jenis…" />
        </div>
        <div class="table-wrap lg-scroll">
          <table class="data-table">
            <thead><tr><th>Tiket</th><th>Site</th><th>Sumber · jenis</th><th>Dibuka</th><th>Durasi</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-baris v-for="t in tiket.slice(0, 300)" :key="t.id_ticket" class="lg-baris" @click="router.push(`/operations/${t.id_ticket}`)">
                <td><b class="mono">{{ t.nomor_tiket }}</b><div class="muted">{{ t.prioritas }}</div></td>
                <td>{{ t.site }}<div class="muted">{{ t.kode_site }} · {{ t.pelanggan }}</div></td>
                <td>{{ t.sumber }}<div class="muted">{{ t.kategori }}</div></td>
                <td class="nowrap">{{ fmtDateTime(t.tgl_open) }}</td>
                <td class="nowrap">{{ durasi(t.durasi_menit) }}<div v-if="t.lewat_sla" class="lg-merah">lewat SLA</div></td>
                <td>{{ t.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="tiket.length > 300" class="muted kecil">Menampilkan 300 dari {{ angka(tiket.length) }} — unduh CSV untuk semua.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lg-galat { align-items: center; justify-content: space-between; margin-bottom: 12px; }
.lg-tombol { display: flex; gap: 8px; flex-wrap: wrap; }
.lg-filter { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
.lg-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.lg-seg button { border: 0; background: none; padding: 6px 11px; font-size: 13px; cursor: pointer; color: var(--text-2); border-right: 1px solid var(--border); }
.lg-seg button:last-child { border-right: 0; }
.lg-seg button.on { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
.lg-tgl { width: auto; padding: 5px 8px; }
.lg-kpi { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.lg-alarm .stat-tile-value { color: #d03b3b; }
.lg-kartu { padding: 16px; margin-bottom: 16px; }
.lg-kartu h3 { margin: 0 0 12px; font-size: 15px; }
.lg-sub { margin: 14px 0 6px; font-size: 13px; }
.lg-dua { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; }
.lg-dua .lg-kartu { margin-bottom: 16px; min-width: 0; }
.lg-bar { display: grid; grid-template-columns: minmax(140px, 38%) 1fr auto; gap: 10px; align-items: center; font-size: 13px; padding: 4px 0; }
.lg-bar-nama { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-bar-isi { height: 10px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
.lg-bar-isi i { display: block; height: 100%; background: #2a78d6; border-radius: 999px; }
.lg-tabel-atas { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.lg-tabel-atas h3 { margin: 0; flex: 1; }
.lg-tabel-atas .form-input, .lg-tabel-atas .form-select { width: auto; min-width: 200px; }
.lg-scroll { max-height: 560px; overflow: auto; }
.lg-baris { cursor: pointer; }
.lg-merah { color: #d03b3b; font-size: 11.5px; font-weight: 600; }
.mono { font-family: monospace; }
.nowrap { white-space: nowrap; }
.muted { color: #64748b; font-size: 12px; }
.kecil { font-size: 11.5px; margin-top: 8px; }
@media (max-width: 900px) { .lg-dua { grid-template-columns: 1fr; } }
</style>
