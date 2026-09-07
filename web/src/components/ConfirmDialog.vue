<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
}>()
defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="cd-overlay" @click.self="$emit('cancel')">
      <div class="cd-box" v-focus-trap>
        <div class="cd-icon" :class="variant ?? 'default'">
          <span v-if="variant === 'danger'">🗑</span>
          <span v-else-if="variant === 'warning'">⚠</span>
          <span v-else>💬</span>
        </div>
        <h3 class="cd-title">{{ title }}</h3>
        <p v-if="message" class="cd-message">{{ message }}</p>
        <div class="cd-actions">
          <button class="cd-cancel" @click="$emit('cancel')">{{ cancelLabel ?? 'Batal' }}</button>
          <button class="cd-confirm" :class="variant ?? 'default'" @click="$emit('confirm')">
            {{ confirmLabel ?? 'Ya, Lanjutkan' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.cd-box {
  background: #fff; border-radius: 14px; padding: 28px 28px 24px;
  width: 100%; max-width: 400px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  text-align: center;
}
.cd-icon { font-size: 32px; margin-bottom: 12px; line-height: 1; }
.cd-title {
  font-size: 16px; font-weight: 700; color: #0f172a;
  margin: 0 0 8px; line-height: 1.4;
}
.cd-message {
  font-size: 13.5px; color: #4b5563; line-height: 1.6;
  margin: 0 0 20px;
}
.cd-actions { display: flex; gap: 10px; justify-content: center; }
.cd-cancel {
  flex: 1; max-width: 140px; padding: 9px 16px; border-radius: 8px;
  border: 1.5px solid #e2e8f0; background: #fff; color: #374151;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background 0.15s;
}
.cd-cancel:hover { background: #f8fafc; }
.cd-confirm {
  flex: 1; max-width: 140px; padding: 9px 16px; border-radius: 8px;
  border: none; font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s;
}
.cd-confirm.danger { background: #dc2626; color: #fff; }
.cd-confirm.danger:hover { background: #b91c1c; }
.cd-confirm.warning { background: #d97706; color: #fff; }
.cd-confirm.warning:hover { background: #b45309; }
.cd-confirm.default { background: #1d4ed8; color: #fff; }
.cd-confirm.default:hover { background: #1e40af; }
</style>
