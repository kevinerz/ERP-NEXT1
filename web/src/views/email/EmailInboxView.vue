<script setup lang="ts">
// Email — tampilan 3 kolom (folder · daftar · baca), responsif sampai HP.
// Fitur: hitungan folder, bintang, pilih banyak + aksi massal, filter cepat, balas / balas semua / teruskan,
// gambar inline, isi email di iframe terisolasi, pintasan keyboard, refresh otomatis, kuota mailbox.
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import DOMPurify from 'dompurify'
import { useEmailStore, type InboxMessage } from '@/stores/email'
import BasePagination from '@/components/BasePagination.vue'
import RecipientInput from '@/components/RecipientInput.vue'
import { fmtDateTime, escapeHtml } from '@/composables/useFormat'
import api from '@/services/api'
import { promptDialog, confirmDialog, toast } from '@/composables/useDialog'

const email = useEmailStore()
const fitur = computed(() => email.account?.fitur ?? { bintang: true, massal: true, kuota: false, draf: true, hitung_folder: false })

// ─── CONNECT ──────────────────────────────────────────────────
const connecting = ref(false)
const connectError = ref('')
const form = ref({ email_address: '', password: '', imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 465 })
const apiMailboxes = ref<{ address: string }[]>([])
async function muatApiMailboxes() {
  try { apiMailboxes.value = (await api.get('/email/api-mailboxes')).data.data ?? [] } catch { apiMailboxes.value = [] }
}
async function setelahTerhubung() {
  await email.fetchAccount()
  await Promise.all([email.fetchFolders(), loadInbox(), fitur.value.kuota ? email.fetchKuota() : null])
}
async function hubungkanApi(address: string) {
  connecting.value = true; connectError.value = ''
  try { await api.post('/email/account/api', { email_address: address }); await setelahTerhubung() }
  catch (e: any) { connectError.value = e.response?.data?.message || 'Gagal terhubung lewat API' }
  finally { connecting.value = false }
}
watch(() => email.accountChecked && !email.account, (perlu) => { if (perlu) muatApiMailboxes() }, { immediate: true })
function pakaiPresetHostinger() {
  form.value.imap_host = 'imap.hostinger.com'; form.value.imap_port = 993
  form.value.smtp_host = 'smtp.hostinger.com'; form.value.smtp_port = 465
}
async function handleConnect() {
  if (!form.value.email_address || !form.value.password || !form.value.imap_host || !form.value.smtp_host) {
    connectError.value = 'Semua field wajib diisi'; return
  }
  connecting.value = true; connectError.value = ''
  try { await email.connect(form.value); await setelahTerhubung() }
  catch (e: any) { connectError.value = e.response?.data?.message || 'Gagal terhubung' }
  finally { connecting.value = false }
}
async function putuskan() {
  if (!(await confirmDialog({ title: 'Putuskan koneksi email?', message: `Koneksi ${email.account?.email_address} akan diputus. Bisa dihubungkan lagi kapan saja.`, confirmLabel: 'Putuskan', variant: 'warning' }))) return
  try { await email.disconnect() } catch (e: any) { toast(e.response?.data?.message || 'Gagal memutuskan koneksi', 'danger') }
}

// ─── FOLDER, DAFTAR, FILTER ───────────────────────────────────
const FOLDER_IKON: Record<string, string> = { inbox: '📥', sent: '📤', drafts: '📝', trash: '🗑️', junk: '🚫' }
const page = ref(1)
const search = ref('')
const cariRef = ref<HTMLInputElement | null>(null)
const filterCepat = ref<'semua' | 'belum' | 'bintang' | 'lampiran'>('semua')
const selectedUid = ref<number | null>(null)
const dipilih = ref<Set<number>>(new Set())
const folderAktif = computed(() => email.folders.find((f) => f.key === email.currentFolder))
const diTerkirim = computed(() => email.currentFolder === 'sent' || email.currentFolder === 'drafts')

async function loadInbox(diam = false) {
  await email.fetchMessages({ page: page.value, search: search.value || undefined }, diam)
}
function doSearch() { page.value = 1; dipilih.value = new Set(); loadInbox() }
function hapusCari() { search.value = ''; doSearch() }
function goPage(p: number) { page.value = p; dipilih.value = new Set(); loadInbox() }
async function pilihFolder(key: string) {
  if (email.currentFolder === key) return
  page.value = 1; search.value = ''; filterCepat.value = 'semua'
  selectedUid.value = null; dipilih.value = new Set()
  await email.switchFolder(key)
}

const daftar = computed(() => email.list.filter((m) =>
  filterCepat.value === 'belum' ? !m.seen
  : filterCepat.value === 'bintang' ? m.flagged
  : filterCepat.value === 'lampiran' ? m.hasAttachments
  : true))

// Kelompok tanggal: Hari ini / Kemarin / Minggu ini / Bulan ini / Lebih lama
function kelompok(d: string | null) {
  if (!d) return 'Lainnya'
  const t = new Date(d), n = new Date()
  const hari = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const selisih = Math.round((hari(n) - hari(t)) / 86_400_000)
  if (selisih <= 0) return 'Hari ini'
  if (selisih === 1) return 'Kemarin'
  if (selisih < 7) return 'Minggu ini'
  if (t.getMonth() === n.getMonth() && t.getFullYear() === n.getFullYear()) return 'Bulan ini'
  return t.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}
const daftarBerkelompok = computed(() => {
  const out: { judul: string; isi: InboxMessage[] }[] = []
  for (const m of daftar.value) {
    const k = kelompok(m.date)
    const g = out[out.length - 1]
    if (g && g.judul === k) g.isi.push(m); else out.push({ judul: k, isi: [m] })
  }
  return out
})

function jamPendek(d: string | null) {
  if (!d) return ''
  const t = new Date(d), n = new Date()
  if (t.toDateString() === n.toDateString()) return t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  if (t.getFullYear() === n.getFullYear()) return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' })
}
// Avatar inisial berwarna — warna tetap per alamat
const WARNA_AVATAR = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#e87ba4', '#0e9fb3', '#eda100', '#e34948']
function namaTampil(m: InboxMessage) {
  return diTerkirim.value ? (m.to ? `Kepada: ${m.to}` : '(tanpa penerima)') : (m.from?.name || m.from?.address || '(tanpa pengirim)')
}
function avatar(teks: string) {
  const bersih = teks.replace(/^Kepada:\s*/, '').trim()
  const kata = bersih.replace(/[<>@.].*$/, '').split(/\s+/).filter(Boolean)
  const inisial = ((kata[0]?.[0] ?? '?') + (kata[1]?.[0] ?? '')).toUpperCase()
  let h = 0; for (const c of bersih) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { inisial, warna: WARNA_AVATAR[h % WARNA_AVATAR.length] }
}

// ─── PILIH BANYAK & AKSI MASSAL ───────────────────────────────
const semuaDipilih = computed(() => daftar.value.length > 0 && daftar.value.every((m) => dipilih.value.has(m.uid)))
function togglePilih(uid: number) {
  const s = new Set(dipilih.value); s.has(uid) ? s.delete(uid) : s.add(uid); dipilih.value = s
}
function togglePilihSemua() {
  dipilih.value = semuaDipilih.value ? new Set() : new Set(daftar.value.map((m) => m.uid))
}
const prosesMassal = ref(false)
async function aksiMassal(aksi: string) {
  const uids = [...dipilih.value]
  if (!uids.length) return
  if (aksi === 'hapus' && !(await confirmDialog({ title: `Hapus permanen ${uids.length} email?`, message: 'Email yang dihapus permanen tidak bisa dikembalikan.', confirmLabel: 'Hapus permanen', variant: 'danger' }))) return
  prosesMassal.value = true
  try {
    toast(await email.massal(uids, aksi))
    dipilih.value = new Set()
    if (selectedUid.value && uids.includes(selectedUid.value) && ['sampah', 'hapus', 'spam', 'inbox'].includes(aksi)) selectedUid.value = null
    email.fetchFolders()
  } catch (e: any) { toast(e.response?.data?.message || 'Aksi gagal', 'danger') }
  finally { prosesMassal.value = false }
}

