<script setup lang="ts">
// File Server kantor (SMB \\192.168.200.2) — jelajah share & folder, unduh, unggah (seret-lepas), buat folder,
// ganti nama, hapus. Koneksi diatur Admin/Director langsung di halaman ini (password disimpan terenkripsi).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { confirmDialog, promptDialog, toast } from '@/composables/useDialog'

interface Item { nama: string; folder: boolean; ukuran: number; diubah: string | null; tersembunyi: boolean }
const route = useRoute()
const router = useRouter()

const status = ref<any>(null)
const shares = ref<{ nama: string; keterangan: string }[]>([])
const share = ref(String(route.query.share || ''))
const dir = ref(String(route.query.path || ''))
const items = ref<Item[]>([])
const memuat = ref(false)
const galat = ref('')
const cari = ref('')
const tampilTersembunyi = ref(false)
const urut = ref<'nama' | 'ukuran' | 'diubah'>('nama')

// ── Pengaturan koneksi (Admin/Director) ──
const atur = ref(false)
const fk = ref({ host: '192.168.200.2', domain: '', username: '', password: '', share_izin: '' })
const menyimpan = ref(false)
const galatAtur = ref('')
function bukaAtur() {
  const s = status.value ?? {}
  fk.value = { host: s.host || '192.168.200.2', domain: s.domain || '', username: s.username || '', password: '', share_izin: (s.share_izin || []).join(', ') }
  galatAtur.value = ''; atur.value = true
}
async function simpanAtur() {
  menyimpan.value = true; galatAtur.value = ''
  try {
    const body: any = { host: fk.value.host.trim(), domain: fk.value.domain.trim(), username: fk.value.username.trim(),
      share_izin: fk.value.share_izin.split(',').map((x) => x.trim()).filter(Boolean) }
    if (fk.value.password) body.password = fk.value.password
    const r = await api.put('/fileserver/konfigurasi', body)
    toast(r.data.message)
    fk.value.password = ''
    atur.value = false
    await muatStatus(); await muatShares()
  } catch (e: any) { galatAtur.value = e.response?.data?.message || 'Gagal terhubung' }
  finally { menyimpan.value = false }
}

async function muatStatus() {
  try { status.value = (await api.get('/fileserver/status')).data.data } catch (e: any) { galat.value = e.response?.data?.message || 'Gagal memuat status' }
}
async function muatShares() {
  if (!status.value?.terisi) return
  try {
    shares.value = (await api.get('/fileserver/shares')).data.data ?? []
    if (!share.value && shares.value[0]) share.value = shares.value[0].nama
  } catch (e: any) { galat.value = e.response?.data?.message || 'Gagal memuat daftar share' }
}
async function muatIsi() {
  if (!share.value) return
  memuat.value = true; galat.value = ''
  try { items.value = (await api.get('/fileserver/ls', { params: { share: share.value, path: dir.value } })).data.data ?? [] }
  catch (e: any) { items.value = []; galat.value = e.response?.data?.message || 'Gagal membuka folder' }
  finally { memuat.value = false }
}
watch([share, dir], () => {
  router.replace({ query: { ...(share.value ? { share: share.value } : {}), ...(dir.value ? { path: dir.value } : {}) } }).catch(() => {})
  cari.value = ''; dipilih.value = new Set(); muatIsi()
})
onMounted(async () => { await muatStatus(); await muatShares(); await muatIsi() })

// ── Navigasi ──
const remah = computed(() => {
  const b = dir.value.split('/').filter(Boolean)
  return b.map((n, i) => ({ nama: n, path: b.slice(0, i + 1).join('/') }))
})
const gabung = (nama: string) => (dir.value ? `${dir.value}/${nama}` : nama)
function buka(it: Item) { if (it.folder) dir.value = gabung(it.nama); else unduh(it) }
function naik() { dir.value = dir.value.split('/').slice(0, -1).join('/') }

const daftar = computed(() => {
  const k = cari.value.trim().toLowerCase()
  let l = items.value.filter((i) => (tampilTersembunyi.value || !i.tersembunyi) && (!k || i.nama.toLowerCase().includes(k)))
  if (urut.value === 'ukuran') l = [...l].sort((a, b) => Number(b.folder) - Number(a.folder) || b.ukuran - a.ukuran)
  if (urut.value === 'diubah') l = [...l].sort((a, b) => Number(b.folder) - Number(a.folder) || (b.diubah ?? '').localeCompare(a.diubah ?? ''))
  return l
})
const ringkas = computed(() => {
  const f = items.value.filter((i) => i.folder).length
  return `${f} folder · ${items.value.length - f} berkas · ${ukuran(items.value.filter((i) => !i.folder).reduce((s, i) => s + i.ukuran, 0))}`
})

