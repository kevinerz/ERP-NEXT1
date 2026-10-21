<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesStore } from '@/stores/sales'

const router = useRouter()
const sales = useSalesStore()
const loadError = ref('')
const loaded = ref(false)

const TAHAPAN_COLOR: Record<string, string> = {
  Prospecting: '#3b82f6', Presentasi: '#8b5cf6', Survey: '#f59e0b',
  Negosiasi: '#f97316', Penawaran: '#06b6d4', Won: '#22c55e', Lost: '#ef4444',
}

// Singkatan rupiah gaya Indonesia: rb (ribu), jt (juta), M (miliar)
function fmt(n: number) {
  n = Number(n) || 0
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`
  return n.toLocaleString('id-ID')
}

onMounted(async () => {
  try { await sales.fetchPipeline() }
  catch (e: any) { loadError.value = e?.response?.data?.message || 'Gagal memuat data pipeline' }
  finally { loaded.value = true }
})
</script>

<template>
  <div class="page">
    <div v-if="loadError" class="error-banner">⚠ {{ loadError }}</div>
    <div class="page-header">
      <div>
        <h2>Sales & CRM</h2>
        <p class="sub">Pipeline, lead, opportunity, dan quotation</p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-secondary" @click="router.push('/sales/lead')">Kelola Lead</button>
        <button type="button" class="btn btn-primary" @click="router.push('/sales/lead?new=1')">+ Tambah Lead</button>
      </div>
    </div>

    <!-- Pipeline Funnel -->
    <h3 class="section-title">Pipeline Opportunity</h3>
    <div v-if="!sales.pipeline.length && !loadError" class="pipeline-empty">{{ loaded ? 'Belum ada data pipeline' : 'Memuat...' }}</div>
    <div v-else class="pipeline-grid">
      <div
        v-for="p in sales.pipeline"
        :key="p.tahapan"
        class="pipeline-card"
        :style="{ borderTopColor: TAHAPAN_COLOR[p.tahapan] || '#94a3b8' }"
        @click="router.push(`/sales/opportunity?tahapan=${p.tahapan}`)"
      >
        <div class="p-tahapan">{{ p.tahapan }}</div>
        <div class="p-count">{{ p.count }}</div>
        <div class="p-nilai">Rp {{ fmt(p.total_nilai) }}</div>
      </div>
    </div>

    <!-- Quick nav -->
    <h3 class="section-title" style="margin-top:28px">Menu</h3>
    <div class="menu-grid">
      <div class="menu-card" @click="router.push('/sales/lead')">
        <span class="menu-icon">📋</span>
        <span class="menu-label">Lead</span>
      </div>
      <div class="menu-card" @click="router.push('/sales/opportunity')">
        <span class="menu-icon">🎯</span>
        <span class="menu-label">Opportunity</span>
      </div>
      <div class="menu-card" @click="router.push('/sales/quotation')">
        <span class="menu-icon">📄</span>
        <span class="menu-label">Quotation</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1100px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: var(--text-1); }
.sub { margin: 0; font-size: 13px; color: var(--text-3); }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.section-title { margin: 0 0 14px; font-size: 14px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }

.pipeline-empty { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13.5px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--r); }
.pipeline-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.pipeline-card {
  background: var(--surface); border-radius: var(--r); padding: 18px 14px;
  border: 1px solid var(--border); border-top: 4px solid var(--text-muted); text-align: center;
  box-shadow: var(--shadow-sm); cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
}
.pipeline-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
.p-tahapan { font-size: 12px; font-weight: 700; color: var(--text-3); margin-bottom: 8px; }
.p-count { font-size: 28px; font-weight: 800; color: var(--text-1); margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.p-nilai { font-size: 11.5px; color: var(--text-3); }

.menu-grid { display: flex; gap: 14px; flex-wrap: wrap; }
.menu-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 22px 28px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  cursor: pointer; box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s; min-width: 110px;
}
.menu-card:hover { box-shadow: 0 4px 16px rgba(30,64,175,0.15); transform: translateY(-2px); }
.menu-icon { font-size: 28px; }
.menu-label { font-size: 14px; font-weight: 700; color: var(--text-1); }
.error-banner { margin-bottom: 20px; padding: 12px 16px; background: var(--danger-light); border: 1px solid #fecaca; border-radius: var(--r); color: #b91c1c; font-size: 14px; font-weight: 500; }
</style>
