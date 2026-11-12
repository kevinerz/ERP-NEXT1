<template>
  <div class="ud">
    <button type="button" class="ud-kembali" @click="router.push('/hris/karyawan')">← Buku Tim</button>
    <header class="ud-kepala">
      <div>
        <h1>Undang rekan baru <em>isi data sendiri</em></h1>
        <p>Buat link pendaftaran untuk calon karyawan. Mereka mengisi semua data (termasuk foto), akun ERP dibuat otomatis, dan kredensial dikirim ke email mereka. Link berlaku 7 hari.</p>
      </div>
      <div class="ud-langkah">
        <span><i>1</i>Buat link</span><span><i>2</i>Kirim lewat WA / email</span><span><i>3</i>Rekan isi data</span><span><i>4</i>Muncul di Buku Tim</span>
      </div>
    </header>

    <div class="ud-tata">
      <section class="ud-kartu ud-buat">
        <h3>✉️ Buat undangan</h3>
        <label class="ud-f">Departemen <small>(opsional — sekadar petunjuk)</small>
          <div class="ud-dept">
            <button v-for="d in hris.departemenList" :key="d" type="button" :class="{ on: form.departemen === d }" :style="{ '--c': infoDept(d).warna }" @click="form.departemen = form.departemen === d ? '' : d">{{ infoDept(d).ikon }} {{ d }}</button>
          </div>
        </label>
        <label class="ud-f">Jabatan <small>(opsional)</small><input v-model="form.jabatan" type="text" placeholder="mis. Network Engineer" @keydown.enter="handleCreate" /></label>
        <button type="button" class="ud-btn utama" :disabled="creating" @click="handleCreate">{{ creating ? 'Membuat…' : '＋ Buat link undangan' }}</button>
        <p v-if="createError" class="ud-galat">{{ createError }}</p>

        <div v-if="lastLink" class="ud-hasil">
          <small>Link siap dibagikan 🎉</small>
          <span ref="linkEl" class="ud-link">{{ lastLink }}</span>
          <div class="ud-hasil-aksi">
            <button type="button" class="ud-btn" @click="copyLink(lastLink)">{{ copied ? '✓ Disalin' : '📋 Salin link' }}</button>
            <a class="ud-btn wa" :href="waLink(lastLink, jabatanTerakhir)" target="_blank" rel="noopener">💬 Kirim via WhatsApp</a>
          </div>
          <p v-if="copyFailed" class="ud-galat">Gagal menyalin otomatis — link sudah ditandai, tekan Ctrl+C (atau tahan &amp; salin di HP).</p>
        </div>
      </section>

      <section class="ud-kartu">
        <div class="ud-daftar-kepala">
          <h3>Daftar undangan</h3>
          <div class="ud-segmen">
            <button type="button" :class="{ on: saring === '' }" @click="saring = ''">Semua <i>{{ invitations.length }}</i></button>
            <button type="button" :class="{ on: saring === 'Pending' }" @click="saring = 'Pending'">Menunggu <i>{{ hitung.menunggu }}</i></button>
            <button type="button" :class="{ on: saring === 'Used' }" @click="saring = 'Used'">Terpakai <i>{{ hitung.terpakai }}</i></button>
          </div>
        </div>
        <div v-if="loadError" class="ud-kosong">⚠ {{ loadError }} <button type="button" class="ud-btn" @click="fetchInvitations">Coba lagi</button></div>
        <div v-else-if="loading" class="ud-kosong">Memuat…</div>
        <div v-else-if="!tampil.length" class="ud-kosong">🌿 Belum ada undangan{{ saring ? ' dengan status ini' : '' }}.</div>
        <ul v-else class="ud-daftar">
          <li v-for="inv in tampil" :key="inv.id_invitation" :class="'s-' + String(inv.status).toLowerCase()" :style="{ '--c': infoDept(inv.departemen).warna }">
            <div class="ud-ikon">{{ inv.status === 'Used' ? '✅' : inv.status === 'Pending' ? '⏳' : inv.status === 'Revoked' ? '🚫' : '⌛' }}</div>
            <div class="ud-isi">
              <b v-if="inv.karyawan?.nama_lengkap">{{ inv.karyawan.nama_lengkap }}</b>
              <b v-else>{{ inv.jabatan || 'Jabatan belum ditentukan' }}</b>
              <small>
                <span v-if="inv.departemen" class="ud-dept-teks">{{ inv.departemen }}</span>
                <template v-if="inv.karyawan?.nama_lengkap && inv.jabatan"> · {{ inv.jabatan }}</template>
                · dibuat {{ fmtDateTime(inv.created_at) }}<template v-if="inv.admin?.username"> oleh {{ inv.admin.username }}</template>
              </small>
            </div>
            <div class="ud-status">
              <span class="ud-lencana">{{ STATUS_TEXT[inv.status] || inv.status }}</span>
              <small v-if="inv.status === 'Pending'">sisa {{ sisaHari(inv.expires_at) }} hari</small>
            </div>
            <div v-if="inv.status === 'Pending'" class="ud-aksi">
              <button type="button" title="Salin link" @click="salinCepat(linkDari(inv.token))">📋</button>
              <a :href="waLink(linkDari(inv.token), inv.jabatan)" target="_blank" rel="noopener" title="Kirim via WhatsApp">💬</a>
              <button type="button" class="bahaya" :disabled="revokingId === inv.id_invitation" title="Batalkan undangan" @click="handleRevoke(inv.id_invitation)">{{ revokingId === inv.id_invitation ? '…' : '✕' }}</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { confirmDialog, alertError } from '@/composables/useDialog'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useHrisStore } from '@/stores/hris'
