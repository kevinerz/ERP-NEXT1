<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ page: number; totalPages: number }>()
const emit = defineEmits<{ change: [page: number] }>()

const pages = computed(() => {
  const total = props.totalPages
  const cur = props.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const result: (number | '...')[] = [1]
  if (cur > 3) result.push('...')
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) result.push(i)
  if (cur < total - 2) result.push('...')
  result.push(total)
  return result
})
</script>

<template>
  <div class="base-pagination" v-if="totalPages > 1">
    <button class="pg-btn pg-nav" :disabled="page === 1" @click="emit('change', page - 1)">‹</button>
    <template v-for="(p, i) in pages" :key="i">
      <span v-if="p === '...'" class="pg-ellipsis">…</span>
      <button v-else :class="['pg-btn', { active: p === page }]" @click="emit('change', p)">{{ p }}</button>
    </template>
    <button class="pg-btn pg-nav" :disabled="page === totalPages" @click="emit('change', page + 1)">›</button>
  </div>
</template>

<style scoped>
.base-pagination {
  display: flex; align-items: center; gap: 4px;
  padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9;
}
.pg-btn {
  min-width: 32px; height: 32px; padding: 0 8px;
  border: 1.5px solid #e2e8f0; border-radius: 6px;
  font-size: 13px; background: #fff; color: #374151;
  cursor: pointer; transition: background 0.12s, border-color 0.12s;
  display: inline-flex; align-items: center; justify-content: center;
}
.pg-btn:hover:not(:disabled):not(.active) { background: #f8fafc; }
.pg-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; font-weight: 700; }
.pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-nav { font-size: 16px; font-weight: 700; }
.pg-ellipsis { min-width: 24px; text-align: center; color: #94a3b8; font-size: 14px; }
</style>
