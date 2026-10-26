<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

function onConfirm() {
  if (!props.loading) emit('confirm')
}
function onCancel() {
  if (!props.loading) emit('cancel')
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') onCancel()
}

watch(() => props.modelValue, (open) => {
  if (open) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="cd-overlay" @click.self="onCancel">
      <div class="cd-box" v-focus-trap>
        <div class="cd-icon" :class="variant ?? 'default'">
          <span v-if="variant === 'danger'">🗑</span>
          <span v-else-if="variant === 'warning'">⚠</span>
          <span v-else>💬</span>
        </div>
        <h3 class="cd-title">{{ title }}</h3>
        <p v-if="message" class="cd-message">{{ message }}</p>
        <div class="cd-actions">
          <button type="button" class="cd-cancel" :disabled="loading" @click="onCancel">{{ cancelLabel ?? 'Batal' }}</button>
          <button type="button" class="cd-confirm" :class="variant ?? 'default'" :disabled="loading" :aria-busy="loading || undefined" @click="onConfirm">
            {{ loading ? 'Memproses...' : (confirmLabel ?? 'Ya, Lanjutkan') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.cd-box {
  background: var(--surface); border-radius: var(--r-lg); padding: 28px 28px 24px;
  width: 100%; max-width: 400px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  text-align: center;
}
.cd-icon { font-size: 32px; margin-bottom: 12px; line-height: 1; }
.cd-title {
  font-size: 16px; font-weight: 700; color: var(--text-1);
  margin: 0 0 8px; line-height: 1.4;
}
.cd-message {
  font-size: 13.5px; color: var(--text-3); line-height: 1.6;
  margin: 0 0 20px;
  overflow-wrap: anywhere;
}
.cd-title + .cd-actions { margin-top: 16px; }
.cd-actions { display: flex; gap: 10px; justify-content: center; }
.cd-cancel {
  flex: 1; max-width: 140px; padding: 9px 16px; border-radius: var(--r);
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background 0.15s;
}
.cd-cancel:hover { background: #f8fafc; }
.cd-confirm {
  flex: 1; max-width: 140px; padding: 9px 16px; border-radius: var(--r);
  border: none; font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s;
}
.cd-confirm.danger { background: var(--danger); color: #fff; }
.cd-confirm.danger:hover { background: #b91c1c; }
.cd-confirm.warning { background: var(--warning); color: #fff; }
.cd-confirm.warning:hover { background: #b45309; }
.cd-confirm.default { background: var(--primary); color: #fff; }
.cd-confirm.default:hover { background: #1e40af; }
.cd-confirm:disabled, .cd-cancel:disabled { opacity: .6; cursor: not-allowed; }
</style>
