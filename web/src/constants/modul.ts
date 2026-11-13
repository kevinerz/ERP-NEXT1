// Daftar modul/menu yang bisa diatur per akun (Akses Modul).
// `induk` = modul besar yang otomatis ikut membukanya: akun yang sudah punya modul induk
// tetap bisa membuka menu ini (kompatibel dengan akun lama). Untuk membuka HANYA menu ini,
// beri kode menunya saja tanpa modul induk.
// Peta induk di backend: src/common/guards/modul-akses.guard.ts (MODUL_INDUK) — jaga tetap sama.
export interface InfoModul { key: string; label: string; icon: string; induk?: string }

export const DAFTAR_MODUL: InfoModul[] = [
  { key: 'hris',          label: 'HRIS',          icon: '👤' },
  { key: 'master',        label: 'Master Data',   icon: '📦' },
  { key: 'sales',         label: 'Sales',         icon: '💼' },
  { key: 'presales',      label: 'Pre-Sales',     icon: '🔍', induk: 'sales' },
  { key: 'pasang-baru',   label: 'Pasang Baru',   icon: '🆕' },
  { key: 'crm',           label: 'CRM',           icon: '🤝' },
  { key: 'projects',      label: 'Proyek',        icon: '📋' },
  { key: 'contracts',     label: 'Kontrak',       icon: '📄' },
  { key: 'operations',    label: 'Operasional (Gangguan, NOC Board)', icon: '🔧' },
  { key: 'visit',         label: 'Jadwal Visit',  icon: '🗓️', induk: 'operations' },
  { key: 'nocaas',        label: 'NOCaaS (Pembanding & Laporan Gangguan)', icon: '🛰️', induk: 'operations' },
  { key: 'ipam',          label: 'IP Publik',     icon: '🌐', induk: 'operations' },
  { key: 'network-tools', label: 'Network Tools', icon: '🛠️', induk: 'operations' },
  { key: 'mikrotik',      label: 'Remote Mikrotik', icon: '🔌', induk: 'operations' },
  { key: 'starsender',    label: 'StarSender WA', icon: '📨', induk: 'operations' },
  { key: 'instalasi',     label: 'Pemasangan',    icon: '🏗️' },
  { key: 'assets',        label: 'Aset',          icon: '🖥️' },
  { key: 'sim-topup',     label: 'SIM Topup',     icon: '📱', induk: 'assets' },
  { key: 'finance',       label: 'Finance',       icon: '💰' },
  { key: 'reports',       label: 'Laporan',       icon: '📈' },
  { key: 'public-wo',     label: 'Work Order',    icon: '🗂️' },
  { key: 'whatsapp',      label: 'WhatsApp',      icon: '💬' },
  { key: 'fileserver',    label: 'File Server',   icon: '🗃️' },
  { key: 'prtg',          label: 'PRTG',          icon: '📡' },
  { key: 'uptime-kuma',   label: 'Uptime Kuma',   icon: '🟢' },
  { key: 'mekari',        label: 'Mekari Jurnal', icon: '💳' },
  { key: 'notifications', label: 'Notifikasi',    icon: '🔔' },
]

export const INDUK_MODUL: Record<string, string> = Object.fromEntries(
  DAFTAR_MODUL.filter((m) => m.induk).map((m) => [m.key, m.induk as string]),
)

export const labelModul = (key: string) => DAFTAR_MODUL.find((m) => m.key === key)?.label ?? key
