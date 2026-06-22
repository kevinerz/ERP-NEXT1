import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach token ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 — hanya coba refresh token, tidak redirect
// Redirect ke login ditangani oleh router guard
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh_token = localStorage.getItem('refresh_token')
        if (!refresh_token) return Promise.reject(err)

        const { data } = await axios.post('/api/auth/refresh', { refresh_token })
        const newToken = data.data.access_token
        localStorage.setItem('access_token', newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        // Refresh gagal — hapus token, biarkan komponen/guard handle
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
      }
    }
    return Promise.reject(err)
  },
)

export default api
