import { shallowRef } from 'vue'

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

/** Shortcut untuk pesan error dari API (axios) atau Error biasa. */
export function alertError(err: any, fallback = 'Terjadi kesalahan'): Promise<void> {
  const raw = err?.response?.data?.message ?? (typeof err === 'string' ? err : null) ?? fallback
  const message = Array.isArray(raw) ? raw.join('\n') : String(raw)
  return alertDialog({ title: 'Gagal', message, variant: 'danger' })
}

export function useDialog() {
  return { confirm: confirmDialog, alert: alertDialog, prompt: promptDialog, alertError }
}
