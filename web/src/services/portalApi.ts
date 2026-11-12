import axios from 'axios'
import { mulaiKemajuan, selesaiKemajuan } from '@/composables/kemajuan'

const portalApi = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('portal_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (!(config as any)._kemajuan) { (config as any)._kemajuan = true; mulaiKemajuan((config.method ?? 'get').toLowerCase() === 'get' ? 350 : 0) }
  return config
})

function tutup(config: any) { if (config?._kemajuan) { config._kemajuan = false; selesaiKemajuan() } }

portalApi.interceptors.response.use(
  (res) => { tutup(res.config); return res },
  async (err) => {
    tutup(err.config)
    // 401 dari login itu sendiri = password salah → biarkan pesan tampil, jangan reload halaman
    const dariLogin = String(err.config?.url || '').includes('/portal/auth/')
    if (err.response?.status === 401 && !dariLogin) {
      localStorage.removeItem('portal_token')
      localStorage.removeItem('portal_user')
      if (!window.location.pathname.startsWith('/portal/login')) window.location.href = '/portal/login?alasan=sesi'
    }
    return Promise.reject(err)
  },
)

export default portalApi
