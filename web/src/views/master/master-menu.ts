// Daftar menu Master Data — dipakai halaman Pusat Master Data & bilah navigasi di tiap halaman master
import { ref } from 'vue'
import api from '@/services/api'

export const MENU_MASTER = [
  { kunci: 'pelanggan', label: 'Pelanggan', ikon: '👥', to: '/master/pelanggan', warna: '#7c3aed', grup: 'Pelanggan', desc: 'Perusahaan / klien & grup holding' },
  { kunci: 'site', label: 'Site', ikon: '📍', to: '/master/site', warna: '#ea580c', grup: 'Pelanggan', desc: 'Lokasi pemasangan tiap pelanggan' },
  { kunci: 'layanan', label: 'Layanan', ikon: '🌐', to: '/master/layanan', warna: '#2563eb', grup: 'Jaringan', desc: 'Paket FO, M2M, Starlink, dll' },
  { kunci: 'vendor', label: 'Vendor ISP', ikon: '🏢', to: '/master/vendor', warna: '#16a34a', grup: 'Jaringan', desc: 'ISP, vendor perangkat & mitra' },
  { kunci: 'teknisi', label: 'Teknisi Mitra', ikon: '🧰', to: '/master/kontak-teknisi', warna: '#c2410c', grup: 'Operasional', desc: 'Teknisi pihak ketiga & rekening' },
  { kunci: 'gudang', label: 'Gudang', ikon: '🏬', to: '/master/gudang', warna: '#0369a1', grup: 'Operasional', desc: 'Lokasi gudang & stok aset' },
  { kunci: 'gangguan', label: 'Jenis Gangguan', ikon: '⚡', to: '/master/jenis-gangguan', warna: '#dc2626', grup: 'Operasional', desc: 'Kategori penyebab gangguan tiket' },
] as const

export interface Ringkasan {
  jumlah: { pelanggan: number; grup: number; site_aktif: number; site_dismantle: number; site_lain: number; layanan: number; vendor: number; teknisi: number; gudang: number; gangguan: number }
  site_terbaru: { id_site: number; kode_site: string; nama_site: string; status_site: string; updated_at: string; pelanggan: string }[]
}

// Disimpan di modul supaya bilah navigasi tidak memuat ulang di tiap pindah halaman
export const ringkasan = ref<Ringkasan | null>(null)
let terakhir = 0
export async function muatRingkasan(paksa = false) {
  if (!paksa && ringkasan.value && Date.now() - terakhir < 60_000) return ringkasan.value
  try {
    const { data } = await api.get('/master/ringkasan')
    ringkasan.value = data.data
    terakhir = Date.now()
  } catch { /* opsional */ }
  return ringkasan.value
}
export function jumlahMenu(kunci: string) {
  const j = ringkasan.value?.jumlah
  if (!j) return null
  return ({ pelanggan: j.pelanggan, site: j.site_aktif, layanan: j.layanan, vendor: j.vendor, teknisi: j.teknisi, gudang: j.gudang, gangguan: j.gangguan } as Record<string, number>)[kunci] ?? null
}
