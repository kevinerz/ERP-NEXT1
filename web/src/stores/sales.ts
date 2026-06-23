import { defineStore } from 'pinia'
import api from '@/services/api'

export interface Lead {
  id_lead: number
  nama_prospek: string
  nama_perusahaan?: string
  no_kontak?: string
  email?: string
  sumber_lead: string
  status_lead: string
  catatan_awal?: string
  created_at: string
  sales_pic: { id_karyawan: number; nama_lengkap: string; jabatan: string }
  _count?: { opportunities: number; activities: number }
}

export interface Opportunity {
  id_opportunity: number
  id_lead: number
  id_layanan?: number
  nama_opportunity: string
  estimasi_nilai: number
  tahapan: string
  alasan_lost?: string
  tgl_target_close?: string
  catatan?: string
  created_at: string
  lead?: { id_lead: number; nama_prospek: string; nama_perusahaan?: string }
  layanan?: { kode_layanan: string; nama_layanan: string }
  sales_pic: { id_karyawan: number; nama_lengkap: string }
  _count?: { quotations: number; activities: number }
}

export interface Quotation {
  id_quotation: number
  id_opportunity: number
  nomor_quotation: string
  tgl_quotation: string
  tgl_berlaku_sampai?: string
  harga_mrc: number
  harga_otc: number
  status_approval: string
  catatan?: string
  catatan_approval?: string
  created_at: string
  sales_pic: { nama_lengkap: string }
  approver?: { nama_lengkap: string }
}

export interface PipelineItem {
  tahapan: string
  count: number
  total_nilai: number
}

export const useSalesStore = defineStore('sales', {
  state: () => ({
    pipeline: [] as PipelineItem[],
    leadList: [] as Lead[],
    leadMeta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    currentLead: null as any,
    oppList: [] as Opportunity[],
    oppMeta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    currentOpp: null as any,
    quotationList: [] as Quotation[],
    quotationMeta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    salesList: [] as { id_karyawan: number; nama_lengkap: string; jabatan: string }[],
    loading: false,
    error: '',
  }),

  actions: {
    async fetchPipeline() {
      try {
        const { data } = await api.get('/sales/pipeline')
        this.pipeline = data.data ?? []
      } catch { /* silent */ }
    },

    async fetchSalesList() {
      if (this.salesList.length) return
      try {
        const { data } = await api.get('/sales/sales-list')
        this.salesList = data.data ?? []
      } catch { /* silent */ }
    },

    // ─── LEAD ─────────────────────────────────────────────────
    async fetchLeads(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const { data } = await api.get('/sales/lead', { params })
        this.leadList = data.data ?? []
        this.leadMeta = data.meta ?? this.leadMeta
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal memuat lead'
      } finally { this.loading = false }
    },

    async fetchOneLead(id: number) {
      this.loading = true
      try {
        const { data } = await api.get(`/sales/lead/${id}`)
        this.currentLead = data.data
        return data.data
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Lead tidak ditemukan'
        return null
      } finally { this.loading = false }
    },

    async createLead(payload: any) {
      const { data } = await api.post('/sales/lead', payload)
      return data.data
    },

    async updateLead(id: number, payload: any) {
      const { data } = await api.patch(`/sales/lead/${id}`, payload)
      return data.data
    },

    // ─── OPPORTUNITY ──────────────────────────────────────────
    async fetchOpportunities(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const { data } = await api.get('/sales/opportunity', { params })
        this.oppList = data.data ?? []
        this.oppMeta = data.meta ?? this.oppMeta
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal memuat opportunity'
      } finally { this.loading = false }
    },

    async fetchOneOpportunity(id: number) {
      this.loading = true
      try {
        const { data } = await api.get(`/sales/opportunity/${id}`)
        this.currentOpp = data.data
        return data.data
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Opportunity tidak ditemukan'
        return null
      } finally { this.loading = false }
    },

    async createOpportunity(payload: any) {
      const { data } = await api.post('/sales/opportunity', payload)
      return data.data
    },

    async updateOpportunity(id: number, payload: any) {
      const { data } = await api.patch(`/sales/opportunity/${id}`, payload)
      return data.data
    },

    // ─── QUOTATION ────────────────────────────────────────────
    async createQuotation(payload: any) {
      const { data } = await api.post('/sales/quotation', payload)
      return data.data
    },

    async updateQuotation(id: number, payload: any) {
      const { data } = await api.patch(`/sales/quotation/${id}`, payload)
      return data.data
    },

    async approveQuotation(id: number, payload: any) {
      const { data } = await api.patch(`/sales/quotation/${id}/approve`, payload)
      return data.data
    },

    // ─── ACTIVITY ─────────────────────────────────────────────
    async createActivity(payload: any) {
      const { data } = await api.post('/sales/activity', payload)
      return data.data
    },
  },
})
