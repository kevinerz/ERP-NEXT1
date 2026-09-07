import type { Directive } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(el: HTMLElement) {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (n) => !n.closest('[aria-hidden="true"]'),
  )
}

function makeTrap(el: HTMLElement) {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusable = getFocusable(el)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
}

type FocusTrapEl = HTMLElement & { _prevFocus?: HTMLElement | null; _trapHandler?: (e: KeyboardEvent) => void }

export const vFocusTrap: Directive<FocusTrapEl, boolean> = {
  mounted(el, binding) {
    if (binding.value === false) return
    el._prevFocus = document.activeElement as HTMLElement
    el._trapHandler = makeTrap(el)
    document.addEventListener('keydown', el._trapHandler)
    // move focus into the modal
    const focusable = getFocusable(el)
    if (focusable.length) focusable[0].focus()
    // accessibility attributes
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
  },
  updated(el, binding) {
    if (binding.value && !el._trapHandler) {
      el._prevFocus = document.activeElement as HTMLElement
      el._trapHandler = makeTrap(el)
      document.addEventListener('keydown', el._trapHandler)
      const focusable = getFocusable(el)
      if (focusable.length) focusable[0].focus()
      el.setAttribute('role', 'dialog')
      el.setAttribute('aria-modal', 'true')
    } else if (!binding.value && el._trapHandler) {
      document.removeEventListener('keydown', el._trapHandler)
      el._trapHandler = undefined
      el._prevFocus?.focus()
      el._prevFocus = null
    }
  },
  beforeUnmount(el) {
    if (el._trapHandler) document.removeEventListener('keydown', el._trapHandler)
    el._prevFocus?.focus()
  },
}
