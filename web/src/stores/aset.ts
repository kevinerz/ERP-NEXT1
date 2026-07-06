import { defineStore } from 'pinia'
import api from '@/services/api'

export interface Aset {
  id_aset: number
  kode_aset: string
  nama_perangkat: string
  merk?: string
  tipe_model?: string
  serial_number?: string
  is_serialized: boolean
  stok_jumlah: number
  kategori: string
  kondisi: string
  status_aset: string
  id_site?: number
  id_gudang?: number
  tgl_perolehan?: string
  harga_perolehan?: number
  catatan?: string
  created_at: string
  site?: { kode_site: string; nama_site: string; pelanggan?: { nama_pelanggan: string } }
  gudang?: { id_gudang: number; kode_gudang: string; nama_gudang: string; kota?: string | null } | null
  _count?: { mutasi: number }
  mutasi?: MutasiAset[]
}

export interface MutasiAset {
  id_mutasi: number
  id_aset: number
  jenis_mutasi: string
  jumlah: number
  id_project?: number
  id_wo?: number
  id_site_asal?: number
  id_site_tujuan?: number
  keterangan?: string
  created_at: string
  user?: { karyawan?: { nama_lengkap: string } }
}

export interface AsetSummary { status: string; count: number }
export interface AsetSummaryGudang { id_gudang: number; kode_gudang: string; nama_gudang: string; kota?: string | null; count: number }

export const useAsetStore = defineStore('aset', {
  state: () => ({
    list: [] as Aset[],
    meta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    current: null as Aset | null,
    summary: [] as AsetSummary[],
    summaryGudang: [] as AsetSummaryGudang[],
    kategoriList: [] as string[],
    loading: false,
    error: '',
  }),
  actions: {
    async fetchList(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const r = await api.get('/assets', { params })
        this.list = r.data.data
        this.meta = r.data.meta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat aset' }
      finally { this.loading = false }
    },
    async fetchOne(id: number) {
      this.loading = true; this.error = ''
      try {
        const r = await api.get(`/assets/${id}`)
        this.current = r.data.data
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat aset' }
      finally { this.loading = false }
    },
    async create(payload: Record<string, any>) {
      const r = await api.post('/assets', payload)
      return r.data.data
    },
    async update(id: number, payload: Record<string, any>) {
      const r = await api.patch(`/assets/${id}`, payload)
      if (this.current?.id_aset === id) this.current = r.data.data
      return r.data.data
    },
    async createMutasi(payload: Record<string, any>) {
      const r = await api.post('/assets/mutasi', payload)
      // Refresh current if it matches
      if (this.current?.id_aset === payload.id_aset) await this.fetchOne(payload.id_aset)
      return r.data.data
    },
    async fetchSummary() {
      try {
        const r = await api.get('/assets/summary')
        this.summary = r.data.data?.by_status ?? []
        this.summaryGudang = r.data.data?.by_gudang ?? []
      } catch {}
    },
    async fetchKategori() {
      try {
        const r = await api.get('/assets/kategori')
        this.kategoriList = r.data.data
      } catch {}
    },
  },
})
