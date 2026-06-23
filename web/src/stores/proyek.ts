import { defineStore } from 'pinia'
import api from '@/services/api'

export interface Project {
  id_project: number
  nomor_project: string
  status_project: string
  tgl_mulai?: string
  tgl_target_selesai?: string
  tgl_actual_selesai?: string
  catatan?: string
  created_at: string
  opportunity?: { nama_opportunity: string; lead?: { nama_prospek: string; nama_perusahaan?: string } }
  site?: { id_site: number; kode_site: string; nama_site: string; alamat_lengkap: string; kota?: string }
  pm?: { id_karyawan: number; nama_lengkap: string; jabatan: string }
  _count?: { work_orders: number }
  work_orders?: WorkOrder[]
  bast?: Bast[]
}

export interface WorkOrder {
  id_wo: number
  nomor_wo: string
  jenis_wo: string
  tipe_eksekutor: string
  tgl_jadwal: string
  deskripsi_tugas: string
  status_wo: string
  catatan_teknisi?: string
  fee_vendor: number
  status_pembayaran_fee: string
  completed_at?: string
  teknisi?: { id_karyawan: number; nama_lengkap: string }
  vendor?: { id_vendor: number; nama_vendor: string }
  site?: { kode_site: string; nama_site: string }
  project?: { nomor_project: string }
}

export interface Bast {
  id_dokumen: number
  nomor_bast: string
  nama_penandatangan_pelanggan?: string
  jabatan_penandatangan_pelanggan?: string
  tgl_ditandatangani?: string
  status_sinkronisasi_finance: string
  catatan?: string
  created_at: string
}

export const useProyekStore = defineStore('proyek', {
  state: () => ({
    list: [] as Project[],
    meta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    current: null as Project | null,
    summary: [] as { status: string; count: number }[],
    pmList: [] as { id_karyawan: number; nama_lengkap: string; jabatan: string }[],
    teknisiList: [] as { id_karyawan: number; nama_lengkap: string; jabatan: string }[],
    siteList: [] as any[],
    loading: false,
    error: '',
  }),

  actions: {
    async fetchList(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const { data } = await api.get('/projects', { params })
        this.list = data.data ?? []
        this.meta = data.meta ?? this.meta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat project' }
      finally { this.loading = false }
    },

    async fetchOne(id: number) {
      this.loading = true
      try {
        const { data } = await api.get(`/projects/${id}`)
        this.current = data.data
        return data.data
      } catch (e: any) { this.error = e.response?.data?.message || 'Project tidak ditemukan'; return null }
      finally { this.loading = false }
    },

    async create(payload: any) {
      const { data } = await api.post('/projects', payload)
      return data.data
    },

    async update(id: number, payload: any) {
      const { data } = await api.patch(`/projects/${id}`, payload)
      return data.data
    },

    async createWo(payload: any) {
      const { data } = await api.post('/projects/wo', payload)
      return data.data
    },

    async updateWo(id: number, payload: any) {
      const { data } = await api.patch(`/projects/wo/${id}`, payload)
      return data.data
    },

    async createBast(payload: any) {
      const { data } = await api.post('/projects/bast', payload)
      return data.data
    },

    async updateBast(id: number, payload: any) {
      const { data } = await api.patch(`/projects/bast/${id}`, payload)
      return data.data
    },

    async fetchSummary() {
      try {
        const { data } = await api.get('/projects/summary')
        this.summary = data.data ?? []
      } catch { /* silent */ }
    },

    async fetchPmList() {
      if (this.pmList.length) return
      try {
        const { data } = await api.get('/projects/pm-list')
        this.pmList = data.data ?? []
      } catch { /* silent */ }
    },

    async fetchTeknisiList() {
      if (this.teknisiList.length) return
      try {
        const { data } = await api.get('/projects/teknisi-list')
        this.teknisiList = data.data ?? []
      } catch { /* silent */ }
    },

    async fetchSiteList(search?: string) {
      try {
        const params = search ? { search } : {}
        const { data } = await api.get('/projects/site-list', { params })
        this.siteList = data.data ?? []
      } catch { /* silent */ }
    },
  },
})
