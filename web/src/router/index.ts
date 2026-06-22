import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
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
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  // Init dari localStorage kalau belum ada
  if (!auth.user) auth.init()

  const loggedIn = auth.user !== null
  const isPublic = to.name === 'login'

  if (!loggedIn && !isPublic) return '/login'
  if (loggedIn && isPublic) return '/dashboard'
})

export default router
