import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const user = ref<any>(null)

  const isLoggedIn = computed(() => !!token.value)

  function loadFromStorage() {
    token.value = localStorage.getItem('mobile_token')
    const u = localStorage.getItem('mobile_user')
    if (u) user.value = JSON.parse(u)
  }

  async function login(username: string, password: string) {
    const { data } = await api.post('/mobile/auth/login', { username, password })
    const payload = data.data ?? data
    token.value = payload.token
    user.value = payload.user
    localStorage.setItem('mobile_token', payload.token)
    localStorage.setItem('mobile_user', JSON.stringify(payload.user))
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('mobile_token')
    localStorage.removeItem('mobile_user')
  }

  return { token, user, isLoggedIn, loadFromStorage, login, logout }
})
