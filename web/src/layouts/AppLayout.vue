<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useSettingsStore } from '@/stores/settings'
import api from '@/services/api'
import { fmtRelativeTime } from '@/composables/useFormat'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const notif  = useNotificationStore()

const sidebarOpen    = ref(true)
const showNotifPanel = ref(false)
const showUserMenu   = ref(false)
const mobileNavOpen  = ref(false)

// Tutup drawer mobile setiap pindah halaman
watch(() => route.path, () => { mobileNavOpen.value = false })

const appVersion = __APP_VERSION__
const appHash    = __APP_GIT_HASH__
const cfg        = useSettingsStore()

onMounted(() => {
  notif.startPolling()
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => {
  notif.stopPolling()
  document.removeEventListener('click', onDocClick)
})

function onDocClick(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('.notif-area'))  showNotifPanel.value = false
  if (!t.closest('.user-area'))   showUserMenu.value   = false
}

async function toggleNotifPanel() {
  showNotifPanel.value = !showNotifPanel.value
  showUserMenu.value   = false
  if (showNotifPanel.value) await notif.fetchNotifications()
}

function toggleUserMenu() {
  showUserMenu.value   = !showUserMenu.value
  showNotifPanel.value = false
}

function goNotif(n: any) {
  notif.markRead(n.id_notif)
  showNotifPanel.value = false
  if (n.url) router.push(n.url)
}

async function logout() {
  const refresh_token = localStorage.getItem('refresh_token') || undefined
  try { await api.post('/auth/logout', { refresh_token }) } catch {}
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
  return fmtRelativeTime(d, true)
}

const allMenu = [
  { label: 'Dashboard',    icon: '▪', emoji: '📊', to: '/dashboard',     modul: null },
  { label: 'Email',        icon: '▪', emoji: '📧', to: '/email',          modul: null },
  { label: 'HRIS',         icon: '▪', emoji: '👤', to: '/hris/karyawan', modul: 'hris' },
  { label: 'Master Data',  icon: '▪', emoji: '📦', to: '/master',         modul: 'master' },
  { label: 'Sales',        icon: '▪', emoji: '💼', to: '/sales',          modul: 'sales' },
  { label: 'Proyek',       icon: '▪', emoji: '📋', to: '/projects',       modul: 'projects' },
  { label: 'Operasional',  icon: '▪', emoji: '🔧', to: '/operations',     modul: 'operations' },
  { label: 'Work Order',   icon: '▪', emoji: '🗂️', to: '/public-wo',     modul: 'public-wo' },
  { label: 'Aset',         icon: '▪', emoji: '🖥️', to: '/assets',        modul: 'assets' },
  { label: 'SIM Topup',   icon: '▪', emoji: '📱', to: '/assets/sim-topup', modul: 'assets' },
  { label: 'Kontrak',      icon: '▪', emoji: '📄', to: '/contracts',      modul: 'contracts' },
  { label: 'Finance',      icon: '▪', emoji: '💰', to: '/finance',        modul: 'finance' },
  { label: 'Laporan',      icon: '▪', emoji: '📈', to: '/reports',        modul: 'reports' },
]

const adminMenu = [
  { label: 'Users',        emoji: '⚙️', to: '/admin/users'  },
  { label: 'Activity Log', emoji: '📝', to: '/admin/logs'   },
  { label: 'Email Log',    emoji: '📤', to: '/admin/email-log' },
  { label: 'PRTG',         emoji: '📡', to: '/integrations/prtg' },
  { label: 'Uptime Kuma',  emoji: '🟢', to: '/integrations/uptime-kuma' },
  { label: 'Pengaturan',   emoji: '🔩', to: '/settings'     },
]

const menu = computed(() =>
  allMenu.filter(m => {
    if (!m.modul) return true
    return auth.canAccess(m.modul)
  })
)

