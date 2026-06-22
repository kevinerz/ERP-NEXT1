import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface Karyawan {
  id_karyawan: number
  nip: string
  nama_lengkap: string
  jabatan: string
  departemen: string
  no_hp?: string
  email?: string
  tgl_bergabung?: string
  status_aktif: boolean
  created_at: string
  user?: {
    id_user: number
    username: string
    is_aktif: boolean
    last_login?: string
    user_roles: { role: { id_role: number; nama_role: string } }[]
  }
}

export interface KaryawanMeta {
  total: number
  page: number
  limit: number
  total_pages: number
}

export const useHrisStore = defineStore('hris', () => {
  const list = ref<Karyawan[]>([])
  const meta = ref<KaryawanMeta>({ total: 0, page: 1, limit: 20, total_pages: 0 })
  const current = ref<Karyawan | null>(null)
  const roles = ref<{ id_role: number; nama_role: string; deskripsi: string }[]>([])
  const departemenList = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')

  async function fetchList(params: Record<string, any> = {}) {
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get('/hris/karyawan', { params })
      list.value = data.data.data
      meta.value = data.data.meta
    } catch (e: any) {
      error.value = e.response?.data?.message || 'Gagal memuat data'
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: number) {
    loading.value = true
    try {
      const { data } = await api.get(`/hris/karyawan/${id}`)
      current.value = data.data
      return data.data
    } catch (e: any) {
      error.value = e.response?.data?.message || 'Gagal memuat karyawan'
      return null
    } finally {
      loading.value = false
    }
  }

  async function createKaryawan(payload: Partial<Karyawan>) {
    const { data } = await api.post('/hris/karyawan', payload)
    return data.data
  }

  async function updateKaryawan(id: number, payload: Partial<Karyawan>) {
    const { data } = await api.patch(`/hris/karyawan/${id}`, payload)
    return data.data
  }

  async function toggleStatus(id: number) {
    const { data } = await api.patch(`/hris/karyawan/${id}/toggle-status`)
    // Update in list
    const idx = list.value.findIndex((k) => k.id_karyawan === id)
    if (idx >= 0) list.value[idx].status_aktif = data.data.status_aktif
    return data.data
  }

  async function createUserAccount(id: number, payload: { username: string; password: string; role_ids: number[] }) {
    const { data } = await api.post(`/hris/karyawan/${id}/user`, payload)
    return data.data
  }

  async function resetPassword(id: number, new_password: string) {
    const { data } = await api.patch(`/hris/karyawan/${id}/user/reset-password`, { new_password })
    return data.data
  }

  async function toggleUserStatus(id: number) {
    const { data } = await api.patch(`/hris/karyawan/${id}/user/toggle-status`)
    return data.data
  }

  async function fetchRoles() {
    if (roles.value.length) return
    const { data } = await api.get('/hris/roles')
    roles.value = data.data
  }

  async function fetchDepartemen() {
    if (departemenList.value.length) return
    const { data } = await api.get('/hris/departemen')
    departemenList.value = data.data
  }

  return {
    list, meta, current, roles, departemenList, loading, error,
    fetchList, fetchOne, createKaryawan, updateKaryawan, toggleStatus,
    createUserAccount, resetPassword, toggleUserStatus, fetchRoles, fetchDepartemen,
  }
})
