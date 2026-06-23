<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import api from '@/services/api'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const notif  = useNotificationStore()

const sidebarOpen    = ref(true)
const showNotifPanel = ref(false)

onMounted(() => {
  notif.startPolling()
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => {
  notif.stopPolling()
  document.removeEventListener('click', onDocClick)
})

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.notif-area')) showNotifPanel.value = false
}

async function toggleNotifPanel() {
  showNotifPanel.value = !showNotifPanel.value
  if (showNotifPanel.value) await notif.fetchNotifications()
}

function goNotif(n: any) {
  notif.markRead(n.id_notif)
  showNotifPanel.value = false
  if (n.url) router.push(n.url)
}

async function logout() {
  try { await api.post('/auth/logout') } catch {}
  notif.stopPolling()
  auth.logout()
  router.push('/login')
}

const TIPE_ICON: Record<string, string> = {
  tiket_baru:         '🎫',
  tiket_update:       '🔄',
  quotation_approval: '📋',
}

function fmtTime(d: string) {
  const dt = new Date(d)
  const diffMin = Math.floor((Date.now() - dt.getTime()) / 60000)
  if (diffMin < 1) return 'baru saja'
  if (diffMin < 60) return `${diffMin} menit lalu`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} jam lalu`
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

const allMenu = [
  { label: 'Dashboard',     icon: '📊', to: '/dashboard',    modul: null },
  { label: 'HRIS',          icon: '👤', to: '/hris/karyawan', modul: 'hris' },
  { label: 'Master Data',   icon: '📦', to: '/master',        modul: 'master' },
  { label: 'Sales',         icon: '💼', to: '/sales',         modul: 'sales' },
  { label: 'Proyek',        icon: '📋', to: '/projects',      modul: 'projects' },
  { label: 'Operasional',   icon: '🔧', to: '/operations',    modul: 'operations' },
  { label: 'Aset',          icon: '🖥️',  to: '/assets',       modul: 'assets' },
  { label: 'Kontrak',       icon: '📄', to: '/contracts',     modul: 'contracts' },
  { label: 'Laporan',       icon: '📈', to: '/reports',       modul: 'reports' },
  { label: 'Users',         icon: '⚙️',  to: '/admin/users',  modul: null, adminOnly: true },
  { label: 'Activity Log',  icon: '📝', to: '/admin/logs',   modul: null, adminOnly: true },
]

const menu = computed(() =>
  allMenu.filter((m) => {
    if (m.adminOnly) return auth.isSuperAdmin
    if (!m.modul) return true
    return auth.canAccess(m.modul)
  })
)
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
          :to="item.to"
          class="nav-item"
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

      <!-- Sidebar bottom (expanded) -->
      <div class="sidebar-bottom" v-if="sidebarOpen">
        <!-- Bell -->
        <div class="notif-area">
          <button class="btn-bell" @click.stop="toggleNotifPanel">
            <span class="bell-icon">🔔</span>
            <span class="bell-label">Notifikasi</span>
            <span v-if="notif.count > 0" class="bell-badge">{{ notif.count > 99 ? '99+' : notif.count }}</span>
          </button>
          <div v-if="showNotifPanel" class="notif-panel" @click.stop>
            <div class="notif-panel-header">
              <span class="np-title">Notifikasi</span>
              <button v-if="notif.count > 0" class="np-read-all" @click="notif.markAllRead()">Baca Semua</button>
            </div>
            <div v-if="notif.loading" class="np-empty">Memuat...</div>
            <div v-else-if="!notif.notifications.length" class="np-empty">Belum ada notifikasi</div>
            <div v-else class="np-list">
              <div
                v-for="n in notif.notifications" :key="n.id_notif"
                :class="['np-item', { unread: !n.is_read }]"
                @click="goNotif(n)"
              >
                <div class="np-icon">{{ TIPE_ICON[n.tipe] || '🔔' }}</div>
                <div class="np-body">
                  <div class="np-judul">{{ n.judul }}</div>
                  <div class="np-desc" v-if="n.deskripsi">{{ n.deskripsi }}</div>
                  <div class="np-time">{{ fmtTime(n.created_at) }}</div>
                </div>
                <div v-if="!n.is_read" class="np-dot"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="user-chip">
          <div class="user-avatar">{{ auth.user?.nama_lengkap?.charAt(0) }}</div>
          <div class="user-detail">
            <div class="user-name">{{ auth.user?.nama_lengkap }}</div>
            <div class="user-role">{{ auth.user?.roles?.[0] }}</div>
          </div>
        </div>
        <button class="btn-logout" @click="logout">Keluar</button>
      </div>

      <!-- Sidebar bottom (collapsed) -->
      <div class="sidebar-bottom-collapsed" v-else>
        <div class="notif-area">
          <button class="btn-bell-icon" @click.stop="toggleNotifPanel" title="Notifikasi">
            🔔
            <span v-if="notif.count > 0" class="bell-badge-sm">{{ notif.count > 9 ? '9+' : notif.count }}</span>
          </button>
          <div v-if="showNotifPanel" class="notif-panel notif-panel-side" @click.stop>
            <div class="notif-panel-header">
              <span class="np-title">Notifikasi</span>
              <button v-if="notif.count > 0" class="np-read-all" @click="notif.markAllRead()">Baca Semua</button>
            </div>
            <div v-if="notif.loading" class="np-empty">Memuat...</div>
            <div v-else-if="!notif.notifications.length" class="np-empty">Belum ada notifikasi</div>
            <div v-else class="np-list">
              <div
                v-for="n in notif.notifications" :key="n.id_notif"
                :class="['np-item', { unread: !n.is_read }]"
                @click="goNotif(n)"
              >
                <div class="np-icon">{{ TIPE_ICON[n.tipe] || '🔔' }}</div>
                <div class="np-body">
                  <div class="np-judul">{{ n.judul }}</div>
                  <div class="np-desc" v-if="n.deskripsi">{{ n.deskripsi }}</div>
                  <div class="np-time">{{ fmtTime(n.created_at) }}</div>
                </div>
                <div v-if="!n.is_read" class="np-dot"></div>
              </div>
            </div>
          </div>
        </div>
        <button class="btn-logout-icon" @click="logout" title="Keluar">🚪</button>
      </div>
    </aside>

    <main class="main-content">
      <RouterView />
    </main>

    <!-- Toast container -->
    <div class="toast-container">
      <div
        v-for="toast in notif.toasts" :key="toast.id"
        class="toast"
        @click="notif.dismissToast(toast.id); toast.url && router.push(toast.url)"
      >
        <div class="toast-icon">🔔</div>
        <div class="toast-body">
          <div class="toast-title">{{ toast.judul }}</div>
          <div class="toast-desc" v-if="toast.deskripsi">{{ toast.deskripsi }}</div>
        </div>
        <button class="toast-close" @click.stop="notif.dismissToast(toast.id)">×</button>
      </div>
    </div>
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

/* Sidebar bottom */
.sidebar-bottom { padding: 12px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 8px; }

/* Bell */
.notif-area { position: relative; }
.btn-bell {
  width: 100%; display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.06); border: none; border-radius: 8px;
  padding: 8px 10px; color: #cbd5e1; cursor: pointer; font-size: 13px; font-weight: 500;
  transition: background 0.15s;
}
.btn-bell:hover { background: rgba(255,255,255,0.12); color: #fff; }
.bell-icon { font-size: 16px; }
.bell-label { flex: 1; text-align: left; }
.bell-badge {
  background: #ef4444; color: #fff; font-size: 10px; font-weight: 700;
  border-radius: 10px; padding: 1px 6px; min-width: 20px; text-align: center;
}

/* User */
.user-chip {
  display: flex; align-items: center; gap: 10px; padding: 8px;
  border-radius: 8px; background: rgba(255,255,255,0.05); overflow: hidden;
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

/* Collapsed */
.sidebar-bottom-collapsed {
  padding: 12px 8px; border-top: 1px solid rgba(255,255,255,0.08);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.btn-bell-icon {
  position: relative; background: none; border: none; font-size: 18px; cursor: pointer;
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; transition: background 0.15s; color: #94a3b8;
}
.btn-bell-icon:hover { background: rgba(255,255,255,0.08); }
.bell-badge-sm {
  position: absolute; top: 2px; right: 2px;
  background: #ef4444; color: #fff; font-size: 9px; font-weight: 700;
  border-radius: 8px; padding: 1px 4px; min-width: 16px; text-align: center;
}
.btn-logout-icon { background: none; border: none; font-size: 18px; cursor: pointer; }

/* Notification panel */
.notif-panel {
  position: absolute; bottom: calc(100% + 6px); left: 0; right: 0;
  background: #fff; border-radius: 12px;
  box-shadow: 0 -4px 30px rgba(0,0,0,0.2), 0 8px 20px rgba(0,0,0,0.1);
  z-index: 200; overflow: hidden; min-width: 300px;
}
.notif-panel-side {
  left: 64px; bottom: 0; right: auto; width: 300px;
}
.notif-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid #f1f5f9;
}
.np-title { font-size: 14px; font-weight: 700; color: #0f172a; }
.np-read-all { background: none; border: none; font-size: 12px; color: #3b82f6; font-weight: 600; cursor: pointer; padding: 0; }
.np-read-all:hover { text-decoration: underline; }
.np-empty { padding: 24px 14px; text-align: center; font-size: 13px; color: #94a3b8; }
.np-list { max-height: 360px; overflow-y: auto; }
.np-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px;
  border-bottom: 1px solid #f8fafc; cursor: pointer; transition: background 0.1s; position: relative;
}
.np-item:last-child { border-bottom: none; }
.np-item:hover { background: #f8fafc; }
.np-item.unread { background: #eff6ff; }
.np-item.unread:hover { background: #dbeafe; }
.np-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
.np-body { flex: 1; min-width: 0; }
.np-judul { font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.4; }
.np-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
.np-time { font-size: 11px; color: #94a3b8; margin-top: 4px; }
.np-dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; flex-shrink: 0; margin-top: 5px; }

/* Main content */
.main-content { flex: 1; min-width: 0; overflow-y: auto; }

/* Toast */
.toast-container {
  position: fixed; bottom: 24px; right: 24px; z-index: 9999;
  display: flex; flex-direction: column; gap: 10px; pointer-events: none;
}
.toast {
  display: flex; align-items: flex-start; gap: 10px;
  background: #fff; border-radius: 12px; padding: 14px 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15); border-left: 4px solid #3b82f6;
  min-width: 280px; max-width: 360px; pointer-events: all; cursor: pointer;
  animation: slideIn 0.3s ease;
}
.toast:hover { box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
.toast-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
.toast-body { flex: 1; min-width: 0; }
.toast-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.toast-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
.toast-close {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  font-size: 20px; padding: 0; flex-shrink: 0; line-height: 1;
}
.toast-close:hover { color: #374151; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
</style>
