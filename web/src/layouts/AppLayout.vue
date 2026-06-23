<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const sidebarOpen = ref(true)

function logout() {
  auth.logout()
  router.push('/login')
}

const menu = [
  { label: 'Dashboard',   icon: '📊', to: '/dashboard' },
  { label: 'HRIS',        icon: '👤', to: '/hris/karyawan' },
  { label: 'Master Data', icon: '📦', to: '/master' },
  { label: 'Sales',       icon: '💼', to: '/sales' },
  { label: 'Proyek',      icon: '📋', to: '/projects' },
  { label: 'Operasional', icon: '🔧', to: '/operations',   soon: true },
  { label: 'Aset',        icon: '🖥️',  to: '/assets',      soon: true },
  { label: 'Kontrak',     icon: '📄', to: '/contracts',    soon: true },
  { label: 'Laporan',     icon: '📈', to: '/reports',      soon: true },
]
</script>

<template>
  <div class="app-shell">
    <aside :class="['sidebar', { collapsed: !sidebarOpen }]">
      <div class="sidebar-top">
        <div class="brand">
          <div class="logo-box">N1</div>
          <span v-if="sidebarOpen" class="brand-name">ERP NEXT1</span>
        </div>
        <button class="toggle-btn" @click="sidebarOpen = !sidebarOpen">
          {{ sidebarOpen ? '◀' : '▶' }}
        </button>
      </div>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in menu"
          :key="item.to"
          :to="item.soon ? route.fullPath : item.to"
          :class="['nav-item', { disabled: item.soon }]"
          active-class="active"
          exact-active-class="active"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span v-if="sidebarOpen" class="nav-label">
            {{ item.label }}
            <span v-if="item.soon" class="soon-tag">soon</span>
          </span>
        </RouterLink>
      </nav>

      <div class="sidebar-bottom" v-if="sidebarOpen">
        <div class="user-chip">
          <div class="user-avatar">{{ auth.user?.nama_lengkap?.charAt(0) }}</div>
          <div class="user-detail">
            <div class="user-name">{{ auth.user?.nama_lengkap }}</div>
            <div class="user-role">{{ auth.user?.roles?.[0] }}</div>
          </div>
        </div>
        <button class="btn-logout" @click="logout">Keluar</button>
      </div>
      <div class="sidebar-bottom-collapsed" v-else>
        <button class="btn-logout-icon" @click="logout" title="Keluar">🚪</button>
      </div>
    </aside>

    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.app-shell { display: flex; min-height: 100vh; background: #f1f5f9; }
.sidebar {
  width: 240px; min-height: 100vh; background: #0f172a;
  display: flex; flex-direction: column; transition: width 0.2s;
  flex-shrink: 0; position: sticky; top: 0; height: 100vh; overflow: hidden;
}
.sidebar.collapsed { width: 64px; }
.sidebar-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.08);
}
.brand { display: flex; align-items: center; gap: 10px; overflow: hidden; }
.logo-box {
  width: 36px; height: 36px; flex-shrink: 0;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 14px; color: #fff;
}
.brand-name { font-weight: 700; font-size: 15px; color: #fff; white-space: nowrap; }
.toggle-btn { background: none; border: none; color: #64748b; cursor: pointer; font-size: 12px; padding: 4px; flex-shrink: 0; }
.toggle-btn:hover { color: #fff; }
.sidebar-nav { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px;
  border-radius: 8px; color: #94a3b8; text-decoration: none; font-size: 14px;
  transition: background 0.15s, color 0.15s; white-space: nowrap; overflow: hidden;
}
.nav-item:hover:not(.disabled) { background: rgba(255,255,255,0.08); color: #fff; }
.nav-item.active { background: #1e40af; color: #fff; }
.nav-item.disabled { cursor: default; opacity: 0.5; pointer-events: none; }
.nav-icon { font-size: 16px; flex-shrink: 0; width: 22px; text-align: center; }
.nav-label { display: flex; align-items: center; gap: 6px; }
.soon-tag { background: rgba(255,255,255,0.15); color: #94a3b8; font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.sidebar-bottom { padding: 12px; border-top: 1px solid rgba(255,255,255,0.08); }
.user-chip {
  display: flex; align-items: center; gap: 10px; padding: 8px;
  border-radius: 8px; background: rgba(255,255,255,0.05); margin-bottom: 8px; overflow: hidden;
}
.user-avatar {
  width: 32px; height: 32px; flex-shrink: 0; background: #1e40af; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 14px;
}
.user-detail { overflow: hidden; }
.user-name { font-size: 13px; color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-role { font-size: 11px; color: #64748b; }
.btn-logout { width: 100%; padding: 7px; background: rgba(239,68,68,0.15); color: #ef4444; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-logout:hover { background: rgba(239,68,68,0.25); }
.sidebar-bottom-collapsed { padding: 12px 8px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: center; }
.btn-logout-icon { background: none; border: none; font-size: 18px; cursor: pointer; }
.main-content { flex: 1; min-width: 0; overflow-y: auto; }
</style>
