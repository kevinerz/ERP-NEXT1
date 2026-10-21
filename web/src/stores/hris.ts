import { defineStore } from 'pinia'
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
  foto_url?: string
  tempat_lahir?: string
  tgl_lahir?: string
  jenis_kelamin?: string
  agama?: string
  status_pernikahan?: string
  no_ktp?: string
  alamat_ktp?: string
  no_npwp?: string
  pendidikan_terakhir?: string
  kontak_darurat_nama?: string
  kontak_darurat_hp?: string
  kontak_darurat_hubungan?: string
  bank_nama?: string
  bank_no_rekening?: string
  bank_atas_nama?: string
  user?: {
    id_user: number
    username: string
    is_aktif: boolean
    last_login?: string
    modul_akses?: string[]
    user_roles: { role: { id_role: number; nama_role: string } }[]
  }
}

/** Payload create/update: field opsional boleh dikirim null untuk mengosongkan. */
export type KaryawanPayload = { [K in keyof Karyawan]?: Karyawan[K] | null }

export interface KaryawanMeta {
  total: number
  page: number
  limit: number
  total_pages: number
}

export const useHrisStore = defineStore('hris', {
  state: () => ({
    list: [] as Karyawan[],
    meta: { total: 0, page: 1, limit: 20, total_pages: 0 } as KaryawanMeta,
    current: null as Karyawan | null,
    roles: [] as { id_role: number; nama_role: string; deskripsi: string }[],
    departemenList: [] as string[],
    loading: false,
    error: '',
  }),

  actions: {
    async fetchList(params: Record<string, any> = {}) {
      this.loading = true
      this.error = ''
      try {
        const { data } = await api.get('/hris/karyawan', { params })
        // ResponseInterceptor: { success, data: [...], meta: {...}, message }
        this.list = data.data ?? []
        this.meta = data.meta ?? this.meta
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal memuat data'
      } finally {
        this.loading = false
      }
    },

    async fetchOne(id: number) {
      this.loading = true
      try {
        const { data } = await api.get(`/hris/karyawan/${id}`)
        this.current = data.data   // single object tetap di data.data
        return data.data
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal memuat karyawan'
        return null
      } finally {
        this.loading = false
      }
    },

    async createKaryawan(payload: KaryawanPayload) {
      const { data } = await api.post('/hris/karyawan', payload)
      return data.data
    },

    async updateKaryawan(id: number, payload: KaryawanPayload) {
      const { data } = await api.patch(`/hris/karyawan/${id}`, payload)
      return data.data
    },

    async toggleStatus(id: number) {
      const { data } = await api.patch(`/hris/karyawan/${id}/toggle-status`)
      const idx = this.list.findIndex((k) => k.id_karyawan === id)
      if (idx >= 0) this.list[idx]!.status_aktif = data.data.status_aktif
      return data.data
    },

    async deleteKaryawan(id: number) {
      await api.delete(`/hris/karyawan/${id}`)
      this.list = this.list.filter((k) => k.id_karyawan !== id)
    },

    async createUserAccount(id: number, payload: { username: string; password: string; role_ids: number[] }) {
      const { data } = await api.post(`/hris/karyawan/${id}/user`, payload)
      return data.data
    },

    async resetPassword(id: number, new_password: string) {
      const { data } = await api.patch(`/hris/karyawan/${id}/user/reset-password`, { new_password })
      return data.data
    },

    async updateUserRoles(id: number, role_ids: number[]) {
      const { data } = await api.patch(`/hris/karyawan/${id}/user/roles`, { role_ids })
      return data.data
    },

    async toggleUserStatus(id: number) {
      const { data } = await api.patch(`/hris/karyawan/${id}/user/toggle-status`)
      return data.data
    },

    async updateModulAkses(id: number, modul_akses: string[]) {
      const { data } = await api.patch(`/hris/karyawan/${id}/user/modul-akses`, { modul_akses })
      return data.data
    },

    async fetchRoles() {
      if (this.roles.length) return
      try {
        const { data } = await api.get('/hris/roles')
        this.roles = data.data
      } catch { /* silent */ }
    },

    async fetchDepartemen() {
      if (this.departemenList.length) return
      try {
        const { data } = await api.get('/hris/departemen')
        this.departemenList = data.data
      } catch { /* silent */ }
    },
  },
})