const PAGE_TITLES: Record<string, string> = {
  dashboard:              "Dashboard",
  "hris-list":            "HRIS — Karyawan",
  "hris-tambah":          "HRIS — Tambah Karyawan",
  "hris-detail":          "HRIS — Detail Karyawan",
  "hris-edit":            "HRIS — Edit Karyawan",
  "master-index":         "Master Data",
  "master-layanan":       "Master — Layanan",
  "master-vendor":        "Master — Vendor ISP",
  "master-gudang":        "Master — Gudang",
  "master-kontak-teknisi": "Master — Kontak Teknisi",
  "master-pelanggan":     "Master — Pelanggan",
  "master-site":          "Master — Site",
  "master-site-detail":   "Master — Detail Site",
  "sales-dashboard":      "Sales",
  "sales-lead-list":      "Sales — Lead",
  "sales-lead-detail":    "Sales — Detail Lead",
  "sales-opp-list":       "Sales — Opportunity",
  "sales-opp-detail":     "Sales — Detail Opportunity",
  "sales-quotation-list": "Sales — Quotation",
  "sales-quotation-detail": "Sales — Detail Quotation",
  "proyek-list":          "Proyek",
  "proyek-detail":        "Proyek — Detail",
  "tiket-list":           "Operasional — Tiket",
  "tiket-detail":         "Operasional — Detail Tiket",
  "wo-list":              "Work Order",
  "wo-detail":            "Work Order — Detail",
  "aset-list":            "Aset",
  "aset-detail":          "Aset — Detail",
  "sim-topup":            "SIM Card — Topup",
  "kontrak-list":         "Kontrak",
  "noc-board":            "NOC Board",
  "finance-dashboard":    "Finance — Dashboard",
  "invoice-list":         "Finance — Invoice",
  "invoice-detail":       "Finance — Detail Invoice",
  "kontrak-detail":       "Kontrak — Detail",
  laporan:                "Laporan",
  "admin-users":          "Admin — Manajemen User",
  "admin-logs":           "Admin — Activity Log",
  "admin-email-log":      "Admin — Email Log",
  "notifications":        "Notifikasi",
  "profile":              "Profil Saya",
  "settings":             "Pengaturan Aplikasi",
  "prtg-settings":        "PRTG — Monitoring",
  "uptime-kuma-settings": "Uptime Kuma — Monitoring",
  "email-inbox":          "Email",
  "changelog":            "Changelog",
}

const pageTitle = computed(() => PAGE_TITLES[route.name as string] || "ERP NEXT1")

const initials = computed(() => {
  const name = auth.user?.nama_lengkap || ''
  return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
})
</script>

