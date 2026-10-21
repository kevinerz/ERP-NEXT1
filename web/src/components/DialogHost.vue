<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { activeDialog, settleDialog } from '@/composables/useDialog'

const d = activeDialog
const input = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const touched = ref(false)

const icon = computed(() => {
  switch (d.value?.variant) {
    case 'danger': return d.value.kind === 'alert' ? '✕' : '🗑'
    case 'warning': return '⚠'
    case 'success': return '✓'
    default: return d.value?.kind === 'prompt' ? '✎' : d.value?.kind === 'alert' ? 'ℹ' : '💬'
  }
})

const error = computed(() => {
  const cur = d.value
  if (!cur || cur.kind !== 'prompt') return null
  if (cur.requireText !== undefined && input.value.trim() !== cur.requireText) return 'Isian belum sesuai'
  return cur.validate?.(input.value) ?? null
})

function confirm() {
  const cur = d.value
  if (!cur) return
  if (cur.kind === 'prompt') {
    touched.value = true
    if (error.value) return
    settleDialog(input.value)
  } else {
    settleDialog(cur.kind === 'confirm' ? true : undefined)
  }
}
function cancel() {
  const cur = d.value
  if (!cur) return
  settleDialog(cur.kind === 'confirm' ? false : cur.kind === 'prompt' ? null : undefined)
}

function onKeydown(e: KeyboardEvent) {
  if (!d.value) return
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
  else if (e.key === 'Enter' && d.value.kind === 'prompt' && e.target === inputEl.value) { e.preventDefault(); confirm() }
}

watch(d, async (cur) => {
  document.removeEventListener('keydown', onKeydown, true)
  if (!cur) return
  input.value = cur.defaultValue ?? ''
  touched.value = false
  document.addEventListener('keydown', onKeydown, true)
  if (cur.kind === 'prompt') { await nextTick(); inputEl.value?.focus(); inputEl.value?.select() }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="d" class="dh-overlay" @click.self="cancel">
      <div :key="d.title + (d.message ?? '')" class="dh-box" v-focus-trap aria-labelledby="dh-title">
        <div class="dh-icon" :class="d.variant ?? 'default'" aria-hidden="true">{{ icon }}</div>
        <h3 id="dh-title" class="dh-title">{{ d.title }}</h3>
        <p v-if="d.message" class="dh-message">{{ d.message }}</p>

        <div v-if="d.kind === 'prompt'" class="dh-field">
          <label v-if="d.label" class="form-label" for="dh-input">{{ d.label }}</label>
          <input
            id="dh-input"
            ref="inputEl"
            v-model="input"
            class="form-input"
            :type="d.inputType ?? 'text'"
            :placeholder="d.placeholder ?? (d.requireText ? d.requireText : '')"
            autocomplete="off"
            @blur="touched = true"
          />
          <p v-if="touched && error" class="form-error">{{ error }}</p>
        </div>

        <div class="dh-actions" :class="{ single: d.kind === 'alert' }">
          <button v-if="d.kind !== 'alert'" type="button" class="btn btn-secondary" @click="cancel">
            {{ d.cancelLabel ?? 'Batal' }}
          </button>
          <button
            type="button"
            class="btn"
            :class="d.variant === 'danger' ? 'btn-danger' : d.variant === 'success' ? 'btn-success' : d.variant === 'warning' ? 'btn-warning' : 'btn-primary'"
            :disabled="d.kind === 'prompt' && d.requireText !== undefined && !!error"
            @click="confirm"
          >
            {{ d.confirmLabel ?? 'Ya, Lanjutkan' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dh-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.dh-box {
  background: var(--surface); border-radius: var(--r-lg); padding: 28px 28px 24px;
  width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  text-align: center;
}
.dh-icon {
  width: 48px; height: 48px; margin: 0 auto 12px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700; line-height: 1;
  background: var(--primary-light); color: var(--primary);
}
.dh-icon.danger  { background: var(--danger-light);  color: var(--danger); }
.dh-icon.warning { background: var(--warning-light); color: var(--warning); }
.dh-icon.success { background: var(--success-light); color: var(--success); }
.dh-title { font-size: 16px; font-weight: 700; color: var(--text-1); margin: 0 0 8px; line-height: 1.4; }
.dh-message {
  font-size: 13.5px; color: var(--text-3); line-height: 1.6; margin: 0;
  white-space: pre-line; overflow-wrap: anywhere;
}
.dh-field { margin-top: 16px; text-align: left; display: flex; flex-direction: column; gap: 5px; }
.dh-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
.dh-actions .btn { flex: 1; max-width: 160px; }
.dh-actions.single .btn { max-width: 140px; }
.btn-warning { background: var(--warning); color: #fff; }
.btn-warning:hover { background: #b45309; }

@media (max-width: 480px) {
  .dh-overlay { align-items: flex-end; padding: 0; }
  .dh-box { max-width: 100vw; border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 24px 18px 20px; }
  .dh-actions .btn { max-width: none; }
}
</style>
