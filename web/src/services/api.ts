import axios from 'axios'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { mulaiKemajuan, selesaiKemajuan, luring } from '@/composables/kemajuan'
import { toastGalat } from '@/composables/useDialog'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** true = jangan tampilkan bilah kemajuan / notifikasi global (untuk polling latar belakang) */
    senyap?: boolean
    _retry?: boolean
    _kemajuan?: boolean
  }
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // Permintaan biasa tidak boleh menggantung selamanya; unggahan berkas dikecualikan di bawah.
  timeout: 120_000,
})

// Attach token ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) config.timeout = 0
  if (!config.senyap && !config._kemajuan) {
    config._kemajuan = true
    // GET (memuat data) baru menampilkan bilah bila lambat; aksi simpan/hapus langsung tampil.
    mulaiKemajuan((config.method ?? 'get').toLowerCase() === 'get' ? 350 : 0)
  }
  return config
})

let pantau: ReturnType<typeof setInterval> | null = null
/** Saat koneksi ke server putus, cek berkala sampai pulih supaya banner hilang sendiri. */
function pantauPulih() {
  if (pantau) return
  pantau = setInterval(async () => {
    if (!luring.value) { clearInterval(pantau!); pantau = null; return }
    try {
      await axios.get('/api/health', { timeout: 5000 })
      luring.value = false
    } catch { /* masih putus — coba lagi pada putaran berikutnya */ }
  }, 5000)
}

function tutupKemajuan(config: any) {
  if (config?._kemajuan) { config._kemajuan = false; selesaiKemajuan() }
}

/** Unduhan (responseType blob) yang gagal membawa pesan JSON di dalam Blob — buka supaya pesannya terbaca. */
async function bukaGalatBlob(err: any) {
  const d = err?.response?.data
  if (typeof Blob !== 'undefined' && d instanceof Blob) {
    try {
      const teks = await d.text()
      err.response.data = d.type.includes('json') ? JSON.parse(teks) : { message: '' }
    } catch { err.response.data = { message: '' } }
  }
}

// Handle 401 — hanya coba refresh token, tidak redirect
// Redirect ke login ditangani oleh router guard
api.interceptors.response.use(
  (res) => {
    tutupKemajuan(res.config)
    if (luring.value && navigator.onLine) luring.value = false
    return res
  },
  async (err) => {
    const original = err.config
    tutupKemajuan(original)
    if (axios.isCancel(err)) return Promise.reject(err)
    await bukaGalatBlob(err)

    if (err.response?.status === 401 && original && !original._retry) {
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
        // Refresh gagal — hapus semua state lalu ke login dengan penjelasan,
        // dan kembalikan ke halaman semula setelah masuk lagi
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        useAuthStore().logout()
        const kini = router.currentRoute.value
        if (kini.name !== 'login') router.push({ path: '/login', query: { alasan: 'sesi', redirect: kini.fullPath } })
      }
      return Promise.reject(err)
    }

    const status = err.response?.status as number | undefined
    // Tidak ada respons sama sekali, atau gateway (nginx) yang menjawab karena aplikasi
    // sedang dimulai ulang → tampilkan banner koneksi; hilang sendiri saat permintaan berikutnya sukses.
    const dariGateway = !!status && status >= 502 && status <= 504 && typeof err.response?.data?.success !== 'boolean'
    const jaringan = !err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')
    if (jaringan || dariGateway) {
      if (err.code !== 'ECONNABORTED' && err.code !== 'ETIMEDOUT') { luring.value = true; pantauPulih() }
      const aksi = (original?.method ?? 'get').toLowerCase() !== 'get'
      // Aksi pengguna (simpan/hapus/kirim) yang gagal karena koneksi wajib terlihat jelas.
      if (aksi && !original?.senyap) toastGalat(err)
      else err.__diberitahu = !original?.senyap && luring.value
    } else if (luring.value && navigator.onLine) {
      luring.value = false
    }
    return Promise.reject(err)
  },
)

export default api
