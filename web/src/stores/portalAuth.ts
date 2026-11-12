import { defineStore } from 'pinia'
import portalApi from '@/services/portalApi'
import { pesanGalat } from '@/composables/useDialog'

interface CustomerUser {
  id_user: number
  email: string
  nama: string | null
  id_pelanggan: number
  pelanggan: { id_pelanggan: number; nama_pelanggan: string; kode_pelanggan: string }
}

export const usePortalAuthStore = defineStore('portalAuth', {
  state: () => ({
    user: null as CustomerUser | null,
    loading: false,
    error: '',
  }),

  getters: {
    isLoggedIn: (state) => state.user !== null,
  },

  actions: {
    init() {
      const saved = localStorage.getItem('portal_user')
      if (saved) {
        try { this.user = JSON.parse(saved) } catch { /* ignore */ }
      }
      if (localStorage.getItem('portal_token')) {
        portalApi.get('/portal/me').then(({ data }) => {
          this.user = data.data
          localStorage.setItem('portal_user', JSON.stringify(data.data))
        }).catch((e: any) => {
          // Koneksi putus / server sedang dimulai ulang bukan berarti sesi tidak sah — pertahankan sesi.
          const status = e?.response?.status
          if (!status || status >= 500) return
          this.user = null
          localStorage.removeItem('portal_token')
          localStorage.removeItem('portal_user')
        })
      }
    },

    async login(email: string, password: string) {
      if (this.loading) return false
      this.loading = true; this.error = ''
      try {
        const { data } = await portalApi.post('/portal/auth/login', { email, password })
        this.user = data.data.user
        localStorage.setItem('portal_token', data.data.access_token)
        localStorage.setItem('portal_user', JSON.stringify(data.data.user))
        return true
      } catch (e: any) {
        this.error = e.response?.status === 429
          ? 'Terlalu banyak percobaan masuk. Tunggu sekitar 1 menit lalu coba lagi.'
          : pesanGalat(e, 'Gagal masuk. Periksa email dan password Anda.')
        return false
      } finally { this.loading = false }
    },

    logout() {
      this.user = null; this.error = ''
      localStorage.removeItem('portal_token')
      localStorage.removeItem('portal_user')
    },
  },
})