// ── Format ──
function ukuran(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
const tgl = (d: string | null) => (d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
function ikon(it: Item) {
  if (it.folder) return '📁'
  const e = it.nama.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf'].includes(e)) return '📕'
  if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return '📘'
  if (['xls', 'xlsx', 'csv', 'ods'].includes(e)) return '📊'
  if (['ppt', 'pptx'].includes(e)) return '📙'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return '🖼️'
  if (['mp4', 'mov', 'avi', 'mkv'].includes(e)) return '🎬'
  if (['mp3', 'wav', 'm4a'].includes(e)) return '🎵'
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(e)) return '🗜️'
  if (['txt', 'log', 'rsc', 'conf', 'ini', 'json', 'xml'].includes(e)) return '📄'
  if (['exe', 'msi', 'iso'].includes(e)) return '💿'
  return '📎'
}

// ── Aksi ──
const proses = ref('')
async function unduh(it: Item) {
  proses.value = `Mengunduh ${it.nama}…`
  try {
    const r = await api.get('/fileserver/unduh', { params: { share: share.value, path: gabung(it.nama) }, responseType: 'blob', timeout: 15 * 60_000 })
    const url = URL.createObjectURL(r.data as Blob)
    const a = document.createElement('a'); a.href = url; a.download = it.nama
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  } catch (e: any) {
    let m = 'Gagal mengunduh'
    if (e.response?.data instanceof Blob) { try { m = JSON.parse(await e.response.data.text()).message || m } catch { /* bukan JSON */ } }
    toast(m, 'danger')
  } finally { proses.value = '' }
}
const inputBerkas = ref<HTMLInputElement | null>(null)
const seret = ref(false)
const progres = ref<number | null>(null)
async function unggah(files: FileList | File[] | null) {
  const list = Array.from(files ?? [])
  if (!list.length || !share.value) return
  const fd = new FormData()
  fd.append('share', share.value); fd.append('path', dir.value)
  list.forEach((f) => fd.append('files', f))
  progres.value = 0; proses.value = `Mengunggah ${list.length} berkas…`
  try {
    const r = await api.post('/fileserver/unggah', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30 * 60_000,
      onUploadProgress: (e) => { if (e.total) progres.value = Math.round((e.loaded / e.total) * 100) },
    })
    toast(r.data.message, r.data.data?.gagal?.length ? 'warning' : 'success')
    for (const g of r.data.data?.gagal ?? []) toast(`${g.nama}: ${g.alasan}`, 'danger', 7000)
    await muatIsi()
  } catch (e: any) { toast(e.response?.data?.message || 'Gagal mengunggah', 'danger') }
  finally { progres.value = null; proses.value = ''; if (inputBerkas.value) inputBerkas.value.value = '' }
}
function jatuh(e: DragEvent) { seret.value = false; unggah(e.dataTransfer?.files ?? null) }

async function folderBaru() {
  const nama = await promptDialog({ title: 'Folder baru', label: 'Nama folder', placeholder: 'mis. BA Pasang Baru 2026', confirmLabel: 'Buat' })
  if (!nama) return
  try { toast((await api.post('/fileserver/folder', { share: share.value, path: dir.value, nama })).data.message); await muatIsi() }
  catch (e: any) { toast(e.response?.data?.message || 'Gagal membuat folder', 'danger') }
}
async function gantiNama(it: Item) {
  const baru = await promptDialog({ title: 'Ganti nama', label: 'Nama baru', defaultValue: it.nama, confirmLabel: 'Simpan' })
  if (!baru || baru === it.nama) return
  try { toast((await api.post('/fileserver/ganti-nama', { share: share.value, path: gabung(it.nama), baru })).data.message); await muatIsi() }
  catch (e: any) { toast(e.response?.data?.message || 'Gagal mengganti nama', 'danger') }
}
async function hapus(it: Item) {
  const ok = await confirmDialog({
    title: it.folder ? `Hapus folder "${it.nama}"?` : `Hapus "${it.nama}"?`,
    message: it.folder ? 'Folder BESERTA SELURUH ISINYA akan dihapus permanen dari file server.' : 'Berkas akan dihapus permanen dari file server.',
    confirmLabel: 'Hapus permanen', variant: 'danger',
  })
  if (!ok) return
  try { toast((await api.post('/fileserver/hapus', { share: share.value, path: gabung(it.nama), folder: it.folder })).data.message); await muatIsi() }
  catch (e: any) { toast(e.response?.data?.message || 'Gagal menghapus', 'danger') }
}
// pilih banyak untuk unduh
const dipilih = ref<Set<string>>(new Set())
function togglePilih(n: string) { const s = new Set(dipilih.value); s.has(n) ? s.delete(n) : s.add(n); dipilih.value = s }
async function unduhTerpilih() { for (const it of daftar.value.filter((i) => dipilih.value.has(i.nama) && !i.folder)) await unduh(it) }
</script>

