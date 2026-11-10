// Lindungi isian modal dari tertutup tak sengaja.
//
// Hampir semua modal di ERP ditutup dengan `@click.self` di overlay — satu klik meleset di luar kotak
// membuang seluruh isian form. Daripada mengubah ±100 modal satu per satu, modul ini memasang
// pendengar global:
//  - setiap `input`/`change` di dalam overlay menandai overlay itu `data-diubah`;
//  - klik pada overlay bertanda (fase capture, sebelum handler Vue) dicegat & dikonfirmasi dulu;
//  - pindah halaman / tutup tab saat ada modal bertanda juga dikonfirmasi.
// Modal yang hanya menampilkan data tidak pernah bertanda, jadi tetap tertutup dengan klik di luar.
import { nextTick } from 'vue'
import type { Router } from 'vue-router'
import { confirmDialog } from './useDialog'

const OVERLAY = '.modal-overlay, .overlay, .wa-modal, .wa-profil-latar, .forgot-overlay'

function overlayDari(el: EventTarget | null): HTMLElement | null {
  return el instanceof Element ? (el.closest(OVERLAY) as HTMLElement | null) : null
}

const adaModalDiubah = () => !!document.querySelector(`[data-diubah]:is(${OVERLAY}):not([data-jaga-sendiri])`)

async function konfirmasiBuang(): Promise<boolean> {
  return confirmDialog({
    title: 'Buang isian?',
    message: 'Isian di jendela ini belum disimpan dan akan hilang.',
    confirmLabel: 'Buang isian',
    cancelLabel: 'Kembali mengisi',
    variant: 'warning',
  })
}

export function pasangLindungiModal(router: Router) {
  const tandai = (e: Event) => {
    const t = e.target as HTMLElement | null
    if (!t || (t as HTMLInputElement).type === 'search' && !t.closest('.cp')) return // kolom cari bukan isian
    const o = overlayDari(t)
    if (o) o.dataset.diubah = '1'
  }
  document.addEventListener('input', tandai, true)
  document.addEventListener('change', tandai, true)

  document.addEventListener('click', async (e) => {
    const o = e.target as HTMLElement | null
    // Hanya klik langsung di latar overlay (setara @click.self), bukan di dalam kotak modal
    // `data-jaga-sendiri`: modal yang sudah punya konfirmasi sendiri (mis. Tulis Email)
    if (!o || !o.matches?.(OVERLAY) || !o.dataset.diubah || o.dataset.jagaSendiri !== undefined) return
    if (o.dataset.paksa) { delete o.dataset.paksa; return }
    e.stopPropagation(); e.preventDefault()
    if (await konfirmasiBuang()) {
      o.dataset.paksa = '1'
      delete o.dataset.diubah
      o.click()
    }
  }, true)

  router.beforeEach(async () => {
    await nextTick() // modal yang baru ditutup setelah simpan sukses sudah hilang dari DOM
    if (!adaModalDiubah()) return true
    return (await konfirmasiBuang()) ? true : false
  })

  window.addEventListener('beforeunload', (e) => {
    if (adaModalDiubah()) { e.preventDefault(); e.returnValue = '' }
  })
}
