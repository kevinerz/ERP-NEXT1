import { defineStore } from 'pinia'
import api from '@/services/api'

export const ALL_MODULS = ['hris', 'master', 'sales', 'projects', 'operations', 'assets', 'contracts', 'reports']

interface User {
  id_user: number
  username: string
  nama_lengkap: string
  jabatan: string
  departemen: string
  roles: string[]
  modul_akses: string[]  // kosong = akses semua (superadmin)
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loading: false,
    error: '',
  }),

  getters: {
    isLoggedIn: (state) => state.user !== null,
    hasRole: (state) => (role: string) => state.user?.roles.includes(role) ?? false,
    // kosong = akses semua modul (superadmin / user lama)
    canAccess: (state) => (modul: string) => {
      if (!state.user) return false
      if (!state.user.modul_akses || state.user.modul_akses.length === 0) return true
      return state.user.modul_akses.includes(modul)
    },
    isSuperAdmin: (state) => {
      if (!state.user) return false
      return !state.user.modul_akses || state.user.modul_akses.length === 0
    },
  },

  actions: {
    init() {
      const saved = localStorage.getItem('user')
      if (saved) {
        try { this.user = JSON.parse(saved) } catch { /* ignore */ }
      }
    },

    async login(username: string, password: string) {
      this.loading = true
      this.error = ''
      try {
        const { data } = await api.post('/auth/login', { username, password })
        const result = data.data
        this.user = result.user
        localStorage.setItem('access_token', result.access_token)
        localStorage.setItem('refresh_token', result.refresh_token)
        localStorage.setItem('user', JSON.stringify(result.user))
        return true
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Login gagal, cek username/password'
        return false
      } finally {
        this.loading = false
      }
    },

    logout() {
      this.user = null
      this.error = ''
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
    },
  },
})
