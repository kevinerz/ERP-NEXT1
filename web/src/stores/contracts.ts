import { defineStore } from 'pinia'
import api from '@/services/api'

export interface Kontrak {
  id_kontrak: number
  nomor_kontrak: string
  id_site: number
  id_layanan: number
  id_quotation?: number
  tgl_mulai: string
  tgl_berakhir?: string
  durasi_bulan: number
  harga_mrc: number
  harga_otc: number
  status_kontrak: string
  tanggal_terminasi?: string
  alasan_terminasi?: string
  created_at: string
  site?: { kode_site: string; nama_site: string; pelanggan?: { nama_pelanggan: string } }
  layanan?: { nama_layanan: string; kode_layanan: string }
  quotation?: { nomor_quotation: string; grand_total: number }
}

export interface KontrakSummary {
  statuses: { status: string; count: number }[]
  akan_berakhir: number
  total_mrc_aktif: number
}

export const useContractsStore = defineStore('contracts', {
  state: () => ({
    list: [] as Kontrak[],
    meta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    current: null as Kontrak | null,
    summary: null as KontrakSummary | null,
    loading: false,
    error: '',
  }),
  actions: {
    async fetchList(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const r = await api.get('/contracts', { params })
        this.list = r.data.data
        this.meta = r.data.meta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat kontrak' }
      finally { this.loading = false }
    },
    async fetchOne(id: number) {
      this.loading = true; this.error = ''
      try {
        const r = await api.get(`/contracts/${id}`)
        this.current = r.data.data
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat kontrak' }
      finally { this.loading = false }
    },
    async create(payload: Record<string, any>) {
      const r = await api.post('/contracts', payload)
      return r.data.data
    },
    async update(id: number, payload: Record<string, any>) {
      const r = await api.patch(`/contracts/${id}`, payload)
      if (this.current?.id_kontrak === id) this.current = r.data.data
      return r.data.data
    },
    async terminasi(id: number, payload: { tanggal_terminasi: string; alasan_terminasi?: string }) {
      const r = await api.post(`/contracts/${id}/terminasi`, payload)
      if (this.current?.id_kontrak === id) this.current = r.data.data
      return r.data.data
    },
    async fetchSummary() {
      try {
        const r = await api.get('/contracts/summary')
        this.summary = r.data.data
      } catch {}
    },
  },
})
