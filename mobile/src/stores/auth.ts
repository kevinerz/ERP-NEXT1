import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const user = ref<any>(null)
  const userType = ref<'internal' | 'vendor'>('internal')

  const isLoggedIn = computed(() => !!token.value)
  const isVendor = computed(() => userType.value === 'vendor')

  function loadFromStorage() {
    token.value = localStorage.getItem('mobile_token')
    const u = localStorage.getItem('mobile_user')
    if (u) user.value = JSON.parse(u)
    userType.value = (localStorage.getItem('mobile_user_type') as any) || 'internal'
  }

  async function login(username: string, password: string) {
    const { data } = await api.post('/mobile/auth/login', { username, password })
    const payload = data.data ?? data
    token.value = payload.token
    user.value = payload.user
    userType.value = 'internal'
    localStorage.setItem('mobile_token', payload.token)
    localStorage.setItem('mobile_user', JSON.stringify(payload.user))
    localStorage.setItem('mobile_user_type', 'internal')
  }

  async function vendorLogin(username: string, pin: string) {
    const { data } = await api.post('/master/kontak-teknisi/vendor-login', { username, pin })
    const payload = data.data ?? data
    // response: { access_token, vendor: { nama, ... } }
    token.value = payload.access_token ?? payload.token
    const v = payload.vendor ?? payload.user ?? {}
    user.value = { ...v, nama_lengkap: v.nama ?? v.nama_lengkap ?? username, username }
    userType.value = 'vendor'
    localStorage.setItem('mobile_token', token.value!)
    localStorage.setItem('mobile_user', JSON.stringify(user.value))
    localStorage.setItem('mobile_user_type', 'vendor')
  }

  function logout() {
    token.value = null
    user.value = null
    userType.value = 'internal'
    localStorage.removeItem('mobile_token')
    localStorage.removeItem('mobile_user')
    localStorage.removeItem('mobile_user_type')
  }

  return { token, user, userType, isLoggedIn, isVendor, loadFromStorage, login, vendorLogin, logout }
})
