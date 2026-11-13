import { ref, shallowRef } from 'vue'

/* ══════════════════════════════════════════════
   Dialog global berbasis Promise — pengganti
   window.alert / confirm / prompt.
   Dirender oleh <DialogHost /> di App.vue.

   if (!(await confirmDialog('Hapus data ini?'))) return
   await alertDialog({ title: 'Gagal', message: msg, variant: 'danger' })
   const v = await promptDialog({ title: 'URL', inputType: 'url' })  // null = batal
   ══════════════════════════════════════════════ */

export type DialogVariant = 'default' | 'danger' | 'warning' | 'success'

export interface DialogOptions {
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
}

export interface PromptOptions extends DialogOptions {
  label?: string
  placeholder?: string
  defaultValue?: string
  inputType?: 'text' | 'password' | 'url' | 'email' | 'number'
  /** Tombol konfirmasi baru aktif bila isian sama persis (mis. kode untuk force delete). */
  requireText?: string
  /** Validasi tambahan; kembalikan pesan error untuk menolak, atau null bila valid. */
  validate?: (value: string) => string | null
}

export interface DialogRequest extends PromptOptions {
  kind: 'alert' | 'confirm' | 'prompt'
  resolve: (value: any) => void
}

/** Dialog yang sedang tampil; sisanya antre agar tidak saling menimpa. */
export const activeDialog = shallowRef<DialogRequest | null>(null)
const queue: DialogRequest[] = []

function open<T>(kind: DialogRequest['kind'], opts: PromptOptions): Promise<T> {
  return new Promise<T>((resolve) => {
    const req: DialogRequest = { ...opts, kind, resolve }
    if (activeDialog.value) queue.push(req)
    else activeDialog.value = req
  })
}

/** Dipanggil oleh DialogHost saat dialog ditutup. */
export function settleDialog(value: unknown) {
  const cur = activeDialog.value
  if (!cur) return
  activeDialog.value = queue.shift() ?? null
  cur.resolve(value)
}

const normalize = (o: string | DialogOptions | PromptOptions): PromptOptions =>
  typeof o === 'string' ? { message: o } : o

export function confirmDialog(opts: string | DialogOptions): Promise<boolean> {
  const o = normalize(opts)
  return open<boolean>('confirm', { title: 'Konfirmasi', ...o })
}

export function alertDialog(opts: string | DialogOptions): Promise<void> {
  const o = normalize(opts)
  const title = o.title ?? (o.variant === 'danger' ? 'Gagal' : o.variant === 'success' ? 'Berhasil' : 'Informasi')
  return open<void>('alert', { confirmLabel: 'OK', ...o, title })
}

export function promptDialog(opts: string | PromptOptions): Promise<string | null> {
  const o = normalize(opts)
  return open<string | null>('prompt', { title: 'Masukkan Data', confirmLabel: 'Simpan', ...o })
}

/* ── Pesan galat yang ramah ───────────────────────────────────────────────────
   Satu tempat untuk menerjemahkan error apa pun (axios / Error / string) menjadi
   kalimat yang bisa dipahami pengguna. Pesan dari server selalu diutamakan. */
const PESAN_STATUS: Record<number, string> = {
  400: 'Data yang dikirim belum sesuai. Periksa kembali isian Anda.',
  401: 'Sesi Anda berakhir. Silakan masuk kembali.',
  403: 'Anda tidak memiliki akses untuk tindakan ini.',
  404: 'Data tidak ditemukan — mungkin sudah dihapus atau dipindahkan.',
  408: 'Server terlalu lama merespons. Coba lagi.',
  409: 'Data bentrok dengan data yang sudah ada.',
  413: 'Berkas terlalu besar untuk diunggah.',
  422: 'Data yang dikirim belum sesuai. Periksa kembali isian Anda.',
  429: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
  500: 'Terjadi kesalahan di server. Coba lagi; bila berulang, hubungi admin.',
  502: 'Server sedang tidak dapat dihubungi. Coba lagi sebentar lagi.',
  503: 'Layanan sedang tidak tersedia. Coba lagi sebentar lagi.',
  504: 'Server terlalu lama merespons. Coba lagi.',
}
const PESAN_MENTAH = /^(internal server error|forbidden( resource)?|unauthorized|bad request|not found|bad gateway|service unavailable|gateway timeout|conflict|payload too large|request entity too large|throttlerexception: too many requests|too many requests)$/i