<template>
  <div class="app-shell">

    <!-- Backdrop drawer mobile -->
    <div v-if="mobileNavOpen" class="mobile-backdrop" @click="mobileNavOpen = false"></div>

    <!-- ─── Sidebar ─────────────────────────────────────── -->
    <aside :class="['sidebar', { collapsed: !sidebarOpen, 'mobile-open': mobileNavOpen }]">

      <!-- Brand -->
      <div class="sidebar-brand">
        <div class="brand-logo">
          <img v-if="cfg.settings.company_logo_url" :src="cfg.settings.company_logo_url" alt="logo" class="brand-logo-img" />
          <span v-else>{{ (cfg.settings.company_brand || 'N1').slice(0, 2).toUpperCase() }}</span>
        </div>
        <Transition name="fade-text">
          <span v-if="sidebarOpen || mobileNavOpen" class="brand-name">ERP {{ cfg.settings.company_brand || 'NEXT1' }}</span>
        </Transition>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <div class="nav-section-label" v-if="sidebarOpen || mobileNavOpen">MENU</div>
        <RouterLink
          v-for="item in menu" :key="item.to" :to="item.to"
          class="nav-item" active-class="active"
        >
          <span class="nav-emoji">{{ item.emoji }}</span>
          <Transition name="fade-text">
            <span v-if="sidebarOpen || mobileNavOpen" class="nav-label">{{ item.label }}</span>
          </Transition>
        </RouterLink>

        <template v-if="auth.hasRole('Admin') || auth.hasRole('Director')">
          <div class="nav-divider"></div>
          <div class="nav-section-label" v-if="sidebarOpen || mobileNavOpen">ADMIN</div>
          <RouterLink
            v-for="item in adminMenu" :key="item.to" :to="item.to"
            class="nav-item" active-class="active"
          >
            <span class="nav-emoji">{{ item.emoji }}</span>
            <Transition name="fade-text">
              <span v-if="sidebarOpen || mobileNavOpen" class="nav-label">{{ item.label }}</span>
            </Transition>
          </RouterLink>
        </template>
      </nav>

      <!-- Version — klik untuk lihat riwayat perubahan -->
      <RouterLink to="/changelog" class="sidebar-version" v-if="sidebarOpen || mobileNavOpen" title="Lihat changelog">
        <span class="ver-text">v{{ appVersion }}</span>
        <span class="ver-hash">{{ appHash }}</span>
      </RouterLink>

      <!-- Collapse toggle -->
      <button class="sidebar-toggle" @click="sidebarOpen = !sidebarOpen">
        <span class="toggle-icon">{{ sidebarOpen ? '«' : '»' }}</span>
        <Transition name="fade-text">
          <span v-if="sidebarOpen || mobileNavOpen" class="toggle-label">Tutup Sidebar</span>
        </Transition>
      </button>
    </aside>

    <!-- ─── Main wrapper ─────────────────────────────────── -->
    <div class="main-wrapper">

      <!-- Topbar -->
      <header class="topbar">
        <div class="topbar-left">
          <button class="hamburger" @click="mobileNavOpen = !mobileNavOpen" aria-label="Menu">☰</button>
          <div class="page-title">{{ pageTitle }}</div>
        </div>

        <div class="topbar-right">
          <!-- Notification bell -->
          <div class="notif-area">
            <button class="tb-btn" @click.stop="toggleNotifPanel" :class="{ active: showNotifPanel }"
              aria-label="Notifikasi" :aria-expanded="showNotifPanel">
              <span class="tb-icon">🔔</span>
              <span v-if="notif.count > 0" class="notif-badge">{{ notif.count > 99 ? '99+' : notif.count }}</span>
            </button>

            <!-- Dropdown -->
            <div v-if="showNotifPanel" class="notif-panel" @click.stop>
              <div class="np-header">
                <span class="np-title">Notifikasi</span>
                <span class="np-unread-chip" v-if="notif.count > 0">{{ notif.count }} baru</span>
                <button v-if="notif.count > 0" class="np-read-all" @click="notif.markAllRead()">Baca semua</button>
              </div>
              <div v-if="notif.loading" class="np-state">Memuat...</div>
              <div v-else-if="!notif.notifications.length" class="np-state">Belum ada notifikasi 🎉</div>
              <div v-else class="np-list">
                <div
                  v-for="n in notif.notifications" :key="n.id_notif"
                  :class="['np-item', { unread: !n.is_read }]"
                  @click="goNotif(n)"
                >
                  <div class="np-ico">{{ TIPE_ICON[n.tipe] || '🔔' }}</div>
                  <div class="np-body">
                    <div class="np-judul">{{ n.judul }}</div>
                    <div class="np-desc" v-if="n.deskripsi">{{ n.deskripsi }}</div>
                    <div class="np-time">{{ fmtTime(n.created_at) }}</div>
                  </div>
                  <div v-if="!n.is_read" class="np-dot"></div>
                </div>
              </div>
              <div class="np-footer">
                <router-link to="/notifications" class="np-see-all" @click="showNotifPanel = false">
                  Lihat semua notifikasi →
                </router-link>
              </div>
            </div>
          </div>

          <!-- Divider -->
          <div class="tb-divider"></div>

          <!-- User menu -->
          <div class="user-area">
            <button class="user-btn" @click.stop="toggleUserMenu" :class="{ active: showUserMenu }"
              aria-label="Menu pengguna" :aria-expanded="showUserMenu">
              <img v-if="auth.user?.foto_url" :src="auth.user.foto_url" alt="" class="user-avatar-photo" />
              <div v-else class="user-avatar">{{ initials }}</div>
              <div class="user-info">
                <div class="user-name">{{ auth.user?.nama_lengkap }}</div>
                <div class="user-role">{{ auth.user?.roles?.[0] || 'Staff' }}</div>
              </div>
              <span class="user-chevron">{{ showUserMenu ? '▲' : '▼' }}</span>
            </button>

            <div v-if="showUserMenu" class="user-menu" @click.stop>
              <div class="um-header">
                <div class="um-avatar">{{ initials }}</div>
                <div>
                  <div class="um-name">{{ auth.user?.nama_lengkap }}</div>
                  <div class="um-email">{{ auth.user?.username }}</div>
                </div>
              </div>
              <div class="um-divider"></div>
              <router-link class="um-item" to="/profile" @click="showUserMenu = false">
                <span>👤</span> Profil Saya
              </router-link>
              <div class="um-divider"></div>
              <button class="um-item danger" @click="logout">
                <span>🚪</span> Keluar
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="main-content">
        <RouterView />
      </main>
    </div>

    <!-- ─── Toast container ──────────────────────────────── -->
    <div class="toast-stack">
      <TransitionGroup name="toast">
        <div
          v-for="toast in notif.toasts" :key="toast.id"
          class="toast"
          @click="notif.dismissToast(toast.id); toast.url && router.push(toast.url)"
        >
          <div class="toast-ico">🔔</div>
          <div class="toast-body">
            <div class="toast-title">{{ toast.judul }}</div>
            <div class="toast-desc" v-if="toast.deskripsi">{{ toast.deskripsi }}</div>
          </div>
          <button class="toast-x" @click.stop="notif.dismissToast(toast.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
/* ── Root ── */
*, *::before, *::after { box-sizing: border-box; }

