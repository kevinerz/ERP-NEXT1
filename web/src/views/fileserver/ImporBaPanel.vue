<script setup lang="ts">
// Impor BA: pindai folder file server (termasuk sub-folder), cocokkan nama berkas ke site, tinjau & koreksi,
// lalu simpan sebagai tautan di tab Dokumen site (berkas tetap di file server, tidak disalin).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import api from '@/services/api'
import { confirmDialog, toast, toastGalat, pesanGalat } from '@/composables/useDialog'
import CariPilih, { type OpsiCari } from '@/components/CariPilih.vue'

const props = defineProps<{ share: string; path: string }>()
const emit = defineEmits<{ (e: 'tutup'): void }>()

interface Kandidat { id_site: number; nama_site: string; kode_site: string; pelanggan?: string; status_site: string; skor: number }
interface Berkas { path: string; nama: string; ukuran: number; diubah: string | null; sudah: boolean; status: 'yakin' | 'ragu' | 'tidak_cocok'; kandidat: Kandidat[]; pilih?: number | null; label?: string; centang?: boolean }

const memuat = ref(true)
const galat = ref('')
const data = ref<{ total: number; yakin: number; ragu: number; tidak_cocok: number; sudah: number } | null>(null)
const berkas = ref<Berkas[]>([])
const tab = ref<'yakin' | 'ragu' | 'tidak_cocok' | 'sudah'>('yakin')
const cari = ref('')
const menyimpan = ref(false)
const denganFoto = ref(false)

async function pindai() {
  memuat.value = true; galat.value = ''
  try {
    const r = await api.post('/fileserver/impor-ba/pratinjau', { share: props.share, path: props.path, foto: denganFoto.value }, { timeout: 10 * 60_000 })
    data.value = r.data.data
    berkas.value = (r.data.data.berkas as Berkas[]).map((b) => ({
      ...b,
      pilih: b.status === 'yakin' ? b.kandidat[0]?.id_site ?? null : null,
      label: b.status === 'yakin' ? b.kandidat[0]?.nama_site : undefined,
      centang: b.status === 'yakin' && !b.sudah,
    }))
    tab.value = data.value!.yakin ? 'yakin' : data.value!.ragu ? 'ragu' : 'tidak_cocok'
  } catch (e: any) { galat.value = pesanGalat(e, 'Gagal memindai folder') }
  finally { memuat.value = false }
}
onMounted(pindai)

const daftar = computed(() => {
  const k = cari.value.trim().toLowerCase()
  return berkas.value.filter((b) => (tab.value === 'sudah' ? b.sudah : !b.sudah && b.status === tab.value) &&
    (!k || b.nama.toLowerCase().includes(k) || (b.label ?? '').toLowerCase().includes(k)))
})
const terpilih = computed(() => berkas.value.filter((b) => b.centang && b.pilih && !b.sudah))
const semuaTercentang = computed(() => daftar.value.length > 0 && daftar.value.every((b) => b.centang || !b.pilih))

function pilihKandidat(b: Berkas, k: Kandidat) { b.pilih = k.id_site; b.label = k.nama_site; b.centang = true }
async function cariSite(q: string): Promise<OpsiCari[]> {
  const r = await api.get('/master/site', { params: { search: q || undefined, limit: 20 } })
  return (r.data.data as any[]).map((s) => ({ value: s.id_site, label: s.nama_site, sub: [s.kode_site, s.pelanggan?.nama_pelanggan].filter(Boolean).join(' · ') }))
}
function centangSemua() {
  const nilai = !semuaTercentang.value
  for (const b of daftar.value) if (b.pilih) b.centang = nilai
}
const folderDari = (p: string) => p.split('/').slice(0, -1).join(' / ')
const ukuran = (n: number) => (n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)

// Progres penyalinan berkas ke server ERP (berjalan di latar belakang)
const salin = ref<{ berjalan: boolean; total: number; selesai: number; gagal: number; byte: number } | null>(null)
let timerSalin: ReturnType<typeof setInterval> | null = null
async function pantauSalin() {
  try { salin.value = (await api.get('/fileserver/impor-ba/salin', { senyap: true })).data.data } catch { /* abaikan */ }
  if (salin.value && !salin.value.berjalan && timerSalin) { clearInterval(timerSalin); timerSalin = null }
}
function mulaiPantau() { pantauSalin(); if (!timerSalin) timerSalin = setInterval(pantauSalin, 2000) }
onMounted(pantauSalin)
onBeforeUnmount(() => { if (timerSalin) clearInterval(timerSalin) })

