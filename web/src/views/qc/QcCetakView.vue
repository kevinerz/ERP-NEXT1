<script setup lang="ts">
// Laporan QC ERP siap cetak / simpan PDF (Ctrl+P → Simpan sebagai PDF). Filter dari halaman /qc lewat query.
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { type QcModul, WARNA_STATUS, WARNA_PRIORITAS, IKON_JENIS } from './qc'

const route = useRoute()
const q = (k: string) => String(route.query[k] ?? '')
const modul = ref<QcModul[]>([])
const siap = ref(false)
const terbuka = (s: string) => s === 'Baru' || s === 'Dikerjakan'

onMounted(async () => {
  const { data } = await api.get('/qc/modul')
  const cari = q('cari').toLowerCase()
  modul.value = (data.data as QcModul[]).map((m) => ({
    ...m,
    catatan: m.catatan.filter((c) => (!q('jenis') || c.jenis === q('jenis')) && (!q('prioritas') || c.prioritas === q('prioritas')) && (!q('terbuka') || terbuka(c.status))),
  })).filter((m) => (!q('grup') || m.grup === q('grup')) && (!q('status') || m.status === q('status'))
    && (!(q('jenis') || q('prioritas') || q('terbuka')) || m.catatan.length)
    && (!cari || [m.nama, m.grup, m.path, m.deskripsi, m.pic, ...m.catatan.map((c) => `${c.judul} ${c.isi ?? ''}`)].join(' ').toLowerCase().includes(cari)))
  siap.value = true
  await nextTick()
  // ?pratinjau=1 → tampilkan saja tanpa langsung membuka dialog cetak
  if (q('pratinjau') !== '1') setTimeout(() => window.print(), 400)
})

