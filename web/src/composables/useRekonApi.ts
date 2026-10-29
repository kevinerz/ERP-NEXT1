// Akses API halaman rekon PRTG (publik, dijaga password = PRTG_REKON_TOKEN lewat header X-Rekon-Token)
import { ref } from 'vue'
import axios from 'axios'

function ambilToken(): string {
  try {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('token')
    if (t) {
      sessionStorage.setItem('rekon_token', t)
      url.searchParams.delete('token')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    return sessionStorage.getItem('rekon_token') ?? ''
  } catch {
    return ''
  }
}

export function pesanError(e: any): string {
  const m = e?.response?.data?.message
  if (e?.response?.status === 404) return 'Halaman rekonsiliasi sedang dimatikan.'
  if (e?.response?.status === 401) return 'Password salah.'
  return Array.isArray(m) ? m.join(', ') : m || e?.message || 'Gagal'
}

export function useRekonApi() {
  const token = ref(ambilToken())
  const butuhLogin = ref(!token.value)
  const passInput = ref('')
  const passErr = ref('')

  // Axios polos: halaman publik, tidak boleh ikut alur refresh/redirect login
  const http = axios.create({ baseURL: '/api/prtg-rekon' })
  http.interceptors.request.use((c) => { c.headers['X-Rekon-Token'] = token.value; return c })

  function masuk(setelahMasuk: () => void) {
    const v = passInput.value.trim()
    if (!v) return
    token.value = v
    try { sessionStorage.setItem('rekon_token', v) } catch { /* sessionStorage diblokir: cukup di memori */ }
    passInput.value = ''
    passErr.value = ''
    butuhLogin.value = false
    setelahMasuk()
  }

  // Panggil di catch: true bila 401 (password salah) → form login ditampilkan lagi
  function tanganiGagalLogin(e: any): boolean {
    if (e?.response?.status !== 401) return false
    try { sessionStorage.removeItem('rekon_token') } catch { /* abaikan */ }
    token.value = ''
    butuhLogin.value = true
    passErr.value = 'Password salah.'
    return true
  }

  return { http, token, butuhLogin, passInput, passErr, masuk, tanganiGagalLogin }
}
