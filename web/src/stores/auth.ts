import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

interface User {
  id_user: number
  username: string
  nama_lengkap: string
  jabatan: string
  departemen: string
  roles: string[]
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const error = ref('')

  const isLoggedIn = computed(() => !!user.value)
  const hasRole = (role: string) => user.value?.roles.includes(role) ?? false

  // Init dari localStorage saat app load
  function init() {
    const saved = localStorage.getItem('user')
    if (saved) {
      try { user.value = JSON.parse(saved) } catch { /* ignore */ }
    }
  }

  async function login(username: string, password: string) {
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.post('/auth/login', { username, password })
      const result = data.data
      user.value = result.user
      localStorage.setItem('access_token', result.access_token)
      localStorage.setItem('refresh_token', result.refresh_token)
      localStorage.setItem('user', JSON.stringify(result.user))
      return true
    } catch (e: any) {
      error.value = e.response?.data?.message || 'Login gagal, cek username/password'
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    error.value = ''
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  }

  return { user, loading, error, isLoggedIn, hasRole, init, login, logout }
})