// ─── BACA ─────────────────────────────────────────────────────
function parseEmails(str: string): string[] {
  if (!str) return []
  return str.split(',').map((s) => { const m = s.match(/<([^>]+)>/); return (m ? m[1]! : s).trim().toLowerCase() }).filter((s) => s.includes('@'))
}
async function openMessage(uid: number) {
  if (email.currentFolder === 'drafts' && fitur.value.draf) { await bukaEditDraft(uid); return }
  selectedUid.value = uid
  await email.fetchMessage(uid)
  if (fitur.value.hitung_folder) email.fetchFolders()
}
async function bintang(m: { uid: number; flagged?: boolean }) {
  try { await email.setFlagged(m.uid, !m.flagged) } catch (e: any) { toast(e.response?.data?.message || 'Gagal memberi bintang', 'danger') }
}
async function tandaiBelum() {
  if (!email.current) return
  try { await email.setSeen(email.current.uid, false); toast('Ditandai belum dibaca'); selectedUid.value = null; email.fetchFolders() }
  catch { toast(email.error || 'Gagal', 'danger') }
}
async function pindahSatu(aksi: 'sampah' | 'spam' | 'inbox' | 'hapus') {
  if (!email.current) return
  const uid = email.current.uid
  if (aksi === 'hapus' && !(await confirmDialog({ title: 'Hapus permanen?', message: 'Email ini akan dihapus permanen dan tidak bisa dikembalikan.', confirmLabel: 'Hapus permanen', variant: 'danger' }))) return
  if (email.currentFolder === 'drafts') {
    if (!(await confirmDialog({ title: 'Hapus draf?', message: 'Draf ini akan dihapus.', confirmLabel: 'Hapus', variant: 'danger' }))) return
    try { await email.deleteDraft(uid); selectedUid.value = null; toast('Draf dihapus') } catch { toast('Gagal menghapus draf', 'danger') }
    return
  }
  try { toast(await email.massal([uid], aksi)); selectedUid.value = null; email.fetchFolders() }
  catch (e: any) { toast(e.response?.data?.message || 'Aksi gagal', 'danger') }
}
async function unduhLampiran(uid: number, partId: number, filename: string) {
  try { await email.downloadAttachment(uid, partId, filename) } catch (e: any) {
    let msg = ''
    const data = e.response?.data
    if (data instanceof Blob) { try { msg = JSON.parse(await data.text())?.message || '' } catch { /* bukan JSON */ } } else msg = data?.message || ''
    toast(msg || 'Gagal mengunduh lampiran', 'danger')
  }
}
function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function ikonFile(nama: string, tipe: string) {
  const n = nama.toLowerCase()
  if (tipe.startsWith('image/')) return '🖼️'
  if (n.endsWith('.pdf')) return '📕'
  if (/\.(xlsx?|csv)$/.test(n)) return '📊'
  if (/\.(docx?|odt)$/.test(n)) return '📘'
  if (/\.(zip|rar|7z)$/.test(n)) return '🗜️'
  if (/\.(rsc|txt|log|conf)$/.test(n)) return '📄'
  return '📎'
}

