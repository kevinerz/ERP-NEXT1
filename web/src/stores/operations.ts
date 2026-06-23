import { defineStore } from 'pinia'
import api from '@/services/api'

export interface Ticket {
  id_ticket: number
  nomor_tiket: string
  judul_tiket: string
  deskripsi_masalah?: string
  prioritas: string
  status_tiket: string
  sumber_tiket: string
  tgl_open: string
  tgl_resolved?: string
  tgl_closed?: string
  created_at: string
  site?: {
    id_site: number; kode_site: string; nama_site: string; kota?: string; alamat_lengkap?: string
    pelanggan?: { nama_pelanggan: string; kode_pelanggan: string; no_telp?: string; nama_pic_utama?: string }
    layanan?: { kode_layanan: string; nama_layanan: string }
  }
  teknisi?: { id_karyawan: number; nama_lengkap: string; jabatan: string }
  work_orders?: any[]
  logs?: { id_log: number; status_baru?: string; catatan?: string; created_at: string; user?: { nama_lengkap: string } }[]
  _count?: { work_orders: number; logs: number }
}

export const useOperationsStore = defineStore('operations', {
  state: () => ({
    list: [] as Ticket[],
    meta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    current: null as Ticket | null,
    summary: [] as { status: string; count: number }[],
    teknisiList: [] as { id_karyawan: number; nama_lengkap: string; jabatan: string }[],
    loading: false,
    error: '',
  }),

  actions: {
    async fetchList(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const { data } = await api.get('/operations', { params })
        this.list = data.data ?? []
        this.meta = data.meta ?? this.meta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat tiket' }
      finally { this.loading = false }
    },

    async fetchOne(id: number) {
      this.loading = true
      try {
        const { data } = await api.get(`/operations/${id}`)
        this.current = data.data
        return data.data
      } catch (e: any) { this.error = e.response?.data?.message || 'Tiket tidak ditemukan'; return null }
      finally { this.loading = false }
    },

    async create(payload: any) {
      const { data } = await api.post('/operations', payload)
      return data.data
    },

    async update(id: number, payload: any) {
      const { data } = await api.patch(`/operations/${id}`, payload)
      return data.data
    },

    async addLog(payload: any) {
      const { data } = await api.post('/operations/log', payload)
      return data.data
    },

    async fetchSummary() {
      try {
        const { data } = await api.get('/operations/summary')
        this.summary = data.data ?? []
      } catch { /* silent */ }
    },

    async fetchTeknisiList() {
      if (this.teknisiList.length) return
      try {
        const { data } = await api.get('/operations/teknisi-list')
        this.teknisiList = data.data ?? []
      } catch { /* silent */ }
    },
  },
})
