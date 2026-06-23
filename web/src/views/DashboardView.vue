<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

const modules = [
  { icon: '👤', name: 'HRIS',         to: '/hris/karyawan',  ready: true },
  { icon: '📦', name: 'Master Data',  to: '/master',         ready: true },
  { icon: '💼', name: 'Sales',        to: '/sales',          ready: true },
  { icon: '📋', name: 'Proyek',       to: '/projects',       ready: true },
  { icon: '🔧', name: 'Operasional',  to: '/operations',     ready: false },
  { icon: '🖥️',  name: 'Aset',        to: '/assets',         ready: false },
  { icon: '📄', name: 'Kontrak',      to: '/contracts',      ready: false },
  { icon: '🔔', name: 'Notifikasi',   to: '/notifications',  ready: false },
  { icon: '📈', name: 'Laporan',      to: '/reports',        ready: false },
  { icon: '🔗', name: 'Integrasi',    to: '/integrations',   ready: false },
]
</script>

<template>
  <div class="page">
    <div class="welcome-card">
      <h2>Selamat datang, {{ auth.user?.nama_lengkap }}! 👋</h2>
      <p>{{ auth.user?.jabatan }} · {{ auth.user?.departemen }}</p>
    </div>

    <h3 class="section-title">Modul</h3>
    <div class="module-grid">
      <div
        v-for="m in modules"
        :key="m.name"
        :class="['module-card', { clickable: m.ready }]"
        @click="m.ready && router.push(m.to)"
      >
        <div class="module-icon">{{ m.icon }}</div>
        <div class="module-label">{{ m.name }}</div>
        <div :class="m.ready ? 'badge-ready' : 'badge-soon'">
          {{ m.ready ? 'Tersedia' : 'Soon' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; }

.welcome-card {
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 12px;
  padding: 28px 32px;
  margin-bottom: 28px;
  color: #fff;
}
.welcome-card h2 { margin: 0 0 4px; font-size: 22px; }
.welcome-card p { margin: 0; opacity: 0.8; font-size: 14px; }

.section-title { margin: 0 0 16px; font-size: 16px; color: #64748b; font-weight: 600; }

.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.module-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: box-shadow 0.2s, transform 0.2s;
}
.module-card.clickable { cursor: pointer; }
.module-card.clickable:hover {
  box-shadow: 0 6px 20px rgba(30,64,175,0.15);
  transform: translateY(-2px);
}
.module-icon { font-size: 30px; margin-bottom: 10px; }
.module-label { font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 6px; }
.badge-ready {
  background: #dcfce7; color: #15803d;
  padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
  display: inline-block;
}
.badge-soon {
  background: #f1f5f9; color: #94a3b8;
  padding: 2px 10px; border-radius: 20px; font-size: 11px;
  display: inline-block;
}
</style>
