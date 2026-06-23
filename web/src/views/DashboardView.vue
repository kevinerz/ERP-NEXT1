<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

const allModules = [
  { icon: '👤', name: 'HRIS',        to: '/hris/karyawan', modul: 'hris' },
  { icon: '📦', name: 'Master Data', to: '/master',        modul: 'master' },
  { icon: '💼', name: 'Sales',       to: '/sales',         modul: 'sales' },
  { icon: '📋', name: 'Proyek',      to: '/projects',      modul: 'projects' },
  { icon: '🔧', name: 'Operasional', to: '/operations',    modul: 'operations' },
  { icon: '🖥️',  name: 'Aset',       to: '/assets',        modul: 'assets' },
  { icon: '📄', name: 'Kontrak',     to: '/contracts',     modul: 'contracts' },
  { icon: '📈', name: 'Laporan',     to: '/reports',       modul: 'reports' },
  { icon: '⚙️',  name: 'Users',      to: '/admin/users',   modul: null, adminOnly: true },
]

const modules = computed(() =>
  allModules.filter((m) => {
    if (m.adminOnly) return auth.isSuperAdmin
    return auth.canAccess(m.modul!)
  })
)
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
        class="module-card clickable"
        @click="router.push(m.to)"
      >
        <div class="module-icon">{{ m.icon }}</div>
        <div class="module-label">{{ m.name }}</div>
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
  cursor: pointer;
}
.module-card:hover {
  box-shadow: 0 6px 20px rgba(30,64,175,0.15);
  transform: translateY(-2px);
}
.module-icon { font-size: 30px; margin-bottom: 10px; }
.module-label { font-size: 14px; font-weight: 600; color: #0f172a; }
</style>