import { fmtDateTime } from '@/composables/useFormat'
import { computed } from 'vue'
import { toast, pesanGalat } from '@/composables/useDialog'
import { infoDept } from './hris-util'

const router = useRouter()
const hris = useHrisStore()

const form = ref({ departemen: '', jabatan: '' })
const creating = ref(false)
const createError = ref('')
const lastLink = ref('')
const copied = ref(false)
const copyFailed = ref(false)
const linkEl = ref<HTMLElement | null>(null)

const invitations = ref<any[]>([])
const loading = ref(true)
const loadError = ref('')
const revokingId = ref(0)

async function fetchInvitations() {
  loading.value = true
  loadError.value = ''
  try {
    const r = await api.get('/hris/invitations')
    invitations.value = r.data.data
  } catch (e: any) {
    // gagal ≠ kosong: tampilkan pesan + tombol coba lagi
    loadError.value = pesanGalat(e, 'Gagal memuat daftar undangan')
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (creating.value) return
  creating.value = true
  createError.value = ''
  lastLink.value = ''
  try {
    const r = await api.post('/hris/invitations', {
      departemen: form.value.departemen || undefined,
      jabatan: form.value.jabatan.trim() || undefined,
    })
    const token = r.data.data.token
    lastLink.value = `${window.location.origin}/onboarding/${token}`
    jabatanTerakhir.value = form.value.jabatan
    form.value = { departemen: '', jabatan: '' }
    await fetchInvitations()
  } catch (e: any) {
    createError.value = pesanGalat(e, 'Gagal membuat undangan')
  } finally {
    creating.value = false
  }
}

async function copyLink(link: string) {
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(link)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // clipboard API tidak tersedia (mis. bukan HTTPS) — tandai teks link agar user tinggal Ctrl+C
    copyFailed.value = true
    const el = linkEl.value
    const sel = window.getSelection()
    if (el && sel) {
      const range = document.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }
}

async function handleRevoke(id: number) {
  if (revokingId.value) return
  if (!(await confirmDialog({ title: 'Batalkan Undangan?', message: 'Link tidak akan bisa dipakai lagi.', variant: 'danger', confirmLabel: 'Ya, Batalkan' }))) return
  revokingId.value = id
  try {
    await api.delete(`/hris/invitations/${id}`)
    toast('Undangan dibatalkan')
    await fetchInvitations()
  } catch (e: any) {
    await alertError(e, 'Gagal membatalkan undangan')
  } finally {
    revokingId.value = 0
  }
}

const STATUS_TEXT: Record<string, string> = { Pending: 'Menunggu', Used: 'Terpakai', Expired: 'Kedaluwarsa', Revoked: 'Dibatalkan' }

function statusClass(status: string) {
  if (status === 'Pending') return 'badge-pending'
  if (status === 'Used') return 'badge-used'
  return 'badge-expired'
}

const linkDari = (token: string) => `${window.location.origin}/onboarding/${token}`
const hitung = computed(() => ({
  menunggu: invitations.value.filter((i) => i.status === 'Pending').length,
  terpakai: invitations.value.filter((i) => i.status === 'Used').length,
  lain: invitations.value.filter((i) => i.status !== 'Pending' && i.status !== 'Used').length,
}))
const saring = ref<'Pending' | 'Used' | ''>('')
const tampil = computed(() => invitations.value.filter((i) => !saring.value || i.status === saring.value))
const teksWa = (link: string, jabatan?: string) => `Halo! Selamat bergabung di NEXT1 🎉\n\nSilakan lengkapi data karyawan Anda${jabatan ? ` (${jabatan})` : ''} lewat link berikut — akun ERP akan dibuat otomatis dan dikirim ke email Anda:\n${link}\n\nLink berlaku 7 hari.`
const waLink = (link: string, jabatan?: string) => `https://wa.me/?text=${encodeURIComponent(teksWa(link, jabatan))}`
async function salinCepat(link: string) {
  try { await navigator.clipboard.writeText(link); toast('Link disalin') } catch { toast('Gagal menyalin link — salin manual', 'warning') }
}
const sisaHari = (d: string) => Math.max(0, Math.ceil((+new Date(d) - Date.now()) / 86400_000))
const jabatanTerakhir = ref('')

onMounted(() => {
  hris.fetchDepartemen()
  fetchInvitations()
})
</script>

<style scoped>
.ud { --kertas: #fbf8f2; --tinta: #1c2a22; --hutan: #1f4d3a; --terakota: #c2552d; --garis: #e9e2d4; --redup: #8a8170;
  --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;
  background: var(--kertas); padding: 18px 24px 50px; min-height: 100%; box-sizing: border-box; color: var(--tinta); }
.ud-kembali { border: 0; background: none; color: var(--hutan); font-weight: 800; font-size: 13px; cursor: pointer; padding: 2px 0 8px; }
.ud-kepala { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 18px; }
.ud-kepala h1 { margin: 0; font-family: var(--serif); font-size: 32px; font-weight: 700; letter-spacing: -.5px; }
.ud-kepala h1 em { font-weight: 400; color: var(--terakota); }
.ud-kepala p { margin: 6px 0 0; color: #5b5242; font-size: 13.5px; max-width: 620px; line-height: 1.5; }
.ud-langkah { display: flex; flex-wrap: wrap; gap: 6px; }
.ud-langkah span { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #5b5242; background: #fff; border: 1px solid var(--garis); border-radius: 99px; padding: 4px 10px 4px 4px; }
.ud-langkah i { width: 20px; height: 20px; border-radius: 50%; background: var(--hutan); color: #fff; font-style: normal; display: grid; place-items: center; font-size: 11px; }
.ud-tata { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 18px; align-items: start; max-width: 1150px; }
.ud-kartu { background: #fff; border: 1px solid var(--garis); border-radius: 22px; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.ud-kartu h3 { margin: 0; font-family: var(--serif); font-size: 19px; }
.ud-buat { position: sticky; top: 12px; }
.ud-f { display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #5b5242; }
.ud-f small { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--redup); }
.ud-f input { text-transform: none; letter-spacing: 0; font: inherit; font-weight: 500; font-size: 14px; border: 1px solid var(--garis); border-radius: 12px; padding: 10px 12px; background: #fdfcf9; color: var(--tinta); }
.ud-f input:focus { outline: none; border-color: #2f6b4f; box-shadow: 0 0 0 3px rgba(47, 107, 79, .13); }
.ud-dept { display: flex; flex-wrap: wrap; gap: 5px; text-transform: none; letter-spacing: 0; }
.ud-dept button { --c: #1f4d3a; border: 1px solid var(--garis); background: #fff; border-radius: 99px; padding: 5px 10px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; color: var(--tinta); }
.ud-dept button.on { background: var(--c); border-color: var(--c); color: #fff; }
.ud-btn { border: 1px solid var(--garis); background: #fff; color: var(--tinta); border-radius: 999px; padding: 9px 16px; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.ud-btn.utama { background: var(--hutan); border-color: var(--hutan); color: #f7f3ea; padding: 11px 16px; font-size: 14px; }
.ud-btn.wa { background: #1f7a4a; border-color: #1f7a4a; color: #fff; }
.ud-btn:disabled { opacity: .5; cursor: default; }
.ud-galat { margin: 0; padding: 9px 12px; border-radius: 12px; background: #fdecea; color: #b42318; font-size: 13px; }
.ud-hasil { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 16px; background: linear-gradient(150deg, #e6f3ea, #fff 80%); border: 1px dashed #9cc7ab; animation: ud-muncul .3s; }
@keyframes ud-muncul { from { opacity: 0; transform: translateY(6px); } }
.ud-hasil small { font-weight: 800; color: var(--hutan); }
.ud-link { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; background: #fff; border: 1px solid var(--garis); border-radius: 10px; padding: 8px 10px; user-select: all; }
.ud-hasil-aksi { display: flex; flex-wrap: wrap; gap: 6px; }
.ud-daftar-kepala { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.ud-segmen { display: inline-flex; background: #f3eee3; border-radius: 999px; padding: 3px; gap: 2px; }
.ud-segmen button { border: 0; background: none; padding: 6px 12px; border-radius: 999px; font: inherit; font-size: 12.5px; font-weight: 700; color: #6b6253; cursor: pointer; }
.ud-segmen button.on { background: #fff; color: var(--hutan); box-shadow: 0 1px 4px rgba(28, 42, 34, .12); }
.ud-segmen i { font-style: normal; font-size: 11px; color: var(--redup); margin-left: 3px; }
.ud-kosong { text-align: center; padding: 30px 10px; color: var(--redup); font-size: 13.5px; }
.ud-daftar { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ud-daftar li { --c: #1f4d3a; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--garis); border-left: 4px solid var(--c); border-radius: 16px; background: #fff; }
.ud-daftar li.s-revoked, .ud-daftar li.s-expired { opacity: .55; }
.ud-daftar li.s-used { background: #f6fbf7; }
.ud-ikon { font-size: 20px; }
.ud-isi { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ud-isi b { font-family: var(--serif); font-size: 15px; }
.ud-isi small { font-size: 11.5px; color: var(--redup); }
.ud-dept-teks { font-weight: 800; color: var(--c); }
.ud-status { display: flex; flex-direction: column; align-items: flex-end; }
.ud-lencana { font-size: 11.5px; font-weight: 800; padding: 2px 9px; border-radius: 99px; background: #f3eee3; color: #5b5242; }
.s-pending .ud-lencana { background: #fdf3e2; color: #8a5a00; }
.s-used .ud-lencana { background: #e6f3ea; color: var(--hutan); }
.ud-status small { font-size: 11px; color: var(--redup); margin-top: 2px; }
.ud-aksi { display: flex; gap: 4px; }
.ud-aksi button, .ud-aksi a { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--garis); background: #fff; cursor: pointer; display: grid; place-items: center; text-decoration: none; font-size: 13px; color: var(--tinta); }
.ud-aksi button:hover, .ud-aksi a:hover { background: #f6f1e6; }
.ud-aksi .bahaya:hover { background: #fdecea; color: #b42318; }
@media (max-width: 950px) { .ud-tata { grid-template-columns: 1fr; } .ud-buat { position: static; } }
@media (max-width: 640px) { .ud { padding: 12px 12px 40px; } .ud-kepala h1 { font-size: 26px; } .ud-daftar li { flex-wrap: wrap; } }
</style>
