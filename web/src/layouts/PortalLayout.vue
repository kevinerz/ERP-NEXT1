<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { usePortalAuthStore } from '@/stores/portalAuth'

const auth   = usePortalAuthStore()
const router = useRouter()

function logout() {
  auth.logout()
  router.push('/portal/login')
}
</script>

<template>
  <div class="portal-app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-icon">🌐</span>
        <span class="brand-name">Portal Pelanggan</span>
        <span class="brand-sub">NEXT ONE</span>
      </div>
      <div class="user-info" v-if="auth.user">
        <div class="user-detail">
          <span class="user-name">{{ auth.user.nama || auth.user.email }}</span>
          <span class="user-company">{{ auth.user.pelanggan?.nama_pelanggan }}</span>
        </div>
        <button class="btn-logout" @click="logout">Keluar</button>
      </div>
    </header>

    <div class="portal-body">
      <nav class="sidebar">
        <RouterLink to="/portal/dashboard" class="nav-item" active-class="active">
          <span class="nav-icon">📡</span> Status Site
        </RouterLink>
        <RouterLink to="/portal/tickets" class="nav-item" active-class="active">
          <span class="nav-icon">🎫</span> Tiket Support
        </RouterLink>
      </nav>
      <main class="portal-main">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.portal-app   { display: flex; flex-direction: column; min-height: 100vh; background: #f0f4f8; font-family: 'Inter', sans-serif; }
.topbar       { display: flex; align-items: center; justify-content: space-between; padding: 0 28px; height: 56px; background: #0f172a; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.2); position: sticky; top: 0; z-index: 10; }
.brand        { display: flex; align-items: center; gap: 10px; }
.brand-icon   { font-size: 20px; }
.brand-name   { font-size: 16px; font-weight: 800; letter-spacing: -0.3px; }
.brand-sub    { font-size: 11px; color: #3b82f6; font-weight: 700; letter-spacing: 0.08em; background: rgba(59,130,246,0.15); padding: 2px 8px; border-radius: 6px; }
.user-info    { display: flex; align-items: center; gap: 16px; }
.user-detail  { display: flex; flex-direction: column; align-items: flex-end; }
.user-name    { font-size: 14px; font-weight: 600; }
.user-company { font-size: 11px; color: #94a3b8; }
.btn-logout   { padding: 6px 14px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; font-size: 13px; cursor: pointer; }
.btn-logout:hover { background: rgba(255,255,255,0.2); }

.portal-body  { display: flex; flex: 1; }
.sidebar      { width: 200px; background: #fff; border-right: 1px solid #e2e8f0; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
.nav-item     { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; color: #374151; text-decoration: none; font-size: 14px; font-weight: 500; transition: background 0.15s; }
.nav-item:hover { background: #f1f5f9; }
.nav-item.active  { background: #eff6ff; color: #1d4ed8; font-weight: 700; }
.nav-icon     { font-size: 16px; }
.portal-main  { flex: 1; overflow-y: auto; }
</style>