// Isi email ditampilkan di iframe terisolasi: CSS email tidak bocor ke aplikasi & sebaliknya.
// Tanpa allow-scripts → skrip di email tidak bisa jalan. HTML tetap disanitasi DOMPurify.
const iframeRef = ref<HTMLIFrameElement | null>(null)
const tinggiIsi = ref(300)
const srcdoc = computed(() => {
  const c = email.current
  if (!c) return ''
  const isi = c.html
    ? DOMPurify.sanitize(c.html, { ADD_ATTR: ['target'], WHOLE_DOCUMENT: false })
    : `<pre style="white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif;margin:0">${escapeHtml(c.text || '(email tanpa isi)')}</pre>`
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;padding:0;background:#fff;color:#1f2937;font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}
    body{padding:4px 2px}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}
    blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #cbd5e1;color:#475569}
  </style></head><body>${isi}</body></html>`
})
function ukurIframe() {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  tinggiIsi.value = Math.max(160, doc.documentElement.scrollHeight + 8)
  // gambar yang telat dimuat mengubah tinggi
  doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', () => { tinggiIsi.value = Math.max(160, doc.documentElement.scrollHeight + 8) }))
}
function cetak() { iframeRef.value?.contentWindow?.print() }

// ─── TULIS / BALAS / TERUSKAN / DRAF ──────────────────────────
const showCompose = ref(false)
const composeForm = ref({ subject: '', html: '', in_reply_to: '' })
const composeRef = ref<{ jenis: 'balas' | 'teruskan'; uid: number; folder: string } | null>(null)
const toTags = ref<string[]>([]); const ccTags = ref<string[]>([]); const bccTags = ref<string[]>([])
const composeFiles = ref<File[]>([])
const sending = ref(false); const savingDraft = ref(false)
const sendError = ref('')
const showCc = ref(false)
const editingDraftUid = ref<number | null>(null)
const editorRef = ref<HTMLElement | null>(null)
const showEmoji = ref(false)
const contacts = ref<{ nama_lengkap: string; email: string }[]>([])
const EMOJIS = ['😀', '😊', '🙏', '👍', '✅', '❗', '📌', '📎', '📧', '📞', '🔴', '🟢', '⚠️', '💰', '📈', '🎉', '🚀', '🗓️']
const judulCompose = computed(() => editingDraftUid.value ? '📝 Edit Draf' : composeRef.value?.jenis === 'balas' ? '↩️ Balas' : composeRef.value?.jenis === 'teruskan' ? '➡️ Teruskan' : '✏️ Email Baru')

async function loadContacts() {
  if (contacts.value.length) return
  try { contacts.value = (await api.get('/email/contacts')).data.data } catch { /* opsional */ }
}
function onEditorInput() { composeForm.value.html = editorRef.value?.innerHTML || '' }
function exec(cmd: string, val?: string) { document.execCommand(cmd, false, val); editorRef.value?.focus(); onEditorInput() }
async function addLink() {
  const sel = window.getSelection()
  const savedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
  const url = await promptDialog({ title: 'Sisip Tautan', label: 'URL', placeholder: 'https://contoh.com', inputType: 'url', confirmLabel: 'Sisipkan' })
  if (!url) return
  editorRef.value?.focus()
  if (savedRange) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(savedRange) }
  exec('createLink', url)
}
function insertEmoji(em: string) { editorRef.value?.focus(); document.execCommand('insertText', false, em); onEditorInput(); showEmoji.value = false }

let snapshotCompose = ''
function isiCompose() {
  return JSON.stringify([toTags.value, ccTags.value, bccTags.value, composeForm.value.subject, editorRef.value?.innerHTML ?? composeForm.value.html, composeFiles.value.length])
}
watch(showCompose, (open) => {
  if (!open) { showEmoji.value = false; return }
  loadContacts()
  nextTick(() => {
    if (editorRef.value) editorRef.value.innerHTML = DOMPurify.sanitize(composeForm.value.html || '', { ADD_ATTR: ['target'] })
    snapshotCompose = isiCompose()
    ;(toTags.value.length ? editorRef.value : document.querySelector<HTMLInputElement>('.cm-kepada input'))?.focus()
  })
})
function bodyAsHtml(msg: { html?: string | null; text?: string | null }) {
  return msg.html || escapeHtml(msg.text || '').replace(/\n/g, '<br>')
}
function bukaCompose() {
  editingDraftUid.value = null; composeRef.value = null
  toTags.value = []; ccTags.value = []; bccTags.value = []
  composeForm.value = { subject: '', html: '', in_reply_to: '' }
  composeFiles.value = []; showCc.value = false; sendError.value = ''
  showCompose.value = true
}
async function bukaEditDraft(uid: number) {
  await email.fetchMessage(uid)
  if (!email.current) return
  editingDraftUid.value = uid; composeRef.value = null
  toTags.value = parseEmails(email.current.to || ''); ccTags.value = parseEmails(email.current.cc || ''); bccTags.value = parseEmails(email.current.bcc || '')
  composeForm.value = { subject: email.current.subject === '(tanpa subjek)' ? '' : email.current.subject, html: bodyAsHtml(email.current), in_reply_to: '' }
  composeFiles.value = []; showCc.value = ccTags.value.length > 0 || bccTags.value.length > 0; sendError.value = ''
  showCompose.value = true
}
function kutipan(c: NonNullable<typeof email.current>, judul: string) {
  return `<br><br><div style="color:#64748b;font-size:13px">${judul}</div><blockquote>${bodyAsHtml(c)}</blockquote>`
}
function bukaBalas(semua = false) {
  const c = email.current
  if (!c) return
  const saya = (email.account?.email_address || '').toLowerCase()
  const dari = (c.from_address || parseEmails(c.from || '')[0] || '').toLowerCase()
  editingDraftUid.value = null
  composeRef.value = { jenis: 'balas', uid: c.uid, folder: email.currentFolder }
  // Dari folder Terkirim, "balas" berarti menulis lagi ke penerima asal
  const tujuan = email.currentFolder === 'sent' ? (c.to_list ?? parseEmails(c.to || '')) : (dari ? [dari] : [])
  toTags.value = [...new Set(tujuan.map((x) => x.toLowerCase()))]
  ccTags.value = semua
    ? [...new Set([...(c.to_list ?? parseEmails(c.to || '')), ...(c.cc_list ?? parseEmails(c.cc || ''))].map((x) => x.toLowerCase()))].filter((x) => x !== saya && !toTags.value.includes(x))
    : []
  bccTags.value = []
  composeForm.value = {
    subject: /^re:/i.test(c.subject) ? c.subject : `Re: ${c.subject}`,
    html: kutipan(c, `Pada ${fmtDateTime(c.date)}, ${escapeHtml(c.from || '')} menulis:`),
    in_reply_to: String(c.uid),
  }
  composeFiles.value = []; showCc.value = ccTags.value.length > 0; sendError.value = ''
  showCompose.value = true
}
function bukaTeruskan() {
  const c = email.current
  if (!c) return
  editingDraftUid.value = null
  composeRef.value = { jenis: 'teruskan', uid: c.uid, folder: email.currentFolder }
  toTags.value = []; ccTags.value = []; bccTags.value = []
  const info = `---------- Pesan diteruskan ----------<br>Dari: ${escapeHtml(c.from || '')}<br>Tanggal: ${fmtDateTime(c.date)}<br>Subjek: ${escapeHtml(c.subject)}<br>Kepada: ${escapeHtml(c.to || '')}`
  composeForm.value = { subject: /^fwd?:/i.test(c.subject) ? c.subject : `Fwd: ${c.subject}`, html: kutipan(c, info), in_reply_to: '' }
  composeFiles.value = []; showCc.value = false; sendError.value = ''
  showCompose.value = true
}
function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) composeFiles.value = [...composeFiles.value, ...Array.from(input.files)]
  input.value = ''
}
const seretMasuk = ref(false)
function jatuhkanFile(e: DragEvent) {
  seretMasuk.value = false
  if (e.dataTransfer?.files?.length) composeFiles.value = [...composeFiles.value, ...Array.from(e.dataTransfer.files)]
}
function hapusFile(i: number) { composeFiles.value.splice(i, 1) }
const totalLampiran = computed(() => composeFiles.value.reduce((s, f) => s + f.size, 0))

async function tutupCompose() {
  if (sending.value || savingDraft.value) return
  if (isiCompose() !== snapshotCompose) {
    const buang = await confirmDialog({ title: 'Buang email ini?', message: fitur.value.draf ? 'Isi email belum dikirim dan belum disimpan. Klik "Simpan Draf" kalau ingin melanjutkannya nanti.' : 'Isi email belum dikirim dan akan hilang.', confirmLabel: 'Buang', variant: 'danger' })
    if (!buang) return
  }
  showCompose.value = false
}
function buildPayload() {
  onEditorInput()
  return {
    ...composeForm.value,
    to: toTags.value.join(', '), cc: ccTags.value.join(', '), bcc: bccTags.value.join(', '),
    ...(composeRef.value ? { ref_jenis: composeRef.value.jenis, ref_uid: String(composeRef.value.uid), ref_folder: composeRef.value.folder } : {}),
  }
}
async function kirimEmail() {
  if (sending.value || savingDraft.value) return
  if (!toTags.value.length) { sendError.value = 'Isi minimal satu penerima'; return }
  if (!composeForm.value.subject.trim()) {
    if (!(await confirmDialog({ title: 'Kirim tanpa subjek?', message: 'Email tanpa subjek mudah terlewat atau masuk spam.', confirmLabel: 'Tetap kirim' }))) return
  }
  sending.value = true; sendError.value = ''
  try {
    await email.sendMail(buildPayload(), composeFiles.value, editingDraftUid.value)
    showCompose.value = false
    toast(`Email "${composeForm.value.subject || '(tanpa subjek)'}" terkirim 🚀`)
    if (email.currentFolder === 'sent' || email.currentFolder === 'drafts') await loadInbox(true)
    email.fetchFolders()
  } catch (e: any) { sendError.value = e.response?.data?.message || 'Gagal mengirim email' }
  finally { sending.value = false }
}
async function simpanDraf() {
  if (sending.value || savingDraft.value) return
  savingDraft.value = true; sendError.value = ''
  try {
    const newUid = await email.saveDraft(buildPayload(), composeFiles.value, editingDraftUid.value)
    editingDraftUid.value = newUid ?? editingDraftUid.value
    showCompose.value = false
    toast('Draf disimpan')
    if (email.currentFolder === 'drafts') await loadInbox(true)
  } catch (e: any) { sendError.value = e.response?.data?.message || 'Gagal menyimpan draf' }
  finally { savingDraft.value = false }
}

// ─── PINTASAN KEYBOARD ────────────────────────────────────────
const tampilPintasan = ref(false)
function pindahPilihan(arah: 1 | -1) {
  const l = daftar.value
  if (!l.length) return
  const i = l.findIndex((m) => m.uid === selectedUid.value)
  const next = l[Math.min(l.length - 1, Math.max(0, i < 0 ? 0 : i + arah))]
  if (next) { openMessage(next.uid); nextTick(() => document.querySelector(`[data-uid="${next.uid}"]`)?.scrollIntoView({ block: 'nearest' })) }
}
function tombol(e: KeyboardEvent) {
  if (!email.account || e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target as HTMLElement
  if (t.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.dh-overlay')) return
  if (showCompose.value) return
  const ada = !!email.current && selectedUid.value !== null
  const peta: Record<string, () => void> = {
    j: () => pindahPilihan(1), k: () => pindahPilihan(-1),
    c: bukaCompose, '/': () => cariRef.value?.focus(), '?': () => (tampilPintasan.value = !tampilPintasan.value),
    Escape: () => { selectedUid.value = null; tampilPintasan.value = false },
    ...(ada ? {
      r: () => bukaBalas(false), a: () => bukaBalas(true), f: bukaTeruskan,
      s: () => bintang(email.current!), u: tandaiBelum,
      '#': () => pindahSatu(email.currentFolder === 'trash' ? 'hapus' : 'sampah'),
    } : {}),
  }
  const fn = peta[e.key]
  if (fn) { e.preventDefault(); fn() }
}

// ─── MULAI & REFRESH OTOMATIS ─────────────────────────────────
let timer: ReturnType<typeof setInterval> | null = null
onMounted(async () => {
  window.addEventListener('keydown', tombol)
  await email.fetchAccount()
  if (email.account) {
    await Promise.all([email.fetchFolders(), loadInbox(), fitur.value.kuota ? email.fetchKuota() : null])
  }
  // Kotak masuk diperbarui diam-diam tiap 60 detik (tidak mengganggu pilihan / bacaan)
  timer = setInterval(() => {
    if (!email.account || document.hidden || showCompose.value || dipilih.value.size || page.value !== 1 || search.value) return
    loadInbox(true); email.fetchFolders()
  }, 60_000)
})
onUnmounted(() => { window.removeEventListener('keydown', tombol); if (timer) clearInterval(timer) })

const totalPages = computed(() => Math.max(1, Math.ceil(email.meta.total / email.meta.limit)))
const belumDibacaTotal = computed(() => email.folders.find((f) => f.key === 'inbox')?.unread ?? null)
// Angka kuota dari Hostinger dalam KB (satuan IMAP QUOTA), walau dokumentasinya menyebut byte
const kuotaPersen = computed(() => {
  const k = email.kuota
  return k && k.totalLimit ? Math.min(100, Math.round((k.totalUsage / k.totalLimit) * 1000) / 10) : 0
})
const fmtGB = (kb: number) => {
  const b = kb * 1024
  return b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`
}
</script>

