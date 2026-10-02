<script setup lang="ts">
import { ref, computed } from 'vue'

interface Contact { email: string; nama_lengkap: string }

const props = defineProps<{
  modelValue: string[]
  contacts: Contact[]
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: string[]] }>()

const inputText = ref('')
const focused = ref(false)
const highlightIdx = ref(-1)
const inputEl = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  const q = inputText.value.toLowerCase().trim()
  const selected = new Set(props.modelValue)
  if (!q) {
    return props.contacts.filter(c => !selected.has(c.email)).slice(0, 8)
  }
  return props.contacts
    .filter(c => !selected.has(c.email) &&
      (c.nama_lengkap.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)))
    .slice(0, 10)
})

const showDropdown = computed(() => focused.value && filtered.value.length > 0)

function chipLabel(email: string): string {
  const c = props.contacts.find(x => x.email === email)
  if (!c) return email
  const parts = c.nama_lengkap.trim().split(' ')
  const short = parts.length > 1
    ? parts[0] + ' ' + parts[parts.length - 1][0] + '.'
    : parts[0]
  return short.length > 22 ? short.slice(0, 21) + '…' : short
}

function addEmail(raw: string) {
  for (const part of raw.split(',')) {
    const m = part.match(/<([^>]+)>/)
    const email = (m ? m[1] : part).trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    if (!props.modelValue.includes(email)) {
      emit('update:modelValue', [...props.modelValue, email])
    }
  }
  inputText.value = ''
  highlightIdx.value = -1
}

function addContact(c: Contact) {
  if (!props.modelValue.includes(c.email)) {
    emit('update:modelValue', [...props.modelValue, c.email])
  }
  inputText.value = ''
  highlightIdx.value = -1
  inputEl.value?.focus()
}

function removeTag(i: number) {
  const v = [...props.modelValue]
  v.splice(i, 1)
  emit('update:modelValue', v)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
    if (highlightIdx.value >= 0 && filtered.value[highlightIdx.value]) {
      e.preventDefault()
      addContact(filtered.value[highlightIdx.value])
    } else if (inputText.value.trim()) {
      e.preventDefault()
      addEmail(inputText.value)
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIdx.value = Math.min(highlightIdx.value + 1, filtered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
  } else if (e.key === 'Backspace' && !inputText.value && props.modelValue.length) {
    removeTag(props.modelValue.length - 1)
  } else if (e.key === 'Escape') {
    focused.value = false
  }
}

function onBlur() {
  setTimeout(() => {
    focused.value = false
    if (inputText.value.includes('@')) addEmail(inputText.value)
    else inputText.value = ''
  }, 180)
}

function onFocus() {
  focused.value = true
  highlightIdx.value = -1
}

function focusInput() { inputEl.value?.focus() }
</script>

<template>
  <div class="ri-wrap" :class="{ focused }" @click="focusInput">
    <span v-for="(tag, i) in modelValue" :key="tag" class="ri-chip" :title="tag">
      <span class="ri-chip-label">{{ chipLabel(tag) }}</span>
      <button type="button" class="ri-chip-remove" @click.stop="removeTag(i)" tabindex="-1">×</button>
    </span>
    <input
      ref="inputEl"
      v-model="inputText"
      type="text"
      :placeholder="modelValue.length ? '' : (placeholder ?? 'Ketik nama atau email…')"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <transition name="ri-drop">
      <div v-if="showDropdown" class="ri-dropdown">
        <div
          v-for="(c, idx) in filtered"
          :key="c.email"
          class="ri-item"
          :class="{ 'ri-item--active': idx === highlightIdx }"
          @mousedown.prevent="addContact(c)"
        >
          <span class="ri-item-name">{{ c.nama_lengkap }}</span>
          <span class="ri-item-email">{{ c.email }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.ri-wrap {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  min-height: 40px;
  padding: 5px 10px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  cursor: text;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.ri-wrap.focused {
  border-color: #3b82f6;
  background: #fff;
  box-shadow: 0 0 0 3px #3b82f618;
}

.ri-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 20px;
  padding: 3px 5px 3px 10px;
  font-size: 12.5px;
  font-weight: 600;
  max-width: 220px;
  white-space: nowrap;
  transition: background .12s;
}
.ri-chip:hover { background: #c7d2fe; }
.ri-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ri-chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  color: #4f46e5;
  border-radius: 50%;
  opacity: .65;
  padding: 0;
}
.ri-chip-remove:hover { opacity: 1; background: #a5b4fc44; }

input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  color: #0f172a;
  padding: 3px 2px;
}
input::placeholder { color: #94a3b8; }

/* Dropdown */
.ri-dropdown {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  right: 0;
  z-index: 1100;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0,0,0,.13);
  overflow: hidden;
}
.ri-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 14px;
  gap: 12px;
  cursor: pointer;
  transition: background .1s;
}
.ri-item:not(:last-child) { border-bottom: 1px solid #f1f5f9; }
.ri-item:hover,
.ri-item--active { background: #eff6ff; }
.ri-item-name {
  font-size: 13.5px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ri-item-email {
  font-size: 12px;
  color: #64748b;
  flex-shrink: 0;
  text-align: right;
}

/* Transition */
.ri-drop-enter-active, .ri-drop-leave-active { transition: opacity .12s, transform .12s; }
.ri-drop-enter-from, .ri-drop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
