import { createRouter, createWebHistory } from '@ionic/vue-router'
import { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  // Internal technician routes
  {
    path: '/dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requireInternal: true },
  },
  {
    path: '/tickets',
    component: () => import('../views/TicketListView.vue'),
    meta: { requireInternal: true },
  },
  {
    path: '/tickets/:id',
    component: () => import('../views/TicketDetailView.vue'),
    meta: { requireInternal: true },
  },
  {
    path: '/settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { requireInternal: true },
  },
  // Vendor routes
  {
    path: '/instalasi',
    component: () => import('../views/InstalasiListView.vue'),
  },
  {
    path: '/instalasi/:id',
    component: () => import('../views/InstalasiDetailView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) return

  if (!auth.isLoggedIn) return '/login'

  // Internal-only pages blocked for vendor
  if (to.meta.requireInternal && auth.isVendor) return '/instalasi'
})

export default router