const ringkas = computed(() => {
  const semua = modul.value.flatMap((m) => m.catatan)
  const buka = semua.filter((c) => terbuka(c.status))
  return {
    status: Object.keys(WARNA_STATUS).map((s) => ({ s, n: modul.value.filter((m) => m.status === s).length })),
    buka: buka.length, total: semua.length,
    prioritas: Object.keys(WARNA_PRIORITAS).map((p) => ({ p, n: buka.filter((c) => c.prioritas === p).length })),
  }
})
const perGrup = computed(() => {
  const g = new Map<string, QcModul[]>()
  for (const m of modul.value) g.set(m.grup, [...(g.get(m.grup) ?? []), m])
  return [...g.entries()]
})
const filterTeks = computed(() => ['grup', 'status', 'jenis', 'prioritas', 'cari'].filter((k) => q(k)).map((k) => `${k}: ${q(k)}`).concat(q('terbuka') ? ['hanya catatan terbuka'] : []).join(' · '))
const cetak = () => window.print()
const hariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const tgl = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="ct">
    <div class="ct-alat">
      <button class="btn btn-primary" @click="cetak">🖨 Cetak / Simpan PDF</button>
      <span>Pilih tujuan <b>"Simpan sebagai PDF"</b> di jendela cetak.</span>
    </div>
    <p v-if="!siap">Memuat…</p>
    <template v-else>
      <header class="ct-kepala">
        <div>
          <h1>Laporan QC &amp; Evaluasi ERP NEXT1</h1>
          <p>PT. Perdana Global Internet · {{ hariIni }}<template v-if="filterTeks"> · Filter: {{ filterTeks }}</template></p>
        </div>
      </header>

      <section class="ct-ringkas">
        <div><b>{{ modul.length }}</b><span>modul</span></div>
        <div v-for="x in ringkas.status" :key="x.s"><b :style="{ color: WARNA_STATUS[x.s] }">{{ x.n }}</b><span>{{ x.s }}</span></div>
        <div><b>{{ ringkas.buka }}</b><span>catatan terbuka (dari {{ ringkas.total }})</span></div>
        <div v-for="x in ringkas.prioritas" :key="x.p"><b :style="{ color: WARNA_PRIORITAS[x.p] }">{{ x.n }}</b><span>terbuka {{ x.p }}</span></div>
      </section>

      <h2 class="ct-sub">Ringkasan modul</h2>
      <table class="ct-tabel">
        <thead><tr><th>No</th><th>Grup</th><th>Modul</th><th>Kondisi</th><th>Skor</th><th>PIC</th><th>Terbuka</th></tr></thead>
        <tbody>
          <tr v-for="(m, i) in modul" :key="m.id">
            <td>{{ i + 1 }}</td><td>{{ m.grup }}</td><td><b>{{ m.nama }}</b><small v-if="m.path" class="ct-path">{{ m.path }}</small></td>
            <td :style="{ color: WARNA_STATUS[m.status], fontWeight: 700 }">{{ m.status }}</td>
            <td>{{ m.skor ? '★'.repeat(m.skor) : '–' }}</td><td>{{ m.pic || '–' }}</td>
            <td>{{ m.catatan.filter((c) => terbuka(c.status)).length }}</td>
          </tr>
        </tbody>
      </table>

      <h2 class="ct-sub ct-baru">Detail per modul</h2>
      <section v-for="[grup, ms] in perGrup" :key="grup">
        <h3 class="ct-grup">{{ grup }}</h3>
        <article v-for="m in ms" :key="m.id" class="ct-modul" :style="{ borderLeftColor: WARNA_STATUS[m.status] }">
          <div class="ct-modul-atas">
            <b>{{ m.nama }}</b>
            <span :style="{ color: WARNA_STATUS[m.status] }">{{ m.status }}{{ m.skor ? ` · ${'★'.repeat(m.skor)}` : '' }}</span>
          </div>
          <p class="ct-desk">{{ m.deskripsi || '—' }}<template v-if="m.pic"> · PIC: {{ m.pic }}</template></p>
          <table v-if="m.catatan.length" class="ct-tabel ct-cat">
            <thead><tr><th style="width:90px">Jenis</th><th style="width:62px">Prioritas</th><th>Catatan</th><th style="width:78px">Status</th></tr></thead>
            <tbody>
              <tr v-for="c in m.catatan" :key="c.id">
                <td>{{ IKON_JENIS[c.jenis] }} {{ c.jenis }}</td>
                <td :style="{ color: WARNA_PRIORITAS[c.prioritas], fontWeight: 700 }">{{ c.prioritas }}</td>
                <td><b>{{ c.judul }}</b><div v-if="c.isi" class="ct-isi">{{ c.isi }}</div><small>{{ c.pembuat }} · {{ tgl(c.created_at) }}</small></td>
                <td>{{ c.status }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="ct-kosong">Tidak ada catatan.</p>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ct { max-width: 1000px; margin: 0 auto; padding: 24px; background: #fff; color: #0f172a; font-size: 12.5px; }
.ct-alat { display: flex; gap: 12px; align-items: center; padding: 10px 12px; margin-bottom: 18px; background: #f1f5f9; border-radius: 8px; font-size: 13px; }
.ct-kepala { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
.ct-kepala h1 { margin: 0; font-size: 20px; }
.ct-kepala p { margin: 2px 0 0; color: #475569; }
.ct-ringkas { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.ct-ringkas div { flex: 1 1 110px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; }
.ct-ringkas b { display: block; font-size: 18px; }
.ct-ringkas span { color: #475569; font-size: 11px; }
.ct-sub { font-size: 15px; margin: 14px 0 6px; }
.ct-grup { font-size: 14px; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #cbd5e1; }
.ct-tabel { width: 100%; border-collapse: collapse; }
.ct-tabel th, .ct-tabel td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; vertical-align: top; }
.ct-tabel th { background: #f1f5f9; font-size: 11px; }
.ct-tabel small { color: #64748b; }
.ct-cat td small { display: block; margin-top: 1px; }
.ct-path { margin-left: 6px; font-family: monospace; }
.ct-modul { border-left: 4px solid; padding: 4px 0 4px 10px; margin-bottom: 10px; break-inside: avoid; }
.ct-modul-atas { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; }
.ct-modul-atas span { font-weight: 700; font-size: 12px; }
.ct-desk { margin: 2px 0 6px; color: #334155; }
.ct-cat td { font-size: 11.5px; }
.ct-isi { white-space: pre-wrap; color: #334155; margin: 2px 0; }
.ct-kosong { color: #94a3b8; margin: 0; }
@media print {
  .ct-alat { display: none; }
  .ct { padding: 0; max-width: none; }
  .ct-baru { break-before: page; }
  @page { size: A4; margin: 14mm 12mm; }
}
</style>
