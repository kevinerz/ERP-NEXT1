import { onUnmounted } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(getEl: () => HTMLElement | null) {
  let previousFocus: HTMLElement | null = null

  function getFocusable(el: HTMLElement) {
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => !n.closest('[aria-hidden="true"]'),
    )
  }

  function trap(e: KeyboardEvent) {
    const el = getEl()
    if (!el) return
    const focusable = getFocusable(el)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.key !== 'Tab') return
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  function activate() {
    previousFocus = document.activeElement as HTMLElement
    const el = getEl()
    if (!el) return
    const focusable = getFocusable(el)
    if (focusable.length) focusable[0].focus()
    document.addEventListener('keydown', trap)
  }

  function deactivate() {
    document.removeEventListener('keydown', trap)
    previousFocus?.focus()
    previousFocus = null
  }

  onUnmounted(deactivate)

  return { activate, deactivate }
}
