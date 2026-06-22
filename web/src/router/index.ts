import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Public
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },

    // Protected — semua di bawah AppLayout
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        // HRIS
        {
          path: 'hris/karyawan',
          name: 'hris-list',
          component: () => import('@/views/hris/KaryawanListView.vue'),
        },
        {
          path: 'hris/karyawan/tambah',
          name: 'hris-tambah',
          component: () => import('@/views/hris/KaryawanFormView.vue'),
        },
        {
          path: 'hris/karyawan/:id',
          name: 'hris-detail',
          component: () => import('@/views/hris/KaryawanDetailView.vue'),
        },
        {
          path: 'hris/karyawan/:id/edit',
          name: 'hris-edit',
          component: () => import('@/views/hris/KaryawanFormView.vue'),
        },
        // Catch-all dalam layout
        {
          path: ':pathMatch(.*)*',
          redirect: '/dashboard',
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.user) auth.init()

  const loggedIn = auth.user !== null
  const isLogin = to.name === 'login'

  if (!loggedIn && !isLogin) return '/login'
  if (loggedIn && isLogin) return '/dashboard'
})

export default router
