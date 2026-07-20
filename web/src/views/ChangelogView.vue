<script setup lang="ts">
import { computed } from 'vue'
import { fmtRelativeTime, fmtDateTime } from '@/composables/useFormat'

// __APP_CHANGELOG__ dibangkitkan otomatis dari git log saat build (lihat
// vite.config.ts) — tidak ada yang perlu diedit manual di sini setiap rilis.
// Disalin ke const lokal (bukan dipakai langsung di template) karena compiler
// template Vue tidak resolve identifier global custom seperti ini.
const entries = __APP_CHANGELOG__
const appVersion = __APP_VERSION__
const appHash = __APP_GIT_HASH__

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  feat:     { label: 'Fitur Baru',   icon: '✨', color: '#2563eb' },
  fix:      { label: 'Perbaikan',    icon: '🛠️', color: '#dc2626' },
  chore:    { label: 'Housekeeping', icon: '🧹', color: '#64748b' },
  refactor: { label: 'Refactor',     icon: '♻️', color: '#7c3aed' },
  perf:     { label: 'Performa',     icon: '⚡', color: '#d97706' },
  docs:     { label: 'Dokumentasi',  icon: '📝', color: '#0891b2' },
  style:    { label: 'Tampilan',     icon: '💅', color: '#db2777' },
  test:     { label: 'Pengujian',    icon: '✅', color: '#16a34a' },
  update:   { label: 'Update',       icon: '🔹', color: '#475569' },
}

function typeMeta(t: string) {
  return TYPE_META[t] || TYPE_META.update
}

// Kelompokkan entri berurutan dengan versi yang sama jadi satu blok versi,
// supaya rilis yang terdiri dari beberapa commit tampil sebagai satu grup.
const groups = computed(() => {
  const out: { version: string; items: typeof entries }[] = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (last && last.version === e.version) last.items.push(e)
    else out.push({ version: e.version, items: [e] })
  }
  return out
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Changelog</h2>
        <p class="sub">Riwayat pembaruan aplikasi — dibangkitkan otomatis dari commit git tiap build</p>
      </div>
      <div class="current-badge">
        <span class="cb-label">Versi saat ini</span>
        <span class="cb-version">v{{ appVersion }}</span>
        <span class="cb-hash">{{ appHash }}</span>
      </div>
    </div>

    <div v-if="!groups.length" class="empty-state">
      Riwayat changelog tidak tersedia (git log tidak terbaca saat build).
    </div>

    <div v-else class="timeline">
      <div v-for="(g, gi) in groups" :key="g.version + gi" class="version-block">
        <div class="version-marker">
          <div class="version-dot" :class="{ latest: gi === 0 }"></div>
          <div class="version-line" v-if="gi < groups.length - 1"></div>
        </div>
        <div class="version-content">
          <div class="version-heading">
            <span class="version-tag">v{{ g.version }}</span>
            <span v-if="gi === 0" class="latest-chip">Terbaru</span>
            <span class="version-date">{{ fmtRelativeTime(g.items[0].date) }}</span>
          </div>
          <div class="version-items">
            <div v-for="it in g.items" :key="it.hash" class="entry">
              <span class="entry-icon" :style="{ color: typeMeta(it.type).color }">{{ typeMeta(it.type).icon }}</span>
              <div class="entry-body">
                <div class="entry-subject">{{ it.subject }}</div>
                <div class="entry-meta">
                  <span class="entry-type" :style="{ background: typeMeta(it.type).color + '1a', color: typeMeta(it.type).color }">
                    {{ typeMeta(it.type).label }}
                  </span>
                  <span class="entry-hash">{{ it.hash }}</span>
                  <span class="entry-date" :title="fmtDateTime(it.date)">{{ fmtDateTime(it.date) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 820px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

.current-badge {
  display: flex; flex-direction: column; align-items: flex-end;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px;
  padding: 8px 16px; flex-shrink: 0;
}
.cb-label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
.cb-version { font-size: 16px; font-weight: 800; color: #1d4ed8; line-height: 1.3; }
.cb-hash { font-size: 11px; color: #94a3b8; font-family: 'Consolas', monospace; }

.empty-state { padding: 60px 20px; text-align: center; color: #94a3b8; font-size: 14px; background: #fff; border-radius: 12px; }

.timeline { display: flex; flex-direction: column; }

.version-block { display: flex; gap: 16px; }
.version-marker { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; padding-top: 4px; }
.version-dot { width: 12px; height: 12px; border-radius: 50%; background: #cbd5e1; border: 2px solid #fff; box-shadow: 0 0 0 2px #cbd5e1; flex-shrink: 0; }
.version-dot.latest { background: #2563eb; box-shadow: 0 0 0 2px #2563eb, 0 0 0 5px #dbeafe; }
.version-line { width: 2px; flex: 1; background: #e2e8f0; margin: 4px 0; min-height: 20px; }

.version-content { flex: 1; min-width: 0; padding-bottom: 24px; }
.version-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.version-tag { font-size: 14px; font-weight: 800; color: #0f172a; }
.latest-chip { font-size: 10px; font-weight: 700; color: #1d4ed8; background: #dbeafe; padding: 2px 8px; border-radius: 10px; }
.version-date { font-size: 12px; color: #94a3b8; margin-left: auto; }

.version-items {
  background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  overflow: hidden;
}
.entry { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
.entry:last-child { border-bottom: none; }
.entry-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.entry-body { flex: 1; min-width: 0; }
.entry-subject { font-size: 13.5px; color: #1e293b; line-height: 1.5; }
.entry-meta { display: flex; align-items: center; gap: 8px; margin-top: 5px; flex-wrap: wrap; }
.entry-type { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }
.entry-hash { font-size: 11px; color: #94a3b8; font-family: 'Consolas', monospace; }
.entry-date { font-size: 11px; color: #cbd5e1; }

@media (max-width: 640px) {
  .page { padding: 16px; }
  .page-header { flex-direction: column; }
  .current-badge { align-items: flex-start; align-self: stretch; flex-direction: row; justify-content: space-between; }
}
</style>
