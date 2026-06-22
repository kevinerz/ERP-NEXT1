<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="dashboard">
    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-left">
        <div class="logo-box">N1</div>
        <span class="app-name">ERP NEXT1</span>
      </div>
      <div class="topbar-right">
        <span class="user-info">
          {{ auth.user?.nama_lengkap }} &mdash; {{ auth.user?.jabatan }}
        </span>
        <button class="btn-logout" @click="handleLogout">Keluar</button>
      </div>
    </header>

    <!-- Content -->
    <main class="content">
      <div class="welcome-card">
        <h2>Selamat datang, {{ auth.user?.nama_lengkap }}! 👋</h2>
        <p>ERP NEXT1 berhasil diakses. Modul-modul sedang dalam pengembangan.</p>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Username</span>
            <span class="value">{{ auth.user?.username }}</span>
          </div>
          <div class="info-item">
            <span class="label">Departemen</span>
            <span class="value">{{ auth.user?.departemen }}</span>
          </div>
          <div class="info-item">
            <span class="label">Role</span>
            <span class="value">{{ auth.user?.roles.join(', ') }}</span>
          </div>
        </div>
      </div>

      <!-- Module cards (placeholder) -->
      <div class="module-grid">
        <div class="module-card" v-for="m in modules" :key="m.name">
          <div class="module-icon">{{ m.icon }}</div>
          <div class="module-label">{{ m.name }}</div>
          <div class="module-status">{{ m.status }}</div>
        </div>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
const modules = [
  { icon: '👤', name: 'HRIS',         status: 'Coming soon' },
  { icon: '📦', name: 'Master Data',  status: 'Coming soon' },
  { icon: '💼', name: 'Sales',        status: 'Coming soon' },
  { icon: '📋', name: 'Proyek',       status: 'Coming soon' },
  { icon: '🔧', name: 'Operasional',  status: 'Coming soon' },
  { icon: '🖥️',  name: 'Aset',        status: 'Coming soon' },
  { icon: '📄', name: 'Kontrak',      status: 'Coming soon' },
  { icon: '🔔', name: 'Notifikasi',   status: 'Coming soon' },
  { icon: '📊', name: 'Laporan',      status: 'Coming soon' },
  { icon: '🔗', name: 'Integrasi',    status: 'Coming soon' },
]
</script>

<style scoped>
* { box-sizing: border-box; }

.dashboard {
  min-height: 100vh;
  background: #f1f5f9;
  font-family: 'Segoe UI', sans-serif;
}

.topbar {
  background: #0f172a;
  color: #fff;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-box {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
}

.app-name {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.5px;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  font-size: 13px;
  color: #94a3b8;
}

.btn-logout {
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-logout:hover { opacity: 0.85; }

.content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

.welcome-card {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px;
  margin-bottom: 28px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.welcome-card h2 {
  margin: 0 0 8px;
  font-size: 22px;
  color: #0f172a;
}

.welcome-card p {
  margin: 0 0 20px;
  color: #64748b;
  font-size: 14px;
}

.info-grid {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
  font-weight: 600;
}

.value {
  font-size: 14px;
  color: #0f172a;
  font-weight: 600;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.module-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  transition: box-shadow 0.2s, transform 0.2s;
  cursor: default;
}

.module-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  transform: translateY(-2px);
}

.module-icon {
  font-size: 32px;
  margin-bottom: 10px;
}

.module-label {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 4px;
}

.module-status {
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 4px;
  padding: 2px 8px;
  display: inline-block;
}
</style>