export function pesanGalat(err: any, fallback = 'Terjadi kesalahan'): string {
  if (typeof err === 'string') return err || fallback
  const res = err?.response
  if (res) {
    const raw = res.data?.message
    const teks = Array.isArray(raw) ? raw.filter(Boolean).join('\n') : typeof raw === 'string' ? raw.trim() : ''
    if (teks && !PESAN_MENTAH.test(teks)) return teks
    return PESAN_STATUS[res.status as number] ?? (res.status >= 500 ? PESAN_STATUS[500]! : fallback)
  }
  if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') return 'Server terlalu lama merespons. Periksa koneksi lalu coba lagi.'
  if (err?.code === 'ERR_NETWORK' || (err?.isAxiosError && err?.request)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'
  if (err?.isAxiosError) return fallback
  return (err instanceof Error && err.message) || fallback
}

/** Shortcut untuk pesan error dari API (axios) atau Error biasa. */
export function alertError(err: any, fallback = 'Terjadi kesalahan'): Promise<void> {
  // Sudah diberitahukan oleh lapisan global (toast/banner koneksi) — jangan tumpuk dua pesan.
  if (err && typeof err === 'object' && err.__diberitahu) return Promise.resolve()
  if (err && typeof err === 'object') err.__diberitahu = true
  return alertDialog({ title: 'Gagal', message: pesanGalat(err, fallback), variant: 'danger' })
}

// ── Toast: umpan balik singkat yang tidak perlu diklik (mis. "Tersimpan") ──────────
export interface Toast { id: number; pesan: string; variant: 'success' | 'danger' | 'warning' | 'default' }
export const toasts = ref<Toast[]>([])
let toastId = 0
export function toast(pesan: string, variant: Toast['variant'] = 'success', durasiMs?: number) {
  // Pesan yang sama sedang tampil → jangan ditumpuk (mis. banyak permintaan gagal bersamaan)
  if (toasts.value.some((t) => t.pesan === pesan && t.variant === variant)) return
  const id = ++toastId
  toasts.value = [...toasts.value.slice(-3), { id, pesan, variant }]
  setTimeout(() => tutupToast(id), durasiMs ?? (variant === 'danger' || variant === 'warning' ? 6500 : 4000))
}
export function tutupToast(id: number) { toasts.value = toasts.value.filter((t) => t.id !== id) }

/** Toast galat dari error apa pun; aman dipanggil berulang (tidak dobel untuk error yang sama). */
export function toastGalat(err: any, fallback = 'Terjadi kesalahan') {
  if (err && typeof err === 'object') {
    if (err.__diberitahu) return
    err.__diberitahu = true
  }
  toast(pesanGalat(err, fallback), 'danger')
}

/** Jaring pengaman global: dipanggil untuk error yang tidak ditangani halaman mana pun. */
export function laporGalat(err: any, dariVue = false, lokasi = '') {
  if (!err || err.__diberitahu || err.__CANCEL__ || err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return
  if (err.isAxiosError) {
    if (err.response?.status === 401) return
    return toastGalat(err)
  }
  console.error(err)
  // Simpan jejak singkat agar mudah dilacak (window.__galat) dan tampilkan petunjuk lokasi di toast
  try { ((window as any).__galat ||= []).push({ waktu: new Date().toISOString(), lokasi, pesan: String(err?.message ?? err), tumpuk: String(err?.stack ?? '').split('\n').slice(0, 4).join(' | ') }) } catch { /* abaikan */ }
  if (dariVue) {
    const rinci = `${lokasi ? lokasi + ': ' : ''}${String(err?.message ?? err)}`.slice(0, 160)
    toastGalat(`Terjadi kesalahan pada halaman ini. Muat ulang bila tampilan tidak normal. [${rinci}]`)
  }
}

export function useDialog() {
  return { confirm: confirmDialog, alert: alertDialog, prompt: promptDialog, alertError, toast, toastGalat, pesanGalat }
}
