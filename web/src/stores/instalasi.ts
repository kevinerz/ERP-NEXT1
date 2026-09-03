import { defineStore } from 'pinia'
import api from '@/services/api'

export interface InstalasiItem {
  id_instalasi: number
  nomor_instalasi: string
  jenis_pelaksana: string
  status_instalasi: string
  tgl_jadwal?: string
  tgl_mulai?: string
  tgl_selesai?: string
  fee_vendor?: number
  catatan?: string
  lokasi_lat?: number
  lokasi_lng?: number
  created_at: string
  site?: { id_site: number; kode_site: string; nama_site: string; kota?: string; pelanggan?: { nama_pelanggan: string; kode_pelanggan: string } }
  layanan?: { id_layanan: number; nama_layanan: string; kode_layanan: string }
  teknisi_internal?: { id_karyawan: number; nama_lengkap: string; jabatan: string }
  kontak_teknisi?: { id_kontak: number; nama: string; no_hp: string; asal_vendor?: string }
  photos?: { id_foto: number; stage: string; filename: string; caption?: string; created_at: string }[]
  logs?: { id_log: number; status_dari?: string; status_ke?: string; catatan?: string; created_at: string }[]
  bast?: { id_bast: number; nama_penandatangan_pelanggan?: string; jabatan_penandatangan?: string; ttd_teknisi_path?: string; ttd_pelanggan_path?: string; tgl_ditandatangani?: string }
  _count?: { photos: number; logs: number }
}

export const useInstalasiStore = defineStore('instalasi', {
  state: () => ({
    list: [] as InstalasiItem[],
    meta: { total: 0, page: 1, limit: 20, total_pages: 0 },
    current: null as InstalasiItem | null,
    loading: false,
    error: '',
  }),

  actions: {
    async fetchList(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const { data } = await api.get('/instalasi', { params })
        this.list = data.data ?? []
        this.meta = data.meta ?? this.meta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat data instalasi' }
      finally { this.loading = false }
    },

    async fetchOne(id: number) {
      this.loading = true; this.error = ''
      try {
        const { data } = await api.get(`/instalasi/${id}`)
        this.current = data.data
        return data.data
      } catch (e: any) { this.error = e.response?.data?.message || 'Data tidak ditemukan'; return null }
      finally { this.loading = false }
    },

    async create(payload: any) {
      const { data } = await api.post('/instalasi', payload)
      return data.data
    },

    async update(id: number, payload: any) {
      const { data } = await api.patch(`/instalasi/${id}`, payload)
      return data.data
    },

    async addLog(payload: any) {
      const { data } = await api.post('/instalasi/log', payload)
      return data.data
    },

    async saveBAST(id: number, payload: any) {
      const { data } = await api.post(`/instalasi/${id}/bast`, payload)
      return data.data
    },

    async uploadFoto(id: number, file: File, stage: string, caption?: string) {
      const form = new FormData()
      form.append('file', file)
      form.append('stage', stage)
      if (caption) form.append('caption', caption)
      const { data } = await api.post(`/instalasi/${id}/foto`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.data
    },

    async deleteFoto(id_foto: number) {
      await api.delete(`/instalasi/foto/${id_foto}`)
    },

    async setVendorPin(id_kontak: number, pin: string) {
      const { data } = await api.patch(`/instalasi/vendor/${id_kontak}/set-pin`, { pin })
      return data
    },

    async remove(id: number) {
      const { data } = await api.delete(`/instalasi/${id}`)
      return data
    },
  },
})