<template>
  <div class="page fs" @dragover.prevent="share && status?.terisi && (seret = true)" @dragleave.self="seret = false" @drop.prevent="jatuh">
    <div class="fs-kepala">
      <div>
        <h2>🗃️ File Server</h2>
        <p class="sub">Berkas kantor di <code>\\{{ status?.host || '192.168.200.2' }}</code> — buka, unduh, unggah, dan kelola folder langsung dari ERP.</p>
      </div>
      <button v-if="status?.bisa_atur" type="button" class="btn btn-ghost" @click="bukaAtur">⚙️ Koneksi</button>
    </div>

    <!-- Belum diatur -->
    <div v-if="status && !status.terisi" class="fs-kosong besar">
      <span class="maskot">🔌</span>
      <b>File server belum terhubung</b>
      <p v-if="status.bisa_atur">Isi alamat, username, dan password akun file server untuk menghubungkan ERP.</p>
      <p v-else>Minta Admin / Director menghubungkan file server di halaman ini.</p>
      <button v-if="status.bisa_atur" type="button" class="btn btn-primary" @click="bukaAtur">Hubungkan file server</button>
    </div>

    <template v-else-if="status?.terisi">
      <!-- Share -->
      <div class="fs-share" role="tablist" aria-label="Share">
        <button v-for="s in shares" :key="s.nama" type="button" role="tab" :aria-selected="share === s.nama" :class="{ on: share === s.nama }"
          :title="s.keterangan" @click="share = s.nama; dir = ''">🗂️ {{ s.nama }}</button>
        <span v-if="!shares.length && !galat" class="fs-redup">Memuat share…</span>
      </div>

      <!-- Bilah alat -->
      <div class="fs-alat">
        <nav class="fs-remah" aria-label="Lokasi folder">
          <button type="button" :class="{ akhir: !dir }" @click="dir = ''">🏠 {{ share || '—' }}</button>
          <template v-for="(r, i) in remah" :key="r.path">
            <span aria-hidden="true">›</span>
            <button type="button" :class="{ akhir: i === remah.length - 1 }" @click="dir = r.path">{{ r.nama }}</button>
          </template>
        </nav>
        <div class="fs-tombol">
          <div class="fs-cari"><span aria-hidden="true">🔎</span><input v-model="cari" type="search" placeholder="Cari di folder ini…" aria-label="Cari di folder ini" /></div>
          <button type="button" class="btn btn-ghost" :disabled="!share" @click="folderBaru">📁 Folder baru</button>
          <button type="button" class="btn btn-primary" :disabled="!share" @click="inputBerkas?.click()">⬆️ Unggah</button>
          <input ref="inputBerkas" type="file" multiple hidden @change="unggah(($event.target as HTMLInputElement).files)" />
        </div>
      </div>

      <div class="fs-info">
        <span>{{ ringkas }}</span>
        <label><input v-model="tampilTersembunyi" type="checkbox" /> tampilkan tersembunyi</label>
        <label>Urut
          <select v-model="urut"><option value="nama">nama</option><option value="diubah">terbaru</option><option value="ukuran">terbesar</option></select>
        </label>
        <button v-if="dipilih.size" type="button" class="btn btn-ghost btn-sm" @click="unduhTerpilih">⬇️ Unduh {{ dipilih.size }} terpilih</button>
      </div>

      <div v-if="proses" class="fs-proses" role="status">
        <span class="putar" /> {{ proses }}
        <div v-if="progres != null" class="fs-bar"><i :style="{ width: `${progres}%` }" /></div>
      </div>

      <!-- Isi folder -->
      <div class="fs-daftar">
        <div v-if="galat" class="fs-kosong merah" role="alert">😵 {{ galat }} <button type="button" class="btn btn-ghost btn-sm" @click="muatIsi">Coba lagi</button></div>
        <div v-else-if="memuat" class="fs-kosong"><span class="putar" /> Membuka folder…</div>
        <template v-else>
          <button v-if="dir" type="button" class="fs-baris naik" @click="naik"><span class="fs-ikon">⤴️</span><span class="fs-nama">.. (naik satu folder)</span></button>
          <div v-if="!daftar.length" class="fs-kosong"><span class="maskot">📭</span>{{ cari ? `Tidak ada yang cocok dengan “${cari}”` : 'Folder ini kosong — seret berkas ke sini untuk mengunggah' }}</div>
          <div v-for="it in daftar" :key="it.nama" v-baris :class="['fs-baris', { folder: it.folder, terpilih: dipilih.has(it.nama) }]" @click="buka(it)">
            <span v-if="!it.folder" class="fs-cek" @click.stop><input type="checkbox" :checked="dipilih.has(it.nama)" :aria-label="`Pilih ${it.nama}`" @change="togglePilih(it.nama)" /></span>
            <span v-else class="fs-cek" />
            <span class="fs-ikon">{{ ikon(it) }}</span>
            <span class="fs-nama" :title="it.nama">{{ it.nama }}</span>
            <span class="fs-ukuran">{{ it.folder ? '' : ukuran(it.ukuran) }}</span>
            <span class="fs-tgl">{{ tgl(it.diubah) }}</span>
            <span class="fs-aksi" @click.stop>
              <button v-if="!it.folder" type="button" title="Unduh" aria-label="Unduh" @click="unduh(it)">⬇️</button>
              <button type="button" title="Ganti nama" aria-label="Ganti nama" @click="gantiNama(it)">✏️</button>
              <button v-if="status?.bisa_hapus" type="button" class="hapus" title="Hapus" aria-label="Hapus" @click="hapus(it)">🗑️</button>
            </span>
          </div>
        </template>
      </div>
    </template>

    <div v-if="seret" class="fs-seret"><span>📥</span>Lepaskan untuk mengunggah ke <b>{{ share }}/{{ dir || '' }}</b></div>

    <!-- Pengaturan koneksi -->
    <div v-if="atur" class="modal-overlay" @click.self="atur = false">
      <div class="fs-modal" role="dialog" aria-label="Koneksi file server">
        <h3>⚙️ Koneksi file server</h3>
        <p class="sub">Disarankan memakai akun khusus ERP (bukan root) yang hanya punya akses ke folder yang diperlukan.</p>
        <label>Alamat (host / IP)<input v-model="fk.host" placeholder="192.168.200.2" /></label>
        <div class="fs-dua">
          <label>Username<input v-model="fk.username" autocomplete="username" placeholder="erp" /></label>
          <label>Domain / workgroup <small>(opsional)</small><input v-model="fk.domain" placeholder="WORKGROUP" /></label>
        </div>
        <label>Password <small v-if="status?.terisi">(kosongkan bila tidak diganti)</small>
          <input v-model="fk.password" type="password" autocomplete="new-password" placeholder="••••••••" />
        </label>
        <label>Share yang dibuka <small>(opsional, pisahkan koma — kosong = semua share)</small><input v-model="fk.share_izin" placeholder="Data, Dokumen" /></label>
        <p v-if="galatAtur" class="fs-galat" role="alert">⚠️ {{ galatAtur }}</p>
        <div class="fs-modal-aksi">
          <button type="button" class="btn btn-ghost" :disabled="menyimpan" @click="atur = false">Batal</button>
          <button type="button" class="btn btn-primary" :disabled="menyimpan || !fk.host || !fk.username || (!status?.terisi && !fk.password)" @click="simpanAtur">
            {{ menyimpan ? 'Menguji koneksi…' : 'Uji & simpan' }}
          </button>
        </div>
        <small class="fs-redup">🔒 Password disimpan terenkripsi di server ERP dan tidak pernah ditampilkan kembali.</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fs { position: relative; }
