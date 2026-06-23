<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesStore } from '@/stores/sales'

const router = useRouter()
const sales = useSalesStore()

const TAHAPAN_COLOR: Record<string, string> = {
  Prospecting: '#3b82f6', Presentasi: '#8b5cf6', Survey: '#f59e0b',
  Negosiasi: '#f97316', Penawaran: '#06b6d4', Won: '#22c55e', Lost: '#ef4444',
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

onMounted(() => sales.fetchPipeline())
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Sales & CRM</h2>
        <p class="sub">Pipeline, lead, opportunity, dan quotation</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="router.push('/sales/lead')">Kelola Lead</button>
        <button class="btn-primary" @click="router.push('/sales/lead/tambah')">+ Tambah Lead</button>
      </div>
    </div>

    <!-- Pipeline Funnel -->
    <h3 class="section-title">Pipeline Opportunity</h3>
    <div class="pipeline-grid">
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
.page { padding: 28px 32px; max-width: 1100px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.header-actions { display: flex; gap: 10px; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-secondary { padding: 10px 20px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; }

.section-title { margin: 0 0 14px; font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

.pipeline-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.pipeline-card {
  background: #fff; border-radius: 10px; padding: 18px 14px;
  border-top: 4px solid #94a3b8; text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
}
.pipeline-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); transform: translateY(-2px); }
.p-tahapan { font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 8px; }
.p-count { font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
.p-nilai { font-size: 11px; color: #94a3b8; }

.menu-grid { display: flex; gap: 14px; }
.menu-card {
  background: #fff; border-radius: 12px; padding: 22px 28px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.07);
  transition: box-shadow 0.2s, transform 0.2s; min-width: 110px;
}
.menu-card:hover { box-shadow: 0 4px 16px rgba(30,64,175,0.15); transform: translateY(-2px); }
.menu-icon { font-size: 28px; }
.menu-label { font-size: 14px; font-weight: 700; color: #0f172a; }
</style>