async function simpan() {
  if (menyimpan.value) return
  const items = terpilih.value.map((b) => ({ path: b.path, id_site: b.pilih, nama: b.nama, ukuran: b.ukuran }))
  const jmlSite = new Set(items.map((i) => i.id_site)).size
  if (!(await confirmDialog({ title: `Tautkan ${items.length} BA ke ${jmlSite} site?`, message: 'Berkas disalin ke server ERP dan muncul di tab Dokumen masing-masing site. Berkas asli di file server tidak diubah.', confirmLabel: 'Simpan' }))) return
  menyimpan.value = true
  try {
    const r = await api.post('/fileserver/impor-ba/terapkan', { share: props.share, items }, { timeout: 5 * 60_000 })
    toast(r.data.message || 'BA ditautkan ke site')
    mulaiPantau()
    await pindai()
  } catch (e: any) { toastGalat(e, 'Gagal menautkan BA ke site') }
  finally { menyimpan.value = false }
}
</script>

<template>
  <div class="modal-overlay ib-latar" @click.self="emit('tutup')">
    <div class="ib" role="dialog" aria-label="Impor BA ke site">
      <div class="ib-kepala">
        <div>
          <b>📥 Impor BA ke dokumen site</b>
          <small>Folder: {{ share }}/{{ path || '' }} (termasuk sub-folder)</small>
        </div>
        <button type="button" class="ib-x" aria-label="Tutup" @click="emit('tutup')">✕</button>
      </div>

      <div v-if="memuat" class="ib-muat"><span class="putar" /> Memindai folder & mencocokkan nama berkas dengan site… (folder besar bisa 1–2 menit)</div>
      <div v-else-if="galat" class="ib-muat merah">😵 {{ galat }} <button type="button" class="btn btn-ghost btn-sm" @click="pindai">Coba lagi</button></div>
      <template v-else-if="data">
        <div class="ib-ringkas">
          <b>{{ data.total.toLocaleString('id') }}</b> berkas ditemukan ({{ denganFoto ? 'PDF, Word & foto' : 'PDF & Word' }}).
          <label class="ib-foto"><input v-model="denganFoto" type="checkbox" @change="pindai" /> sertakan foto dokumentasi</label>
          Pilih site yang benar untuk tiap berkas, lalu tautkan.
        </div>
        <div class="ib-tab" role="tablist">
          <button type="button" :class="{ on: tab === 'yakin' }" @click="tab = 'yakin'">✅ Cocok <b>{{ data.yakin }}</b></button>
          <button type="button" :class="{ on: tab === 'ragu' }" @click="tab = 'ragu'">🤔 Perlu dipilih <b>{{ data.ragu }}</b></button>
          <button type="button" :class="{ on: tab === 'tidak_cocok' }" @click="tab = 'tidak_cocok'">❓ Tidak dikenali <b>{{ data.tidak_cocok }}</b></button>
          <button type="button" :class="{ on: tab === 'sudah' }" @click="tab = 'sudah'">🔗 Sudah tertaut <b>{{ data.sudah }}</b></button>
          <input v-model="cari" type="search" class="ib-cari" placeholder="Cari nama berkas / site…" aria-label="Cari" />
        </div>

        <div class="ib-daftar">
          <label v-if="tab !== 'sudah' && daftar.length" class="ib-semua"><input type="checkbox" :checked="semuaTercentang" @change="centangSemua" /> Centang semua yang sudah punya site ({{ daftar.filter((b) => b.pilih).length }})</label>
          <div v-if="!daftar.length" class="ib-kosong">Tidak ada berkas di kelompok ini.</div>
          <div v-for="b in daftar.slice(0, 400)" :key="b.path" :class="['ib-baris', { on: b.centang }]">
            <input v-if="tab !== 'sudah'" type="checkbox" v-model="b.centang" :disabled="!b.pilih" :aria-label="`Pilih ${b.nama}`" />
            <span v-else>🔗</span>
            <div class="ib-berkas">
              <b :title="b.path">{{ b.nama }}</b>
              <small>📁 {{ folderDari(b.path) || '/' }} · {{ ukuran(b.ukuran) }}</small>
            </div>
            <div class="ib-site">
              <template v-if="tab === 'sudah'"><small class="ib-redup">sudah ada di dokumen site</small></template>
              <template v-else>
                <div v-if="b.kandidat.length && tab !== 'tidak_cocok'" class="ib-kandidat">
                  <button v-for="k in b.kandidat" :key="k.id_site" type="button" :class="{ on: b.pilih === k.id_site }" :title="`${k.kode_site} · ${k.pelanggan ?? ''} · ${k.status_site}`" @click="pilihKandidat(b, k)">
                    {{ k.nama_site }} <i>{{ k.skor }}%</i>
                  </button>
                </div>
                <CariPilih :key="b.path + ':' + (b.pilih ?? 0)" :model-value="b.pilih ?? null" :cari="cariSite" :label-terpilih="b.label" placeholder="Cari site lain…"
                  @pilih="(o) => { b.pilih = o?.value ?? null; b.label = o?.label; b.centang = !!o }" />
              </template>
            </div>
          </div>
          <div v-if="daftar.length > 400" class="ib-kosong">Menampilkan 400 dari {{ daftar.length }} — persempit dengan kotak cari.</div>
        </div>

        <div v-if="salin && (salin.berjalan || salin.total)" class="ib-salin">
          <span v-if="salin.berjalan" class="putar" /> {{ salin.berjalan ? 'Menyalin berkas ke server ERP…' : 'Penyalinan terakhir selesai:' }}
          <b>{{ salin.selesai }}/{{ salin.total }}</b> berkas · {{ (salin.byte / 1048576).toFixed(0) }} MB<template v-if="salin.gagal"> · <span class="merah">{{ salin.gagal }} gagal</span></template>
          <div class="ib-bar"><i :style="{ width: `${salin.total ? Math.round(((salin.selesai + salin.gagal) / salin.total) * 100) : 0}%` }" /></div>
        </div>
        <div class="ib-kaki">
          <span><b>{{ terpilih.length }}</b> berkas akan ditautkan ke <b>{{ new Set(terpilih.map((b) => b.pilih)).size }}</b> site</span>
          <span class="spasi" />
          <button type="button" class="btn btn-ghost" @click="emit('tutup')">Tutup</button>
          <button type="button" class="btn btn-primary" :disabled="menyimpan || !terpilih.length" @click="simpan">{{ menyimpan ? 'Menyimpan…' : '💾 Simpan ke site' }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ib-latar { align-items: flex-start; padding: 20px 12px; }
.ib { width: min(1100px, 100%); max-height: calc(100vh - 40px); display: flex; flex-direction: column; background: #fff; border-radius: 20px; box-shadow: 0 30px 70px rgba(15, 23, 42, .3); overflow: hidden; }
.ib-kepala { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: linear-gradient(120deg, #eaf2fd, #f3effd); border-bottom: 1px solid #e2e8f0; }
.ib-kepala b { display: block; font-size: 16px; }
.ib-kepala small { color: #64748b; font-size: 12px; }
.ib-x { width: 34px; height: 34px; border: 0; border-radius: 10px; background: #fff; cursor: pointer; }
.ib-muat { padding: 50px 20px; text-align: center; color: #475569; display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap; }
.ib-muat.merah { color: #b91c1c; }
.putar { width: 16px; height: 16px; border: 2px solid #dbeafe; border-top-color: #2a78d6; border-radius: 50%; animation: putar .7s linear infinite; }
.ib-ringkas { padding: 12px 18px 4px; font-size: 13.5px; color: #334155; }
.ib-foto { margin-left: 10px; font-size: 12.5px; color: #475569; display: inline-flex; gap: 5px; align-items: center; }
.ib-tab { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 8px 18px; border-bottom: 1px solid #f1f5f9; }
.ib-tab button { padding: 7px 12px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
.ib-tab button b { margin-left: 4px; padding: 0 7px; border-radius: 99px; background: #f1f5f9; font-size: 11.5px; }
.ib-tab button.on { background: #0f172a; color: #fff; border-color: #0f172a; }
.ib-tab button.on b { background: rgba(255, 255, 255, .2); }
.ib-cari { margin-left: auto; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 10px; font: inherit; font-size: 13px; min-width: 220px; }
.ib-daftar { flex: 1; overflow-y: auto; padding: 6px 18px 12px; }
.ib-semua { display: flex; gap: 8px; align-items: center; padding: 8px 0; font-size: 12.5px; font-weight: 600; color: #475569; }
.ib-baris { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1.1fr); gap: 12px; align-items: start; padding: 10px 8px; border-bottom: 1px solid #f1f5f9; border-radius: 10px; }
.ib-baris.on { background: #f0f7ff; }
.ib-baris input[type=checkbox] { margin-top: 4px; width: 16px; height: 16px; accent-color: #2a78d6; }
.ib-berkas { min-width: 0; display: flex; flex-direction: column; }
.ib-berkas b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ib-berkas small { font-size: 11.5px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ib-site { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ib-kandidat { display: flex; gap: 6px; flex-wrap: wrap; }
.ib-kandidat button { padding: 4px 10px; border-radius: 99px; border: 1px solid #c7dbf7; background: #fff; font-size: 12px; cursor: pointer; color: #1c4f9c; }
.ib-kandidat button i { font-style: normal; color: #94a3b8; margin-left: 2px; }
.ib-kandidat button.on { background: #2a78d6; color: #fff; border-color: #2a78d6; }
.ib-kandidat button.on i { color: #dbeafe; }
.ib-kosong { padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; }
.ib-redup { color: #94a3b8; }
.ib-kaki { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-top: 1px solid #e2e8f0; background: #fbfcfe; flex-wrap: wrap; font-size: 13px; }
.spasi { flex: 1; }
.ib-salin { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 18px; background: #eef5ff; color: #1c4f9c; font-size: 13px; border-top: 1px solid #dbeafe; }
.ib-salin .merah { color: #b91c1c; }
.ib-bar { flex-basis: 100%; height: 6px; border-radius: 99px; background: #dbeafe; overflow: hidden; }
.ib-bar i { display: block; height: 100%; background: #2a78d6; transition: width .4s; }
@keyframes putar { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .ib-baris { grid-template-columns: 22px 1fr; } .ib-site { grid-column: 2; } .ib-cari { min-width: 0; width: 100%; margin-left: 0; } }
</style>