.fs-kepala { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.fs-kepala h2 { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
.sub { margin: 4px 0 0; font-size: 13px; color: #64748b; }
.sub code { background: #f1f5f9; padding: 1px 6px; border-radius: 6px; }
.fs-share { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.fs-share button { padding: 8px 14px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; font-weight: 700; font-size: 13px; color: #334155; cursor: pointer; }
.fs-share button.on { background: #0f172a; border-color: #0f172a; color: #fff; }
.fs-alat { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; }
.fs-remah { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; font-size: 13.5px; color: #94a3b8; }
.fs-remah button { border: 0; background: none; padding: 4px 6px; border-radius: 8px; color: #1d4ed8; font-weight: 600; cursor: pointer; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-remah button:hover { background: #eef5ff; }
.fs-remah button.akhir { color: #0f172a; font-weight: 800; }
.fs-tombol { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fs-cari { display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 36px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; }
.fs-cari input { border: 0; background: none; outline: none; font: inherit; font-size: 13px; width: 180px; }
.fs-info { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 8px 4px; font-size: 12.5px; color: #64748b; }
.fs-info label { display: flex; align-items: center; gap: 6px; }
.fs-info select { padding: 3px 6px; border-radius: 8px; border: 1px solid #e2e8f0; }
.fs-proses { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; margin-bottom: 8px; border-radius: 12px; background: #eef5ff; color: #1c4f9c; font-size: 13px; font-weight: 600; }
.fs-bar { flex-basis: 100%; height: 6px; border-radius: 99px; background: #dbeafe; overflow: hidden; }
.fs-bar i { display: block; height: 100%; background: #2a78d6; transition: width .2s; }
.fs-daftar { border-radius: 16px; background: #fff; border: 1px solid #e2e8f0; overflow: hidden; }
.fs-baris { display: grid; grid-template-columns: 28px 32px minmax(0, 1fr) 90px 150px 110px; align-items: center; gap: 8px; width: 100%; padding: 9px 14px; border: 0; border-bottom: 1px solid #f1f5f9; background: #fff; text-align: left; font: inherit; cursor: pointer; transition: background .12s; }
.fs-baris:hover { background: #f8fafc; }
.fs-baris.terpilih { background: #eef5ff; }
.fs-baris.naik { grid-template-columns: 28px 32px 1fr; color: #64748b; }
.fs-ikon { font-size: 20px; text-align: center; }
.fs-nama { font-size: 13.5px; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-baris.folder .fs-nama { font-weight: 700; }
.fs-ukuran, .fs-tgl { font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; }
.fs-ukuran { text-align: right; }
.fs-aksi { display: flex; gap: 2px; justify-content: flex-end; opacity: 0; transition: opacity .12s; }
.fs-baris:hover .fs-aksi, .fs-baris:focus-within .fs-aksi { opacity: 1; }
.fs-aksi button { width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; cursor: pointer; }
.fs-aksi button:hover { background: #f1f5f9; }
.fs-aksi button.hapus:hover { background: #fee2e2; }
.fs-cek input { width: 16px; height: 16px; accent-color: #2a78d6; }
.fs-kosong { padding: 40px 16px; text-align: center; color: #64748b; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13.5px; }
.fs-kosong.besar { background: #fff; border-radius: 18px; border: 1px dashed #cbd5e1; padding: 50px 16px; }
.fs-kosong.besar p { margin: 0; }
.fs-kosong.merah { color: #b91c1c; }
.maskot { font-size: 36px; }
.fs-redup { color: #94a3b8; font-size: 12px; }
.putar { width: 14px; height: 14px; border: 2px solid #dbeafe; border-top-color: #2a78d6; border-radius: 50%; display: inline-block; animation: putar .7s linear infinite; }
.fs-seret { position: fixed; inset: 16px; z-index: 900; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 3px dashed #2a78d6; border-radius: 24px; background: rgba(238, 245, 255, .94); font-size: 16px; color: #1c4f9c; pointer-events: none; }
.fs-seret span { font-size: 48px; }
.fs-modal { width: min(520px, 94vw); background: #fff; border-radius: 18px; padding: 22px; display: flex; flex-direction: column; gap: 10px; }
.fs-modal h3 { margin: 0; }
.fs-modal label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 700; color: #334155; }
.fs-modal label small { font-weight: 500; color: #94a3b8; }
.fs-modal input { padding: 9px 11px; border: 1px solid #e2e8f0; border-radius: 10px; font: inherit; font-weight: 400; font-size: 14px; }
.fs-dua { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fs-galat { margin: 0; color: #b91c1c; font-size: 13px; font-weight: 600; }
.fs-modal-aksi { display: flex; justify-content: flex-end; gap: 8px; }
@keyframes putar { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .fs-baris { grid-template-columns: 24px 28px minmax(0, 1fr) 70px; }
  .fs-tgl, .fs-aksi { display: none; }
  .fs-cari input { width: 120px; }
  .fs-dua { grid-template-columns: 1fr; }
}
</style>