.app-shell {
  display: flex;
  min-height: 100vh;
  background: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ── Sidebar ── */
.sidebar {
  width: 220px;
  background: #0f172a;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: fixed;
  top: 0; left: 0; bottom: 0;
  z-index: 50;
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.sidebar.collapsed { width: 60px; }

/* Brand */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.brand-logo {
  width: 34px; height: 34px; flex-shrink: 0;
  background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 13px; color: #fff;
  box-shadow: 0 2px 8px rgba(59,130,246,0.4);
  overflow: hidden;
}
.brand-logo-img {
  width: 100%; height: 100%; object-fit: cover;
}
.brand-name {
  font-weight: 700; font-size: 14px; color: #f1f5f9;
  white-space: nowrap; letter-spacing: 0.3px;
}

/* Nav */
.sidebar-nav {
  flex: 1;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  overflow-x: hidden;
}
.sidebar-nav::-webkit-scrollbar { width: 3px; }
.sidebar-nav::-webkit-scrollbar-track { background: transparent; }
.sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.nav-section-label {
  font-size: 9px; font-weight: 700; letter-spacing: 1px;
  color: #475569; padding: 8px 10px 4px;
  white-space: nowrap;
}
.nav-divider {
  height: 1px; background: rgba(255,255,255,0.06);
  margin: 6px 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
}
.nav-item:hover { background: rgba(255,255,255,0.07); color: #e2e8f0; }
.nav-item.active { background: rgba(59,130,246,0.18); color: #60a5fa; }
.nav-item.active .nav-emoji { filter: none; }

.nav-emoji {
  font-size: 16px;
  flex-shrink: 0;
  width: 22px;
  text-align: center;
  line-height: 1;
}
.nav-label { white-space: nowrap; }

/* Version — link ke changelog */
.sidebar-version {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  opacity: 0.4;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.sidebar-version:hover { opacity: 0.9; }
.ver-text { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
.ver-hash { font-size: 10px; color: #94a3b8; font-family: monospace; }

/* Sidebar toggle */
.sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  background: none;
  border: none;
  border-top: 1px solid rgba(255,255,255,0.07);
  color: #475569;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  flex-shrink: 0;
  width: 100%;
}
.sidebar-toggle:hover { color: #94a3b8; }
.toggle-icon { font-size: 12px; flex-shrink: 0; }
.toggle-label { white-space: nowrap; }

/* ── Main wrapper ── */
.main-wrapper {
  flex: 1;
  min-width: 0;
  margin-left: 220px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  transition: margin-left 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar.collapsed ~ .main-wrapper { margin-left: 60px; }

/* ── Topbar ── */
.topbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #e9edf2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 40;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  flex-shrink: 0;
}

.topbar-left { display: flex; align-items: center; gap: 10px; }
.hamburger {
  display: none;
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  width: 38px; height: 38px;
  font-size: 18px;
  color: #334155;
  cursor: pointer;
  flex-shrink: 0;
}
.mobile-backdrop {
  display: none;
}
.page-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tb-divider {
  width: 1px; height: 28px;
  background: #e2e8f0;
  margin: 0 8px;
}

/* Topbar button base */
.tb-btn {
  position: relative;
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  background: none;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  color: #64748b;
}
.tb-btn:hover, .tb-btn.active { background: #f1f5f9; color: #0f172a; }
.tb-icon { font-size: 18px; }

/* Notification badge */
.notif-badge {
  position: absolute;
  top: 4px; right: 3px;
  background: #ef4444;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  border-radius: 10px;
  padding: 1px 4px;
  min-width: 16px;
  text-align: center;
  border: 1.5px solid #fff;
}

/* Notification panel */
.notif-area { position: relative; }
.notif-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 340px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 20px 40px rgba(0,0,0,0.12);
  border: 1px solid #e9edf2;
  overflow: hidden;
  z-index: 100;
}
.np-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.np-title { font-size: 14px; font-weight: 700; color: #0f172a; flex: 1; }
.np-unread-chip {
  background: #eff6ff; color: #1d4ed8;
  font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 10px;
}
.np-read-all {
  background: none; border: none;
  font-size: 12px; color: #64748b; font-weight: 600;
  cursor: pointer; padding: 0;
  transition: color 0.1s;
}
.np-read-all:hover { color: #1d4ed8; }
.np-state { padding: 32px 16px; text-align: center; font-size: 13px; color: #94a3b8; }
.np-list { max-height: 380px; overflow-y: auto; }
.np-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #f8fafc;
  cursor: pointer;
  transition: background 0.12s;
  position: relative;
}
.np-item:last-child { border-bottom: none; }
.np-item:hover { background: #f8fafc; }
.np-item.unread { background: #f0f7ff; }
.np-item.unread:hover { background: #e0f0ff; }
.np-ico { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
.np-body { flex: 1; min-width: 0; }
.np-judul { font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.4; }
.np-desc { font-size: 12px; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.np-time { font-size: 11px; color: #94a3b8; margin-top: 4px; }
.np-dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; flex-shrink: 0; margin-top: 6px; }
.np-footer { border-top: 1px solid #f1f5f9; padding: 10px 16px; text-align: center; }
.np-see-all { font-size: 12px; color: #1d4ed8; font-weight: 600; text-decoration: none; }
.np-see-all:hover { text-decoration: underline; }

/* User area */
.user-area { position: relative; }
.user-btn {
  display: flex; align-items: center; gap: 9px;
  background: none; border: none;
  border-radius: 10px;
  padding: 5px 10px 5px 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.user-btn:hover, .user-btn.active { background: #f1f5f9; }
.user-avatar {
  width: 32px; height: 32px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; font-size: 12px;
  flex-shrink: 0;
}
.user-avatar-photo {
  width: 32px; height: 32px;
  border-radius: 9px;
  object-fit: cover;
  flex-shrink: 0;
}
.user-info { text-align: left; }
.user-name { font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.3; white-space: nowrap; }
.user-role { font-size: 11px; color: #94a3b8; }
.user-chevron { font-size: 9px; color: #94a3b8; margin-left: 2px; }

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.1);
  border: 1px solid #e9edf2;
  overflow: hidden;
  z-index: 100;
}
.um-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 14px 12px;
}
.um-avatar {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; font-size: 13px;
  flex-shrink: 0;
}
.um-name { font-size: 13px; font-weight: 700; color: #0f172a; }
.um-email { font-size: 11px; color: #94a3b8; margin-top: 1px; }
.um-divider { height: 1px; background: #f1f5f9; }
.um-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 11px 14px;
  background: none; border: none;
  font-size: 13px; font-weight: 500; color: #374151;
  cursor: pointer; transition: background 0.12s;
  text-align: left; text-decoration: none; box-sizing: border-box;
}
.um-item:hover { background: #f8fafc; }
.um-item.danger { color: #dc2626; }
.um-item.danger:hover { background: #fef2f2; }

/* ── Main content ── */
.main-content {
  flex: 1;
  overflow-y: auto;
}

/* ── Toasts ── */
.toast-stack {
  position: fixed;
  bottom: 24px; right: 24px;
  z-index: 9999;
  display: flex; flex-direction: column; gap: 10px;
  pointer-events: none;
}
.toast {
  display: flex; align-items: flex-start; gap: 10px;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08), 0 10px 30px rgba(0,0,0,0.12);
  border-left: 4px solid #3b82f6;
  min-width: 280px; max-width: 360px;
  pointer-events: all;
  cursor: pointer;
}
.toast:hover { box-shadow: 0 8px 40px rgba(0,0,0,0.16); }
.toast-ico { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
.toast-body { flex: 1; min-width: 0; }
.toast-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.toast-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
.toast-x {
  background: none; border: none; color: #94a3b8;
  cursor: pointer; font-size: 20px; padding: 0;
  flex-shrink: 0; line-height: 1;
}
.toast-x:hover { color: #374151; }

/* ── Transitions ── */
.fade-text-enter-active, .fade-text-leave-active { transition: opacity 0.15s, transform 0.15s; }
.fade-text-enter-from, .fade-text-leave-to { opacity: 0; transform: translateX(-4px); }

.toast-enter-active { animation: toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.toast-leave-active { animation: toastOut 0.2s ease forwards; }
@keyframes toastIn  { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes toastOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(110%); opacity: 0; } }

/* ── Mobile (≤768px): sidebar jadi drawer, konten full-width ── */
@media (max-width: 768px) {
  .sidebar {
    width: 250px !important;
    transform: translateX(-100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sidebar.mobile-open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0, 0, 0, 0.35); }
  /* Di mobile sidebar selalu tampil penuh (label kelihatan) */
  .sidebar.collapsed { width: 250px !important; }
  .sidebar-toggle { display: none; }

  .mobile-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    z-index: 49;
  }

  .main-wrapper { margin-left: 0 !important; }
  .hamburger { display: inline-flex; align-items: center; justify-content: center; }

  .topbar { padding: 0 12px; }
  .page-title { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45vw; }
  .main-content { padding: 12px; }

  .notif-panel {
    position: fixed !important;
    top: 60px; left: 8px; right: 8px;
    width: auto !important;
    max-height: 70vh;
  }
  .toast-stack { left: 8px; right: 8px; }
  .toast { max-width: none; }
}
</style>