<template>
  <div class="page em">
    <!-- ════════════ BELUM TERHUBUNG ════════════ -->
    <div v-if="email.accountChecked && !email.account" class="sambung">
      <div class="sambung-kartu">
        <div class="sambung-ikon">📬</div>
        <h2>Hubungkan Email</h2>
        <p class="sub">Baca, balas, dan kirim email kantor langsung dari ERP.</p>
        <div v-if="apiMailboxes.length" class="api-box">
          <p class="api-judul">⚡ Tersedia lewat Hostinger Mail API — tanpa password, cepat &amp; stabil</p>
          <button v-for="m in apiMailboxes" :key="m.address" type="button" class="btn-api" :disabled="connecting" @click="hubungkanApi(m.address)">
            Hubungkan {{ m.address }}
          </button>
          <p class="api-atau">atau hubungkan alamat lain dengan IMAP/SMTP:</p>
        </div>
        <button type="button" class="btn-preset" @click="pakaiPresetHostinger">⚡ Isi server Hostinger otomatis</button>
        <label class="fl">Alamat Email<input v-model="form.email_address" type="email" placeholder="nama@next1.co.id" autocomplete="username" /></label>
        <label class="fl">Password<input v-model="form.password" type="password" placeholder="Password email" autocomplete="current-password" /></label>
        <div class="fl-baris">
          <label class="fl">Server Masuk (IMAP)<input v-model="form.imap_host" placeholder="imap.hostinger.com" /></label>
          <label class="fl kecil">Port<input v-model.number="form.imap_port" type="number" /></label>
        </div>
        <div class="fl-baris">
          <label class="fl">Server Keluar (SMTP)<input v-model="form.smtp_host" placeholder="smtp.hostinger.com" /></label>
          <label class="fl kecil">Port<input v-model.number="form.smtp_port" type="number" /></label>
        </div>
        <p v-if="connectError" class="pesan-err" role="alert">{{ connectError }}</p>
        <button type="button" class="btn-utama lebar" :disabled="connecting" @click="handleConnect">{{ connecting ? 'Menghubungkan…' : 'Hubungkan' }}</button>
        <p class="catatan">🔒 Password disimpan terenkripsi dan hanya dipakai untuk kotak surat Anda sendiri.</p>
      </div>
    </div>

    <!-- ════════════ KOTAK SURAT ════════════ -->
    <div v-else-if="email.account" :class="['em-tata', { 'ada-baca': selectedUid !== null }]">
      <!-- Kolom 1: folder -->
      <aside class="em-samping">
        <button type="button" class="btn-tulis" @click="bukaCompose"><span>✏️</span> Tulis Email</button>
        <nav class="em-folder" aria-label="Folder email">
          <button v-for="f in email.folders" :key="f.key" type="button" :class="['fd', { aktif: email.currentFolder === f.key }]"
            :aria-current="email.currentFolder === f.key ? 'page' : undefined" @click="pilihFolder(f.key)">
            <span class="fd-ikon">{{ FOLDER_IKON[f.key] ?? '📁' }}</span>
            <span class="fd-nama">{{ f.label }}</span>
            <span v-if="f.unread && f.key !== 'sent'" class="fd-jml" :class="{ panas: f.key === 'inbox' }">{{ f.unread > 999 ? '999+' : f.unread }}</span>
            <span v-else-if="f.total != null && ['drafts', 'trash', 'junk'].includes(f.key) && f.total" class="fd-jml redup">{{ f.total }}</span>
          </button>
        </nav>
        <div class="em-akun">
          <div class="akun-alamat" :title="email.account.email_address">{{ email.account.email_address }}</div>
          <span v-if="email.account.via_api" class="lencana-api" title="Dilayani Hostinger Mail API lewat HTTPS">⚡ Hostinger API</span>
          <span v-else class="lencana-api imap">IMAP/SMTP</span>
          <div v-if="email.kuota" class="kuota" :title="`${fmtGB(email.kuota.totalUsage)} dari ${fmtGB(email.kuota.totalLimit)}`">
            <div class="kuota-bar"><span :style="{ width: `${kuotaPersen}%` }" :class="{ penuh: kuotaPersen >= 90, hampir: kuotaPersen >= 75 && kuotaPersen < 90 }" /></div>
            <small>{{ fmtGB(email.kuota.totalUsage) }} dari {{ fmtGB(email.kuota.totalLimit) }} terpakai ({{ kuotaPersen }}%)</small>
          </div>
          <div class="akun-aksi">
            <button type="button" class="link" @click="tampilPintasan = true">⌨️ Pintasan</button>
            <button type="button" class="link merah" @click="putuskan">Putuskan</button>
          </div>
        </div>
      </aside>

      <!-- Kolom 2: daftar -->
      <section class="em-daftar" aria-label="Daftar email">
        <div class="dl-kepala">
          <div class="dl-judul">
            <h2>{{ FOLDER_IKON[email.currentFolder] }} {{ folderAktif?.label ?? 'Email' }}</h2>
            <small>{{ email.meta.total.toLocaleString('id-ID') }} email<template v-if="email.currentFolder === 'inbox' && belumDibacaTotal"> · {{ belumDibacaTotal }} belum dibaca</template></small>
          </div>
          <button type="button" class="ikon-btn" title="Muat ulang" aria-label="Muat ulang" :class="{ putar: email.loading }" @click="loadInbox(); email.fetchFolders()">↻</button>
        </div>
        <form class="dl-cari" role="search" @submit.prevent="doSearch">
          <span aria-hidden="true">🔍</span>
          <input ref="cariRef" v-model="search" type="search" placeholder="Cari subjek, pengirim, isi…  ( / )" aria-label="Cari email" />
          <button v-if="search" type="button" class="x" aria-label="Hapus pencarian" @click="hapusCari">✕</button>
        </form>
        <div class="dl-chip" role="tablist" aria-label="Filter cepat">
          <button v-for="c in ([['semua', 'Semua'], ['belum', 'Belum dibaca'], ['bintang', '⭐ Berbintang'], ['lampiran', '📎 Lampiran']] as const)" :key="c[0]" type="button"
            role="tab" :aria-selected="filterCepat === c[0]" :class="{ on: filterCepat === c[0] }" @click="filterCepat = c[0]">{{ c[1] }}</button>
        </div>

        <!-- bilah aksi massal -->
        <div v-if="fitur.massal && email.list.length" :class="['dl-massal', { aktif: dipilih.size }]">
          <label class="cek"><input type="checkbox" :checked="semuaDipilih" :indeterminate.prop="dipilih.size > 0 && !semuaDipilih" @change="togglePilihSemua" /><span>{{ dipilih.size ? `${dipilih.size} dipilih` : 'Pilih semua' }}</span></label>
          <template v-if="dipilih.size">
            <button type="button" title="Tandai dibaca" :disabled="prosesMassal" @click="aksiMassal('baca')">✉️</button>
            <button type="button" title="Tandai belum dibaca" :disabled="prosesMassal" @click="aksiMassal('belum')">📩</button>
            <button type="button" title="Beri bintang" :disabled="prosesMassal" @click="aksiMassal('bintang')">⭐</button>
            <button v-if="email.currentFolder === 'junk' || email.currentFolder === 'trash'" type="button" title="Pindah ke Kotak Masuk" :disabled="prosesMassal" @click="aksiMassal('inbox')">📥</button>
            <button v-else-if="email.currentFolder === 'inbox'" type="button" title="Tandai spam" :disabled="prosesMassal" @click="aksiMassal('spam')">🚫</button>
            <button v-if="email.currentFolder !== 'trash'" type="button" title="Pindah ke Sampah" :disabled="prosesMassal" @click="aksiMassal('sampah')">🗑️</button>
            <button v-else type="button" class="bahaya" title="Hapus permanen" :disabled="prosesMassal" @click="aksiMassal('hapus')">Hapus permanen</button>
          </template>
        </div>

        <div class="dl-isi">
          <div v-if="email.loading && !email.list.length" class="kerangka">
            <div v-for="i in 7" :key="i" class="krg"><span class="krg-av" /><span class="krg-garis" /><span class="krg-garis pendek" /></div>
          </div>
          <div v-else-if="email.error && !email.list.length" class="dl-kosong merah" role="alert">😵 {{ email.error }} <button type="button" class="link" @click="loadInbox()">Coba lagi</button></div>
          <div v-else-if="!daftar.length" class="dl-kosong">
            <span class="maskot">{{ search ? '🔎' : filterCepat !== 'semua' ? '🧹' : '📭' }}</span>
            {{ search ? `Tidak ada email yang cocok dengan “${search}”` : filterCepat !== 'semua' ? 'Tidak ada email untuk filter ini di halaman ini' : 'Folder ini kosong' }}
          </div>
          <template v-else>
            <template v-for="g in daftarBerkelompok" :key="g.judul">
              <div class="dl-grup">{{ g.judul }}</div>
              <div v-for="m in g.isi" :key="m.uid" v-baris :data-uid="m.uid"
                :class="['br', { belum: !m.seen, aktif: selectedUid === m.uid, dipilih: dipilih.has(m.uid) }]"
                @click="openMessage(m.uid)">
                <span v-if="fitur.massal" class="br-cek" @click.stop>
                  <input type="checkbox" :checked="dipilih.has(m.uid)" :aria-label="`Pilih ${m.subject}`" @change="togglePilih(m.uid)" />
                </span>
                <span class="br-av" :style="{ background: avatar(namaTampil(m)).warna }" aria-hidden="true">{{ avatar(namaTampil(m)).inisial }}</span>
                <span class="br-teks">
                  <span class="br-atas">
                    <span class="br-nama">{{ namaTampil(m) }}</span>
                    <span class="br-tgl">{{ jamPendek(m.date) }}</span>
                  </span>
                  <span class="br-subjek">
                    <span v-if="m.answered" class="br-balas" title="Sudah dibalas">↩</span>{{ m.subject }}
                  </span>
                  <span class="br-ikon">
                    <span v-if="m.hasAttachments" title="Ada lampiran">📎</span>
                  </span>
                </span>
                <button v-if="fitur.bintang && email.currentFolder !== 'drafts'" type="button" :class="['br-bintang', { on: m.flagged }]"
                  :aria-label="m.flagged ? 'Lepas bintang' : 'Beri bintang'" :title="m.flagged ? 'Lepas bintang' : 'Beri bintang'" @click.stop="bintang(m)">{{ m.flagged ? '★' : '☆' }}</button>
              </div>
            </template>
          </template>
        </div>
        <BasePagination v-if="totalPages > 1" :page="page" :total-pages="totalPages" @change="goPage" />
      </section>

      <!-- Kolom 3: baca -->
      <section class="em-baca" aria-label="Isi email">
        <div v-if="email.loadingMessage" class="bc-muat"><span class="bola" /><span class="bola" /><span class="bola" /> Membuka email…</div>
        <div v-else-if="!email.current || selectedUid === null" class="bc-kosong">
          <span class="maskot besar">✉️</span>
          <b>Pilih email untuk dibaca</b>
          <small>Tip: tekan <kbd>j</kbd> / <kbd>k</kbd> untuk berpindah, <kbd>c</kbd> untuk menulis, <kbd>?</kbd> untuk semua pintasan.</small>
        </div>
        <article v-else class="bc">
          <div class="bc-alat">
            <button type="button" class="ikon-btn kembali" aria-label="Kembali ke daftar" @click="selectedUid = null">←</button>
            <button type="button" class="alat utama" @click="bukaBalas(false)">↩️ <span>Balas</span></button>
            <button v-if="(email.current.to_list?.length ?? 0) + (email.current.cc_list?.length ?? 0) > 1" type="button" class="alat" @click="bukaBalas(true)">↩️↩️ <span>Balas semua</span></button>
            <button type="button" class="alat" @click="bukaTeruskan">➡️ <span>Teruskan</span></button>
            <span class="pemisah" />
            <button v-if="fitur.bintang" type="button" :class="['alat', 'ikon', { kuning: email.current.flagged }]" :title="email.current.flagged ? 'Lepas bintang (s)' : 'Beri bintang (s)'" :aria-label="email.current.flagged ? 'Lepas bintang' : 'Beri bintang'" @click="bintang(email.current)">{{ email.current.flagged ? '★' : '☆' }}</button>
            <button type="button" class="alat ikon" title="Tandai belum dibaca (u)" aria-label="Tandai belum dibaca" @click="tandaiBelum">📩</button>
            <button v-if="email.currentFolder === 'inbox'" type="button" class="alat ikon" title="Tandai spam" aria-label="Tandai spam" @click="pindahSatu('spam')">🚫</button>
            <button v-if="email.currentFolder === 'junk' || email.currentFolder === 'trash'" type="button" class="alat ikon" title="Pindah ke Kotak Masuk" aria-label="Pindah ke Kotak Masuk" @click="pindahSatu('inbox')">📥</button>
            <button type="button" class="alat ikon" title="Cetak" aria-label="Cetak" @click="cetak">🖨️</button>
            <button type="button" class="alat ikon bahaya" :title="email.currentFolder === 'trash' ? 'Hapus permanen (#)' : 'Pindah ke Sampah (#)'" :aria-label="email.currentFolder === 'trash' ? 'Hapus permanen' : 'Pindah ke Sampah'"
              @click="pindahSatu(email.currentFolder === 'trash' ? 'hapus' : 'sampah')">🗑️</button>
          </div>
          <h1 class="bc-subjek">{{ email.current.subject }}</h1>
          <div class="bc-pengirim">
            <span class="br-av besar" :style="{ background: avatar(email.current.from || '?').warna }" aria-hidden="true">{{ avatar(email.current.from || '?').inisial }}</span>
            <div class="bc-meta">
              <div class="bc-dari"><b>{{ (email.current.from || '').replace(/\s*<.*>/, '') || email.current.from_address }}</b> <small>&lt;{{ email.current.from_address || email.current.from }}&gt;</small></div>
              <div class="bc-ke">kepada {{ email.current.to || '—' }}<template v-if="email.current.cc"> · cc {{ email.current.cc }}</template></div>
            </div>
            <time class="bc-tgl">{{ fmtDateTime(email.current.date) }}</time>
          </div>
          <div v-if="email.current.attachments.length" class="bc-lampiran">
            <button v-for="a in email.current.attachments" :key="a.partId" type="button" class="lmp" :title="`Unduh ${a.filename}`" @click="unduhLampiran(email.current!.uid, a.partId, a.filename)">
              <span class="lmp-ikon">{{ ikonFile(a.filename, a.contentType) }}</span>
              <span class="lmp-teks"><b>{{ a.filename }}</b><small>{{ fmtSize(a.size) }} · unduh</small></span>
            </button>
          </div>
          <iframe ref="iframeRef" class="bc-isi" :srcdoc="srcdoc" :style="{ height: `${tinggiIsi}px` }" title="Isi email"
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals" @load="ukurIframe" />
          <div class="bc-balas-cepat">
            <button type="button" @click="bukaBalas(false)">↩️ Balas</button>
            <button type="button" @click="bukaTeruskan">➡️ Teruskan</button>
          </div>
        </article>
      </section>
    </div>

    <div v-else class="bc-muat"><span class="bola" /><span class="bola" /><span class="bola" /> Memuat…</div>

    <!-- tombol tulis mengambang di HP -->
    <button v-if="email.account && !showCompose" type="button" class="fab" aria-label="Tulis email" @click="bukaCompose">✏️</button>

    <!-- ════════════ PINTASAN ════════════ -->
    <div v-if="tampilPintasan" class="modal-overlay" @click.self="tampilPintasan = false">
      <div class="pintasan" role="dialog" aria-label="Pintasan keyboard">
        <h3>⌨️ Pintasan keyboard</h3>
        <ul>
          <li><kbd>j</kbd> / <kbd>k</kbd> Email berikut / sebelumnya</li>
          <li><kbd>c</kbd> Tulis email baru</li>
          <li><kbd>r</kbd> Balas · <kbd>a</kbd> Balas semua · <kbd>f</kbd> Teruskan</li>
          <li><kbd>s</kbd> Bintang · <kbd>u</kbd> Tandai belum dibaca</li>
          <li><kbd>#</kbd> Pindah ke Sampah</li>
          <li><kbd>/</kbd> Cari · <kbd>Esc</kbd> Tutup email</li>
        </ul>
        <button type="button" class="btn-utama" @click="tampilPintasan = false">Mengerti</button>
      </div>
    </div>

    <!-- ════════════ TULIS ════════════ -->
    <div v-if="showCompose" class="modal-overlay cm-latar" data-jaga-sendiri @click.self="tutupCompose">
      <div class="cm" role="dialog" :aria-label="judulCompose" @dragover.prevent="seretMasuk = true" @dragleave.self="seretMasuk = false" @drop.prevent="jatuhkanFile">
        <div class="cm-kepala">
          <b>{{ judulCompose }}</b>
          <button type="button" class="ikon-btn" aria-label="Tutup" @click="tutupCompose">✕</button>
        </div>
        <div class="cm-badan">
          <div class="cm-baris cm-kepada">
            <span class="cm-label">Kepada</span>
            <RecipientInput v-model="toTags" :contacts="contacts" placeholder="Ketik nama atau email, Enter untuk menambah" />
            <button v-if="!showCc" type="button" class="link" @click="showCc = true">Cc/Bcc</button>
          </div>
          <template v-if="showCc">
            <div class="cm-baris"><span class="cm-label">Cc</span><RecipientInput v-model="ccTags" :contacts="contacts" placeholder="Tambah Cc…" /></div>
            <div class="cm-baris"><span class="cm-label">Bcc</span><RecipientInput v-model="bccTags" :contacts="contacts" placeholder="Tambah Bcc…" /></div>
          </template>
          <div class="cm-baris"><span class="cm-label">Subjek</span><input v-model="composeForm.subject" class="cm-subjek" placeholder="Subjek email" /></div>
          <div class="cm-alat">
            <button type="button" title="Tebal" @mousedown.prevent="exec('bold')"><b>B</b></button>
            <button type="button" title="Miring" @mousedown.prevent="exec('italic')"><i>I</i></button>
            <button type="button" title="Garis bawah" @mousedown.prevent="exec('underline')"><u>U</u></button>
            <button type="button" title="Coret" @mousedown.prevent="exec('strikeThrough')"><s>S</s></button>
            <span class="sep" />
            <button type="button" title="Daftar bullet" @mousedown.prevent="exec('insertUnorderedList')">•≡</button>
            <button type="button" title="Daftar nomor" @mousedown.prevent="exec('insertOrderedList')">1≡</button>
            <button type="button" title="Kutipan" @mousedown.prevent="exec('formatBlock', 'blockquote')">❝</button>
            <button type="button" title="Sisip tautan" @mousedown.prevent="addLink()">🔗</button>
            <button type="button" title="Hapus format" @mousedown.prevent="exec('removeFormat')">⌫</button>
            <span class="sep" />
            <span class="emoji-wrap">
              <button type="button" title="Emoji" @mousedown.prevent="showEmoji = !showEmoji">😊</button>
              <span v-if="showEmoji" class="emoji-pop">
                <button v-for="em in EMOJIS" :key="em" type="button" @mousedown.prevent="insertEmoji(em)">{{ em }}</button>
              </span>
            </span>
          </div>
          <div ref="editorRef" class="cm-editor" contenteditable="true" data-placeholder="Tulis pesan…" @input="onEditorInput" />
          <div v-if="composeFiles.length" class="cm-lampiran">
            <span v-for="(f, i) in composeFiles" :key="i" class="cm-file">
              {{ ikonFile(f.name, f.type) }} {{ f.name }} <small>{{ fmtSize(f.size) }}</small>
              <button type="button" :aria-label="`Hapus ${f.name}`" @click="hapusFile(i)">✕</button>
            </span>
            <small :class="['cm-total', { merah: totalLampiran > 25 * 1024 * 1024 }]">Total {{ fmtSize(totalLampiran) }}{{ totalLampiran > 25 * 1024 * 1024 ? ' — terlalu besar (maks ±25 MB)' : '' }}</small>
          </div>
          <div v-if="seretMasuk" class="cm-seret">📎 Lepaskan file untuk melampirkan</div>
          <p v-if="sendError" class="pesan-err" role="alert">{{ sendError }}</p>
        </div>
        <div class="cm-kaki">
          <button type="button" class="btn-utama" :disabled="sending || savingDraft" @click="kirimEmail">{{ sending ? 'Mengirim…' : 'Kirim 🚀' }}</button>
          <label class="cm-lampir" title="Lampirkan file (atau seret ke sini)">📎 Lampirkan<input type="file" multiple hidden @change="handleFileInput" /></label>
          <button v-if="fitur.draf" type="button" class="btn-ghost" :disabled="sending || savingDraft" @click="simpanDraf">{{ savingDraft ? 'Menyimpan…' : '📝 Simpan draf' }}</button>
          <span class="spasi" />
          <button type="button" class="btn-ghost" :disabled="sending || savingDraft" @click="tutupCompose">Batal</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.em { --pr: #2a78d6; --garis: #e6e8ec; --redup: #64748b; --latar: #f6f7f9; box-sizing: border-box; }
.em *, .em *::before, .em *::after { box-sizing: border-box; }

/* ── Sambung ── */
.sambung { display: flex; justify-content: center; padding: 32px 12px; }
.sambung-kartu { width: 100%; max-width: 460px; background: #fff; border: 1px solid var(--garis); border-radius: 20px; padding: 28px; box-shadow: 0 10px 30px rgba(15, 23, 42, .06); }
.sambung-ikon { font-size: 40px; animation: lompat 2.2s ease-in-out infinite; }
.sambung-kartu h2 { margin: 6px 0 4px; font-size: 22px; }
.sub { margin: 0 0 16px; color: var(--redup); font-size: 14px; }
.api-box { margin: 0 0 16px; padding: 14px; border-radius: 14px; background: linear-gradient(135deg, #eef5ff, #f5f0ff); border: 1px solid #c7dbf7; }
.api-judul { margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #1e3a8a; }
.btn-api { display: block; width: 100%; margin-bottom: 8px; padding: 11px 14px; border: 0; border-radius: 12px; background: var(--pr); color: #fff; font-weight: 700; font-size: 14px; cursor: pointer; }
.btn-api:disabled { opacity: .6; cursor: progress; }
.api-atau { margin: 6px 0 0; font-size: 12px; color: var(--redup); }
.btn-preset { margin-bottom: 12px; padding: 7px 12px; border-radius: 10px; border: 1px dashed #93c5fd; background: #f8fbff; color: #1d4ed8; font-weight: 600; font-size: 12.5px; cursor: pointer; }
.fl { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; color: #334155; flex: 1; }
.fl input { padding: 10px 12px; border: 1px solid var(--garis); border-radius: 10px; font: inherit; font-weight: 400; font-size: 14px; }
.fl input:focus { outline: 2px solid #bfdbfe; border-color: var(--pr); }
.fl-baris { display: flex; gap: 10px; }
.fl.kecil { flex: 0 0 90px; }
.catatan { margin: 12px 0 0; font-size: 12px; color: var(--redup); text-align: center; }
.pesan-err { margin: 8px 0; padding: 8px 12px; border-radius: 10px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
.btn-utama { padding: 10px 18px; border: 0; border-radius: 12px; background: var(--pr); color: #fff; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 6px 14px rgba(42, 120, 214, .25); transition: transform .15s, box-shadow .15s; }
.btn-utama:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(42, 120, 214, .32); }
.btn-utama:disabled { opacity: .6; cursor: progress; }
.btn-utama.lebar { width: 100%; }
.btn-ghost { padding: 9px 14px; border: 1px solid var(--garis); border-radius: 12px; background: #fff; color: #334155; font-weight: 600; font-size: 13.5px; cursor: pointer; }
.link { border: 0; background: none; color: var(--pr); font-weight: 600; font-size: 12.5px; cursor: pointer; padding: 0; }
.link.merah { color: #dc2626; }
.ikon-btn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--garis); background: #fff; cursor: pointer; font-size: 15px; display: grid; place-items: center; flex-shrink: 0; }
.ikon-btn:hover { background: var(--latar); }
.ikon-btn.putar { animation: putar 1s linear infinite; }

/* ── Tata letak 3 kolom ── */
.em-tata { display: grid; grid-template-columns: 220px minmax(320px, 400px) minmax(0, 1fr); gap: 0; height: calc(100vh - 130px); min-height: 520px; background: #fff; border: 1px solid var(--garis); border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, .05); }

/* Kolom 1 */
.em-samping { display: flex; flex-direction: column; gap: 10px; padding: 14px 10px; background: linear-gradient(180deg, #f7f9ff, #fbfbfd); border-right: 1px solid var(--garis); min-height: 0; }
.btn-tulis { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border: 0; border-radius: 16px; background: linear-gradient(135deg, #2a78d6, #6250d6); color: #fff; font-weight: 800; font-size: 14px; cursor: pointer; box-shadow: 0 8px 18px rgba(98, 80, 214, .28); transition: transform .2s cubic-bezier(.2, .9, .3, 1.4); }
.btn-tulis:hover { transform: translateY(-2px) rotate(-1deg); }
.btn-tulis:hover span { display: inline-block; animation: goyang .5s; }
.em-folder { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.fd { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 0; border-radius: 12px; background: none; color: #334155; font-size: 13.5px; font-weight: 600; cursor: pointer; text-align: left; transition: background .15s; }
.fd:hover { background: #eef2f8; }
.fd.aktif { background: #e3edfc; color: #1c4f9c; }
.fd-ikon { font-size: 16px; }
.fd-nama { flex: 1; }
.fd-jml { min-width: 22px; padding: 1px 7px; border-radius: 99px; background: #e2e8f0; color: #334155; font-size: 11px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; }
.fd-jml.panas { background: var(--pr); color: #fff; }
.fd-jml.redup { background: transparent; color: #94a3b8; }
.em-akun { margin-top: auto; padding: 10px; border-radius: 14px; background: #fff; border: 1px solid var(--garis); display: flex; flex-direction: column; gap: 6px; }
.akun-alamat { font-size: 12.5px; font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lencana-api { align-self: flex-start; padding: 1px 8px; border-radius: 99px; background: #e8f1fd; color: #1c5cab; font-size: 11px; font-weight: 700; }
.lencana-api.imap { background: #f1f5f9; color: #475569; }
.kuota small { font-size: 11px; color: var(--redup); }
.kuota-bar { height: 6px; border-radius: 99px; background: #eef2f7; overflow: hidden; margin-bottom: 3px; }
.kuota-bar span { display: block; min-width: 4px; height: 100%; border-radius: 99px; background: #1baf7a; transition: width .8s; }
.kuota-bar span.hampir { background: #eda100; }
.kuota-bar span.penuh { background: #d03b3b; }
.akun-aksi { display: flex; justify-content: space-between; }

/* Kolom 2 */
.em-daftar { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--garis); }
.dl-kepala { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 14px 8px; }
.dl-judul h2 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
.dl-judul small { font-size: 12px; color: var(--redup); }
.dl-cari { display: flex; align-items: center; gap: 8px; margin: 0 14px 8px; padding: 0 10px; border: 1px solid var(--garis); border-radius: 12px; background: var(--latar); transition: border-color .15s, background .15s; }
.dl-cari:focus-within { border-color: var(--pr); background: #fff; box-shadow: 0 0 0 3px #dbeafe; }
.dl-cari input { flex: 1; min-width: 0; border: 0; background: none; padding: 9px 0; font: inherit; font-size: 13.5px; outline: none; }
.dl-cari .x { border: 0; background: none; color: var(--redup); cursor: pointer; }
.dl-chip { display: flex; gap: 6px; padding: 0 14px 8px; overflow-x: auto; scrollbar-width: none; }
.dl-chip button { flex-shrink: 0; padding: 5px 11px; border-radius: 99px; border: 1px solid var(--garis); background: #fff; font-size: 12px; font-weight: 600; color: #475569; cursor: pointer; transition: all .15s; }
.dl-chip button.on { background: #0f172a; border-color: #0f172a; color: #fff; }
.dl-massal { display: flex; align-items: center; gap: 4px; padding: 6px 14px; border-top: 1px solid var(--garis); border-bottom: 1px solid var(--garis); background: #fbfbfd; min-height: 42px; }
.dl-massal.aktif { background: #eef5ff; }
.dl-massal button { border: 0; background: none; font-size: 16px; padding: 5px 7px; border-radius: 8px; cursor: pointer; }
.dl-massal button:hover:not(:disabled) { background: #dbeafe; }
.dl-massal button.bahaya { font-size: 12px; font-weight: 700; color: #b91c1c; }
.cek { display: flex; align-items: center; gap: 8px; margin-right: auto; font-size: 12.5px; font-weight: 600; color: #475569; cursor: pointer; }
.cek input, .br-cek input { width: 16px; height: 16px; accent-color: var(--pr); cursor: pointer; }
.dl-isi { flex: 1; overflow-y: auto; min-height: 0; }
.dl-grup { position: sticky; top: 0; z-index: 1; padding: 6px 14px; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: #94a3b8; background: rgba(255, 255, 255, .94); backdrop-filter: blur(4px); }
.br { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px 10px 14px; border-bottom: 1px solid #f1f3f6; cursor: pointer; transition: background .12s; animation: masuk .3s both; }
.br:hover { background: #f8fafc; }
.br.aktif { background: #eaf2fe; }
.br.dipilih { background: #f0f6ff; }
.br.belum::before { content: ''; position: absolute; left: 4px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: var(--pr); }
.br-cek { padding-top: 9px; }
.br-av { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 13px; }
.br-av.besar { width: 42px; height: 42px; font-size: 15px; }
.br-teks { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.br-atas { display: flex; align-items: baseline; gap: 8px; }
.br-nama { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; color: #334155; }
.br.belum .br-nama, .br.belum .br-subjek { font-weight: 800; color: #0f172a; }
.br-tgl { flex-shrink: 0; font-size: 11.5px; color: #94a3b8; font-variant-numeric: tabular-nums; }
.br.belum .br-tgl { color: var(--pr); font-weight: 700; }
.br-subjek { font-size: 13px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.br-balas { color: #1baf7a; margin-right: 4px; font-weight: 800; }
.br-ikon { font-size: 12px; min-height: 2px; }
.br-bintang { flex-shrink: 0; border: 0; background: none; font-size: 18px; line-height: 1; color: #cbd5e1; cursor: pointer; padding: 6px 2px; transition: transform .2s cubic-bezier(.2, .9, .3, 1.6), color .15s; }
.br-bintang:hover { color: #eda100; transform: scale(1.2); }
.br-bintang.on { color: #eda100; animation: denyut .35s; }
.dl-kosong { padding: 40px 18px; text-align: center; color: var(--redup); font-size: 13.5px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.dl-kosong.merah { color: #b91c1c; }
.maskot { font-size: 34px; display: inline-block; animation: lompat 2s ease-in-out infinite; }
.maskot.besar { font-size: 54px; }
.kerangka { padding: 8px 14px; }
.krg { display: grid; grid-template-columns: 36px 1fr; grid-template-rows: auto auto; gap: 6px 10px; padding: 10px 0; }
.krg-av { grid-row: span 2; width: 36px; height: 36px; border-radius: 50%; }
.krg-garis { height: 10px; border-radius: 6px; }
.krg-garis.pendek { width: 60%; }
.krg-av, .krg-garis { background: linear-gradient(90deg, #eef1f5 25%, #f8f9fb 50%, #eef1f5 75%); background-size: 200% 100%; animation: kilau 1.2s infinite; }

/* Kolom 3 */
.em-baca { min-width: 0; min-height: 0; overflow-y: auto; background: #fff; }
.bc-kosong, .bc-muat { height: 100%; min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--redup); text-align: center; padding: 24px; }
.bc-muat { flex-direction: row; }
.bc-kosong small { max-width: 320px; line-height: 1.6; }
kbd { display: inline-block; min-width: 20px; padding: 1px 6px; border: 1px solid #cbd5e1; border-bottom-width: 2px; border-radius: 6px; background: #f8fafc; font: 600 11.5px ui-monospace, monospace; color: #334155; text-align: center; }
.bola { width: 9px; height: 9px; border-radius: 50%; background: var(--pr); animation: lompat 1s infinite ease-in-out; }
.bola:nth-child(2) { background: #6250d6; animation-delay: .15s; }
.bola:nth-child(3) { background: #e87ba4; animation-delay: .3s; }
.bc { padding: 14px 22px 28px; animation: muncul .3s both; }
.bc-alat { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 0 10px; background: rgba(255, 255, 255, .96); backdrop-filter: blur(6px); }
.bc-alat .kembali { display: none; }
.alat { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--garis); background: #fff; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; transition: background .15s, transform .15s; }
.alat:hover { background: var(--latar); transform: translateY(-1px); }
.alat.utama { background: #eaf2fe; border-color: #c7dcf7; color: #1c4f9c; }
.alat.ikon { width: 36px; justify-content: center; padding: 7px 0; font-size: 15px; }
.alat.kuning { color: #eda100; }
.alat.bahaya:hover { background: #fef2f2; }
.pemisah { flex: 1; }
.bc-subjek { margin: 4px 0 14px; font-size: 22px; font-weight: 800; line-height: 1.3; color: #0f172a; overflow-wrap: anywhere; }
.bc-pengirim { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.bc-meta { flex: 1; min-width: 0; }
.bc-dari { font-size: 14px; color: #0f172a; overflow-wrap: anywhere; }
.bc-dari small { color: var(--redup); font-weight: 400; }
.bc-ke { font-size: 12.5px; color: var(--redup); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-tgl { flex-shrink: 0; font-size: 12px; color: var(--redup); }
.bc-lampiran { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.lmp { display: flex; align-items: center; gap: 10px; max-width: 260px; padding: 8px 12px; border: 1px solid var(--garis); border-radius: 12px; background: #fbfcfe; cursor: pointer; text-align: left; transition: transform .15s, box-shadow .15s; }
.lmp:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(15, 23, 42, .08); }
.lmp-ikon { font-size: 22px; }
.lmp-teks { min-width: 0; display: flex; flex-direction: column; }
.lmp-teks b { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #0f172a; }
.lmp-teks small { font-size: 11px; color: var(--redup); }
.bc-isi { display: block; width: 100%; border: 0; border-top: 1px solid #f1f3f6; padding-top: 6px; background: #fff; }
.bc-balas-cepat { display: flex; gap: 8px; margin-top: 18px; }
.bc-balas-cepat button { padding: 9px 16px; border-radius: 99px; border: 1px solid var(--garis); background: #fff; font-weight: 700; font-size: 13px; color: #334155; cursor: pointer; }
.bc-balas-cepat button:hover { background: var(--latar); }

/* Pintasan */
.pintasan { background: #fff; border-radius: 18px; padding: 22px; width: min(92vw, 420px); }
.pintasan h3 { margin: 0 0 12px; }
.pintasan ul { margin: 0 0 16px; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; color: #334155; }

/* Tulis */
.cm-latar { align-items: flex-end; justify-content: flex-end; padding: 16px; }
.cm { position: relative; width: min(680px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(15, 23, 42, .3); overflow: hidden; animation: naik .25s cubic-bezier(.2, .9, .3, 1.1); }
.cm-kepala { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 10px 18px; background: linear-gradient(135deg, #1f2b4d, #3b3f8f); color: #fff; }
.cm-kepala .ikon-btn { background: rgba(255, 255, 255, .12); border-color: transparent; color: #fff; }
.cm-badan { padding: 6px 18px 0; overflow-y: auto; flex: 1; }
.cm-baris { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f1f3f6; }
.cm-label { flex: 0 0 52px; font-size: 12.5px; font-weight: 700; color: var(--redup); }
.cm-baris :deep(.ri-wrap) { flex: 1; border: 0 !important; box-shadow: none !important; padding-left: 0; }
.cm-subjek { flex: 1; border: 0; padding: 8px 0; font: inherit; font-size: 14px; font-weight: 600; outline: none; }
.cm-alat { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px solid #f1f3f6; }
.cm-alat button { min-width: 32px; height: 30px; border: 0; border-radius: 8px; background: none; cursor: pointer; font-size: 13.5px; color: #334155; }
.cm-alat button:hover { background: var(--latar); }
.sep { width: 1px; height: 18px; background: var(--garis); margin: 0 4px; }
.emoji-wrap { position: relative; }
.emoji-pop { position: absolute; z-index: 5; top: 34px; left: 0; display: grid; grid-template-columns: repeat(6, 32px); gap: 2px; padding: 6px; background: #fff; border: 1px solid var(--garis); border-radius: 12px; box-shadow: 0 10px 24px rgba(15, 23, 42, .14); }
.cm-editor { min-height: 220px; padding: 12px 0; font-size: 14px; line-height: 1.6; outline: none; overflow-wrap: anywhere; }
.cm-editor:empty::before { content: attr(data-placeholder); color: #94a3b8; }
.cm-editor :deep(blockquote) { margin: 8px 0; padding-left: 12px; border-left: 3px solid #cbd5e1; color: #475569; }
.cm-lampiran { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 0; }
.cm-file { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 99px; background: #eef5ff; font-size: 12.5px; color: #1c4f9c; }
.cm-file small { color: #64748b; }
.cm-file button { border: 0; background: none; cursor: pointer; color: #64748b; }
.cm-total { font-size: 11.5px; color: var(--redup); }
.cm-total.merah { color: #b91c1c; font-weight: 700; }
.cm-seret { position: absolute; inset: 52px 12px 64px; display: grid; place-items: center; border: 2px dashed var(--pr); border-radius: 14px; background: rgba(238, 245, 255, .92); font-weight: 800; color: #1c4f9c; pointer-events: none; }
.cm-kaki { display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--garis); flex-wrap: wrap; }
.cm-lampir { padding: 9px 12px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 13.5px; color: #334155; }
.cm-lampir:hover { background: var(--latar); }
.spasi { flex: 1; }

.fab { display: none; position: fixed; right: 18px; bottom: 18px; z-index: 40; width: 56px; height: 56px; border-radius: 18px; border: 0; background: linear-gradient(135deg, #2a78d6, #6250d6); color: #fff; font-size: 22px; box-shadow: 0 10px 24px rgba(98, 80, 214, .4); cursor: pointer; }

/* ── Animasi ── */
@keyframes lompat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes goyang { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-16deg); } 65% { transform: rotate(12deg); } }
@keyframes putar { to { transform: rotate(360deg); } }
@keyframes denyut { 50% { transform: scale(1.45); } }
@keyframes kilau { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes masuk { from { opacity: 0; transform: translateY(4px); } }
@keyframes muncul { from { opacity: 0; transform: translateX(8px); } }
@keyframes naik { from { opacity: 0; transform: translateY(24px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .em *, .em *::before { animation: none !important; transition: none !important; } }

/* ── Responsif ── */
@media (max-width: 1180px) {
  .em-tata { grid-template-columns: 64px minmax(300px, 360px) minmax(0, 1fr); }
  .btn-tulis { padding: 12px 0; font-size: 0; }
  .btn-tulis span { font-size: 18px; }
  .fd { justify-content: center; padding: 10px 0; position: relative; }
  .fd-nama { display: none; }
  .fd-jml { position: absolute; top: 2px; right: 4px; min-width: 18px; padding: 0 5px; font-size: 10px; }
  .em-akun { display: none; }
}
@media (max-width: 860px) {
  .em-tata { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); height: calc(100vh - 110px); border-radius: 16px; }
  .em-samping { flex-direction: row; align-items: center; padding: 8px; border-right: 0; border-bottom: 1px solid var(--garis); overflow-x: auto; }
  .btn-tulis { display: none; }
  .em-folder { flex-direction: row; overflow: visible; }
  .fd { padding: 7px 12px; }
  .fd-nama { display: inline; }
  .fd-jml { position: static; }
  .em-daftar { border-right: 0; }
  .em-baca { display: none; }
  .em-tata.ada-baca .em-daftar { display: none; }
  .em-tata.ada-baca .em-baca { display: block; }
  .bc-alat .kembali { display: grid; }
  .alat span { display: none; }
  .bc { padding: 10px 14px 80px; }
  .bc-subjek { font-size: 19px; }
  .fab { display: grid; place-items: center; }
  .cm-latar { padding: 0; align-items: stretch; }
  .cm { width: 100%; max-height: none; height: 100%; border-radius: 0; }
}
</style>
