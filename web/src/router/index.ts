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
        // Master Data
        {
          path: 'master',
          name: 'master-index',
          component: () => import('@/views/master/MasterIndexView.vue'),
        },
        {
          path: 'master/layanan',
          name: 'master-layanan',
          component: () => import('@/views/master/LayananView.vue'),
        },
        {
          path: 'master/vendor',
          name: 'master-vendor',
          component: () => import('@/views/master/VendorView.vue'),
        },
        {
          path: 'master/pelanggan',
          name: 'master-pelanggan',
          component: () => import('@/views/master/PelangganView.vue'),
        },
        {
          path: 'master/site',
          name: 'master-site',
          component: () => import('@/views/master/SiteView.vue'),
        },
        {
          path: 'master/site/:id',
          name: 'master-site-detail',
          component: () => import('@/views/master/SiteDetailView.vue'),
        },
        // Sales
        {
          path: 'sales',
          name: 'sales-dashboard',
          component: () => import('@/views/sales/SalesDashboardView.vue'),
        },
        {
          path: 'sales/lead',
          name: 'sales-lead-list',
          component: () => import('@/views/sales/LeadListView.vue'),
        },
        {
          path: 'sales/lead/:id',
          name: 'sales-lead-detail',
          component: () => import('@/views/sales/LeadDetailView.vue'),
        },
        {
          path: 'sales/opportunity',
          name: 'sales-opp-list',
          component: () => import('@/views/sales/OpportunityListView.vue'),
        },
        {
          path: 'sales/opportunity/:id',
          name: 'sales-opp-detail',
          component: () => import('@/views/sales/OpportunityDetailView.vue'),
        },
        {
          path: 'sales/quotation',
          name: 'sales-quotation-list',
          component: () => import('@/views/sales/QuotationListView.vue'),
        },
        {
          path: 'sales/quotation/:id',
          name: 'sales-quotation-detail',
          component: () => import('@/views/sales/QuotationDetailView.vue'),
        },
        // Operasional
        {
          path: 'operations',
          name: 'tiket-list',
          component: () => import('@/views/operations/TiketListView.vue'),
        },
        {
          path: 'operations/:id',
          name: 'tiket-detail',
          component: () => import('@/views/operations/TiketDetailView.vue'),
        },
        // Proyek
        {
          path: 'projects',
          name: 'proyek-list',
          component: () => import('@/views/proyek/ProyekListView.vue'),
        },
        {
          path: 'projects/:id',
          name: 'proyek-detail',
          component: () => import('@/views/proyek/ProyekDetailView.vue'),
        },
        // Admin
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('@/views/admin/UserManagementView.vue'),
        },
        {
          path: 'admin/logs',
          name: 'admin-logs',
          component: () => import('@/views/admin/ActivityLogView.vue'),
        },
        // Laporan
        {
          path: 'reports',
          name: 'laporan',
          component: () => import('@/views/reports/LaporanView.vue'),
        },
        // Kontrak
        {
          path: 'contracts',
          name: 'kontrak-list',
          component: () => import('@/views/contracts/KontrakListView.vue'),
        },
        {
          path: 'contracts/:id',
          name: 'kontrak-detail',
          component: () => import('@/views/contracts/KontrakDetailView.vue'),
        },
        // Aset
        {
          path: 'assets',
          name: 'aset-list',
          component: () => import('@/views/aset/AsetListView.vue'),
        },
        {
          path: 'assets/:id',
          name: 'aset-detail',
          component: () => import('@/views/aset/AsetDetailView.vue'),
        },
        {
          path: 'assets/sim-topup',
          name: 'sim-topup',
          component: () => import('@/views/aset/SimTopupView.vue'),
        },
        // Work Order
        {
          path: 'public-wo',
          name: 'wo-list',
          component: () => import('@/views/public-wo/WoListView.vue'),
        },
        {
          path: 'public-wo/:id',
          name: 'wo-detail',
          component: () => import('@/views/public-wo/WoDetailView.vue'),
        },
        // Notifikasi
        {
          path: 'notifications',
          name: 'notifications',
          component: () => import('@/views/NotificationsView.vue'),
        },
        // Profile
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/views/ProfileView.vue'),
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

// Map route name → modul key
const ROUTE_MODUL: Record<string, string> = {
  'hris-list': 'hris', 'hris-detail': 'hris', 'hris-tambah': 'hris', 'hris-edit': 'hris',
  'master-index': 'master', 'master-layanan': 'master', 'master-vendor': 'master',
  'master-pelanggan': 'master', 'master-site': 'master', 'master-site-detail': 'master',
  'sales-dashboard': 'sales', 'sales-lead-list': 'sales', 'sales-lead-detail': 'sales',
  'sales-opp-list': 'sales', 'sales-opp-detail': 'sales',
  'sales-quotation-list': 'sales', 'sales-quotation-detail': 'sales',
  'proyek-list': 'projects', 'proyek-detail': 'projects',
  'tiket-list': 'operations', 'tiket-detail': 'operations',
  'aset-list': 'assets', 'aset-detail': 'assets', 'sim-topup': 'assets',
  'kontrak-list': 'contracts', 'kontrak-detail': 'contracts',
  'laporan': 'reports',
  'wo-list': 'public-wo', 'wo-detail': 'public-wo',
}

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.user) auth.init()

  const loggedIn = auth.user !== null
  const isLogin = to.name === 'login'

  if (!loggedIn && !isLogin) return '/login'
  if (loggedIn && isLogin) return '/dashboard'

  // Cek akses modul
  if (loggedIn && to.name) {
    const modul = ROUTE_MODUL[to.name as string]
    if (modul && !auth.canAccess(modul)) return '/dashboard'
    // halaman admin hanya Admin / Director
    if ((to.name === 'admin-users' || to.name === 'admin-logs') && !auth.hasRole('Admin') && !auth.hasRole('Director')) return '/dashboard'
  }
})

export default router
