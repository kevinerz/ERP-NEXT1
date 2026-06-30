<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()

const menus = [
  {
    icon: '🌐',
    label: 'Layanan',
    desc: 'FO, M2M, Starlink, dan tipe layanan internet lainnya',
    to: '/master/layanan',
    color: '#eff6ff',
    accent: '#1d4ed8',
  },
  {
    icon: '🏢',
    label: 'Vendor ISP',
    desc: 'ISP, vendor perangkat, mitra jaringan, dan cloud',
    to: '/master/vendor',
    color: '#f0fdf4',
    accent: '#15803d',
  },
  {
    icon: '👥',
    label: 'Pelanggan',
    desc: 'Data customer, klien korporat, dan informasi kontrak',
    to: '/master/pelanggan',
    color: '#faf5ff',
    accent: '#7c3aed',
  },
  {
    icon: '📍',
    label: 'Site Pelanggan',
    desc: 'Lokasi instalasi layanan dan data teknis tiap site',
    to: '/master/site',
    color: '#fff7ed',
    accent: '#c2410c',
  },
  {
    icon: '🔩',
    label: 'Pengaturan',
    desc: 'Konfigurasi sistem, logo, dan preferensi aplikasi',
    to: '/settings',
    color: '#f8fafc',
    accent: '#475569',
  },
]
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Master Data</h2>
        <p class="sub">Data referensi yang digunakan oleh seluruh modul sistem</p>
      </div>
    </div>

    <div class="grid">
      <div
        v-for="m in menus"
        :key="m.to"
        class="card"
        @click="router.push(m.to)"
        :style="{ '--card-accent': m.accent, '--card-bg': m.color }"
      >
        <div class="card-icon-wrap" :style="{ background: m.color }">
          <span class="card-icon">{{ m.icon }}</span>
        </div>
        <div class="card-body">
          <div class="card-label">{{ m.label }}</div>
          <div class="card-desc">{{ m.desc }}</div>
        </div>
        <div class="card-arrow">→</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 860px; }
.page-header { margin-bottom: 28px; }
.page-header h2 { margin: 0 0 6px; font-size: 24px; color: #0f172a; font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

.grid { display: flex; flex-direction: column; gap: 12px; }

.card {
  display: flex; align-items: center; gap: 18px;
  background: #fff; border-radius: 14px; padding: 20px 22px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
  border: 1.5px solid #f1f5f9;
  transition: box-shadow 0.2s, transform 0.15s, border-color 0.2s;
  text-align: left;
}
.card:hover {
  box-shadow: 0 6px 24px rgba(0,0,0,0.1);
  transform: translateY(-2px);
  border-color: var(--card-accent, #3b82f6);
}

.card-icon-wrap {
  width: 54px; height: 54px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.card-icon { font-size: 26px; line-height: 1; }

.card-body { flex: 1; }
.card-label { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
.card-desc { font-size: 13px; color: #64748b; line-height: 1.4; }

.card-arrow {
  font-size: 18px; color: #cbd5e1;
  transition: color 0.2s, transform 0.2s;
  flex-shrink: 0;
}
.card:hover .card-arrow { color: var(--card-accent, #3b82f6); transform: translateX(3px); }
</style>
