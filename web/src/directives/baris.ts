// v-baris — baris/kartu yang bisa diklik (tr, li, div dengan @click) jadi bisa dipakai lewat keyboard:
// bisa difokus dengan Tab, dan Enter/Spasi menjalankan klik yang sama. Elemen tetap apa adanya
// (tidak diganti <button>), jadi tampilan tabel/kartu tidak berubah.
import type { Directive } from 'vue'

function tekan(e: KeyboardEvent) {
  const el = e.currentTarget as HTMLElement
  if (e.target !== el) return // jangan ganggu input/tombol di dalam baris
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click() }
}

export const vBaris: Directive<HTMLElement> = {
  mounted(el) {
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0
    el.classList.add('bisa-diklik')
    el.addEventListener('keydown', tekan)
  },
  unmounted(el) { el.removeEventListener('keydown', tekan) },
}
