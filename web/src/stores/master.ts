import { defineStore } from 'pinia'
import api from '@/services/api'

export interface Layanan {
  id_layanan: number
  kode_layanan: string
  nama_layanan: string
  deskripsi?: string
  sla_target_pct: number
  is_managed: boolean
  is_aktif: boolean
}

export interface Vendor {
  id_vendor: number
  nama_vendor: string
  tipe_vendor: string
  kontak_pic?: string
  email_pic?: string
  no_telp?: string
  alamat?: string
  bank_nama?: string
  bank_no_rekening?: string
  bank_atas_nama?: string
  catatan?: string
  is_aktif: boolean
  created_at: string
}

export interface VendorMeta {
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface GrupPelanggan {
  id_grup: number
  kode_grup: string
  nama_grup: string
  deskripsi?: string
  pelanggan?: Array<{
    id_pelanggan: number
    kode_pelanggan: string
    nama_pelanggan: string
    kota?: string
    jenis_usaha?: string
    _count?: { sites: number }
  }>
}

export interface Pelanggan {
  id_pelanggan: number
  kode_pelanggan: string
  id_grup?: number | null
  nama_pelanggan: string
  jenis_usaha?: string
  npwp?: string
  alamat_kantor?: string
  kota?: string
  no_telp?: string
  nama_pemilik?: string
  jabatan_pemilik?: string
  no_ktp_pemilik?: string
  no_ponsel_pemilik?: string
  nama_pic_teknis?: string
  jabatan_pic_teknis?: string
  no_telp_pic_teknis?: string
  no_ponsel_pic_teknis?: string
  email_pic_teknis?: string
  nama_pic_keuangan?: string
  jabatan_pic_keuangan?: string
  no_telp_pic_keuangan?: string
  no_ponsel_pic_keuangan?: string
  email_pic_keuangan?: string
  alamat_penagihan?: string
  email_billing?: string
  nama_pic_utama?: string
  no_hp_pic_utama?: string
  created_at: string
  _count?: { sites: number }
  grup?: { id_grup: number; kode_grup: string; nama_grup: string } | null
}

export interface SitePelanggan {
  id_site: number
  id_pelanggan: number
  id_layanan: number
  kode_site: string
  nama_site: string
  alamat_lengkap: string
  kota?: string
  provinsi?: string
  status_site: string
  tgl_aktif?: string
  tgl_terminasi?: string
  catatan?: string
  pelanggan?: {
    id_pelanggan: number
    nama_pelanggan: string
    kode_pelanggan: string
    id_grup?: number | null
    grup?: { id_grup: number; kode_grup: string; nama_grup: string } | null
  }
  layanan?: { kode_layanan: string; nama_layanan: string }
}

export const useMasterStore = defineStore('master', {
  state: () => ({
    layananList: [] as Layanan[],
    layananLoading: false,

    vendorList: [] as Vendor[],
    vendorMeta: { total: 0, page: 1, limit: 20, total_pages: 0 } as VendorMeta,
    vendorLoading: false,

    tipeVendorList: [] as string[],

    pelangganList: [] as Pelanggan[],
    pelangganMeta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    pelangganDropdown: [] as { id_pelanggan: number; kode_pelanggan: string; nama_pelanggan: string }[],
    pelangganLoading: false,
    grupList: [] as GrupPelanggan[],
    grupLoading: false,

    siteList: [] as SitePelanggan[],
    siteMeta: { total: 0, page: 1, limit: 20, total_pages: 0, status_counts: { Prospek: 0, Aktif: 0, Terminasi: 0, Suspend: 0 } as Record<string, number> },
    siteLoading: false,
    siteAllList: [] as SitePelanggan[],
    siteAllLoading: false,

    error: '',
  }),

  actions: {
    // ─── LAYANAN ──────────────────────────────────────────────
    async fetchLayanan(params: Record<string, any> = {}) {
      this.layananLoading = true
      this.error = ''
      try {
        const { data } = await api.get('/master/layanan', { params })
        this.layananList = data.data ?? []
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal memuat layanan'
      } finally {
        this.layananLoading = false
      }
    },

    async createLayanan(payload: Partial<Layanan>) {
      const { data } = await api.post('/master/layanan', payload)
      return data.data
    },

    async updateLayanan(id: number, payload: Partial<Layanan>) {
      const { data } = await api.patch(`/master/layanan/${id}`, payload)
      return data.data
    },

    async toggleLayanan(id: number) {
      const { data } = await api.patch(`/master/layanan/${id}/toggle`)
      const idx = this.layananList.findIndex((l) => l.id_layanan === id)
      if (idx >= 0) this.layananList[idx].is_aktif = data.data.is_aktif
      return data.data
    },

    // ─── VENDOR ───────────────────────────────────────────────
    async fetchVendor(params: Record<string, any> = {}) {
      this.vendorLoading = true
      this.error = ''
      try {
        const { data } = await api.get('/master/vendor', { params })
        this.vendorList = data.data ?? []
        this.vendorMeta = data.meta ?? this.vendorMeta
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal memuat vendor'
      } finally {
        this.vendorLoading = false
      }
    },

    async createVendor(payload: Partial<Vendor>) {
      const { data } = await api.post('/master/vendor', payload)
      return data.data
    },

    async updateVendor(id: number, payload: Partial<Vendor>) {
      const { data } = await api.patch(`/master/vendor/${id}`, payload)
      return data.data
    },

    async toggleVendor(id: number) {
      const { data } = await api.patch(`/master/vendor/${id}/toggle`)
      const idx = this.vendorList.findIndex((v) => v.id_vendor === id)
      if (idx >= 0) this.vendorList[idx].is_aktif = data.data.is_aktif
      return data.data
    },

    async fetchTipeVendor() {
      if (this.tipeVendorList.length) return
      try {
        const { data } = await api.get('/master/vendor/tipe-list')
        this.tipeVendorList = data.data ?? []
      } catch { /* silent */ }
    },

    // ─── GRUP PELANGGAN ───────────────────────────────────────
    async fetchGrupPelanggan() {
      this.grupLoading = true
      try {
        const { data } = await api.get('/master/grup')
        this.grupList = data.data ?? []
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat grup' }
      finally { this.grupLoading = false }
    },

    async createGrup(payload: { kode_grup: string; nama_grup: string; deskripsi?: string }) {
      const { data } = await api.post('/master/grup', payload)
      return data.data
    },

    async updateGrup(id: number, payload: { kode_grup?: string; nama_grup?: string; deskripsi?: string }) {
      const { data } = await api.patch(`/master/grup/${id}`, payload)
      return data.data
    },

    async removeGrup(id: number) {
      await api.delete(`/master/grup/${id}`)
    },

    // ─── PELANGGAN ────────────────────────────────────────────
    async fetchPelanggan(params: Record<string, any> = {}) {
      this.pelangganLoading = true; this.error = ''
      try {
        const { data } = await api.get('/master/pelanggan', { params })
        this.pelangganList = data.data ?? []
        this.pelangganMeta = data.meta ?? this.pelangganMeta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat pelanggan' }
      finally { this.pelangganLoading = false }
    },

    async fetchPelangganDropdown() {
      if (this.pelangganDropdown.length) return
      try {
        const { data } = await api.get('/master/pelanggan/dropdown')
        this.pelangganDropdown = data.data ?? []
      } catch { /* silent */ }
    },

    async createPelanggan(payload: any) {
      const { data } = await api.post('/master/pelanggan', payload)
      return data.data
    },

    async updatePelanggan(id: number, payload: any) {
      const { data } = await api.patch(`/master/pelanggan/${id}`, payload)
      return data.data
    },

    // ─── SITE ─────────────────────────────────────────────────
    async fetchSiteAll() {
      this.siteAllLoading = true
      try {
        const { data } = await api.get('/master/site', { params: { limit: 2000 } })
        this.siteAllList = data.data ?? []
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat semua site' }
      finally { this.siteAllLoading = false }
    },

    async fetchSite(params: Record<string, any> = {}) {
      this.siteLoading = true; this.error = ''
      try {
        const { data } = await api.get('/master/site', { params })
        this.siteList = data.data ?? []
        this.siteMeta = data.meta ?? this.siteMeta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat site' }
      finally { this.siteLoading = false }
    },

    async createSite(payload: any) {
      const { data } = await api.post('/master/site', payload)
      return data.data
    },

    async updateSite(id: number, payload: any) {
      const { data } = await api.patch(`/master/site/${id}`, payload)
      return data.data
    },
  },
})
