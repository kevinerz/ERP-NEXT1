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
    icon: '🧰',
    label: 'Kontak Teknisi',
    desc: 'Orang pemasang / teknisi pihak ketiga — HP/WA & rekening bank',
    to: '/master/kontak-teknisi',
    color: '#fff7ed',
    accent: '#c2410c',
  },
  {
    icon: '🏬',
    label: 'Gudang',
    desc: 'Lokasi gudang fisik — stok aset per gudang',
    to: '/master/gudang',
    color: '#f0f9ff',
    accent: '#0369a1',
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
    icon: '⚡',
    label: 'Jenis Gangguan',
    desc: 'Kategori gangguan untuk tiket — FO Cut, Listrik Mati, dll',
    to: '/master/jenis-gangguan',
    color: '#fff7ed',
    accent: '#ea580c',
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
.page { max-width: 960px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: var(--text-1); font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: var(--text-3); }

.grid { display: flex; flex-direction: column; gap: 12px; }

.card {
  display: flex; align-items: center; gap: 18px;
  background: var(--surface); border-radius: var(--r-lg); padding: 20px 22px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  border: 1.5px solid var(--border-light);
  transition: box-shadow 0.2s, transform 0.15s, border-color 0.2s;
  text-align: left;
}
.card:hover {
  box-shadow: 0 6px 24px rgba(0,0,0,0.1);
  transform: translateY(-2px);
  border-color: var(--card-accent, #3b82f6);
}

.card-icon-wrap {
  width: 54px; height: 54px; border-radius: var(--r-lg);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.card-icon { font-size: 26px; line-height: 1; }

.card-body { flex: 1; min-width: 0; }
.card-label { font-size: 16px; font-weight: 700; color: var(--text-1); margin-bottom: 4px; }
.card-desc { font-size: 13px; color: var(--text-3); line-height: 1.4; }

@media (max-width: 480px) {
  .card { gap: 12px; padding: 14px 16px; }
  .card-icon-wrap { width: 44px; height: 44px; }
  .card-icon { font-size: 22px; }
  .card-label { font-size: 15px; }
}

.card-arrow {
  font-size: 18px; color: #cbd5e1;
  transition: color 0.2s, transform 0.2s;
  flex-shrink: 0;
}
.card:hover .card-arrow { color: var(--card-accent, #3b82f6); transform: translateX(3px); }
</style>
