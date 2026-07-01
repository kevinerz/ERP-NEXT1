import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface InvoicePembayaran {
  id_pembayaran: number
  tgl_bayar: string
  jumlah: number
  metode: string
  referensi?: string
  catatan?: string
  user?: { karyawan?: { nama_lengkap?: string } }
}

export interface Invoice {
  id_invoice: number
  nomor_invoice: string
  periode: string
  tgl_invoice: string
  tgl_jatuh_tempo: string
  subtotal: number
  ppn_persen: number
  ppn_nominal: number
  total: number
  jumlah_dibayar: number
  status: string
  catatan?: string
  site?: {
    id_site: number
    kode_site: string
    nama_site: string
    pelanggan?: { nama_pelanggan: string; email_billing?: string; no_telp?: string }
  }
  kontrak?: { id_kontrak: number; nomor_kontrak: string; harga_mrc: number } | null
  pembayaran?: InvoicePembayaran[]
}

export interface FinanceMeta {
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface FinanceSummary {
  by_status: { status: string; count: number; total: number }[]
  total_tagihan: number
  total_dibayar: number
  piutang: number
  jatuh_tempo_count: number
}

export interface AgingInvoice {
  id_invoice: number
  nomor_invoice: string
  pelanggan: string
  site: string
  tgl_jatuh_tempo: string
  sisa: number
  umur_hari: number
  status: string
}

export interface FinanceAging {
  buckets: {
    belum_jatuh_tempo: number
    d1_30: number
    d31_60: number
    d61_90: number
    d90_plus: number
  }
  invoices: AgingInvoice[]
  total_piutang: number
}

export const useFinanceStore = defineStore('finance', () => {
  const invoices = ref<Invoice[]>([])
  const meta = ref<FinanceMeta>({ total: 0, page: 1, limit: 20, total_pages: 0 })
  const currentInvoice = ref<Invoice | null>(null)
  const summary = ref<FinanceSummary | null>(null)
  const aging = ref<FinanceAging | null>(null)
  const loading = ref(false)

  async function fetchAll(params: Record<string, any> = {}) {
    loading.value = true
    try {
      const r = await api.get('/finance/invoice', { params })
      invoices.value = r.data.data
      meta.value = r.data.meta
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: number) {
    loading.value = true
    try {
      const r = await api.get(`/finance/invoice/${id}`)
      currentInvoice.value = r.data.data
    } finally {
      loading.value = false
    }
  }

  async function create(payload: Record<string, any>) {
    const r = await api.post('/finance/invoice', payload)
    return r.data.data
  }

  async function update(id: number, payload: Record<string, any>) {
    const r = await api.patch(`/finance/invoice/${id}`, payload)
    if (currentInvoice.value?.id_invoice === id) currentInvoice.value = r.data.data
    return r.data.data
  }

  async function kirim(id: number) {
    const r = await api.post(`/finance/invoice/${id}/kirim`)
    if (currentInvoice.value?.id_invoice === id) currentInvoice.value = r.data.data
    return r.data.data
  }

  async function batal(id: number) {
    const r = await api.post(`/finance/invoice/${id}/batal`)
    if (currentInvoice.value?.id_invoice === id) currentInvoice.value = r.data.data
    return r.data.data
  }

  async function remove(id: number) {
    const r = await api.delete(`/finance/invoice/${id}`)
    return r.data.data
  }

  async function addPembayaran(id: number, payload: Record<string, any>) {
    const r = await api.post(`/finance/invoice/${id}/pembayaran`, payload)
    return r.data.data
  }

  async function removePembayaran(idPembayaran: number) {
    const r = await api.delete(`/finance/pembayaran/${idPembayaran}`)
    return r.data.data
  }

  async function generateBulk(payload: Record<string, any>) {
    const r = await api.post('/finance/invoice/generate-bulk', payload)
    return r.data.data
  }

  async function fetchSummary() {
    const r = await api.get('/finance/summary')
    summary.value = r.data.data
  }

  async function fetchAging() {
    const r = await api.get('/finance/aging')
    aging.value = r.data.data
  }

  return {
    invoices,
    meta,
    currentInvoice,
    summary,
    aging,
    loading,
    fetchAll,
    fetchOne,
    create,
    update,
    kirim,
    batal,
    remove,
    addPembayaran,
    removePembayaran,
    generateBulk,
    fetchSummary,
    fetchAging,
  }
})
