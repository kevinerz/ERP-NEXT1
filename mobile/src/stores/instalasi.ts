import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../services/api'

export interface InstalasiItem {
  id_instalasi: number
  nomor_instalasi: string
  jenis_pelaksana: string
  status_instalasi: string
  tgl_jadwal?: string
  tgl_mulai?: string
  tgl_selesai?: string
  catatan?: string
  site?: { id_site: number; kode_site: string; nama_site: string; kota?: string; alamat?: string; pelanggan?: { nama_pelanggan: string } }
  layanan?: { nama_layanan: string }
  teknisi_internal?: { nama_lengkap: string }
  kontak_teknisi?: { nama: string; no_hp: string }
  photos?: { id_foto: number; stage: string; filename: string; caption?: string }[]
  logs?: { id_log: number; status_dari?: string; status_ke?: string; catatan?: string; created_at: string }[]
  bast?: { nama_penandatangan_pelanggan?: string; jabatan_penandatangan?: string; ttd_teknisi_path?: string; ttd_pelanggan_path?: string }
}

export const useInstalasiStore = defineStore('instalasi', () => {
  const list = ref<InstalasiItem[]>([])
  const current = ref<InstalasiItem | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function fetchVendorTugas() {
    loading.value = true; error.value = ''
    try {
      const { data } = await api.get('/instalasi/vendor/tugas')
      list.value = data.data ?? []
    } catch (e: any) {
      error.value = e?.response?.data?.message || 'Gagal memuat tugas'
    } finally { loading.value = false }
  }

  async function fetchOne(id: number) {
    loading.value = true; error.value = ''
    try {
      const { data } = await api.get(`/instalasi/${id}`)
      current.value = data.data
      return data.data as InstalasiItem
    } catch (e: any) {
      error.value = e?.response?.data?.message || 'Data tidak ditemukan'
      return null
    } finally { loading.value = false }
  }

  async function updateStatus(id: number, status_instalasi: string, catatan?: string) {
    const { data } = await api.patch(`/instalasi/${id}`, { status_instalasi, catatan })
    return data.data
  }

  async function addLog(id_instalasi: number, catatan: string) {
    const { data } = await api.post('/instalasi/log', { id_instalasi, catatan })
    return data.data
  }

  async function uploadFoto(id: number, file: File, stage: string, caption?: string) {
    const form = new FormData()
    form.append('file', file)
    form.append('stage', stage)
    if (caption) form.append('caption', caption)
    const { data } = await api.post(`/instalasi/${id}/foto`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  }

  async function saveBAST(id: number, payload: any) {
    const { data } = await api.post(`/instalasi/${id}/bast`, payload)
    return data.data
  }

  return { list, current, loading, error, fetchVendorTugas, fetchOne, updateStatus, addLog, uploadFoto, saveBAST }
})
