// Palet grafik dashboard — palet kategori tervalidasi (lolos uji buta warna untuk pasangan bersebelahan).
// Urutan slot = mekanisme keamanan warna: pakai berurutan, jangan diacak.
// Tiga slot (aqua, kuning, magenta) kontrasnya < 3:1 di latar putih → selalu sertakan label angka / legenda.
export const SERI = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

// Warna status (khusus keadaan — bukan untuk seri biasa), selalu dipasangkan dengan label
export const STATUS = { baik: '#0ca30c', waspada: '#fab219', serius: '#ec835a', kritis: '#d03b3b' }

// Ramp biru berurutan untuk tahapan (funnel): mulai dari langkah 250 supaya tetap terlihat di latar terang
export const RAMP_BIRU = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95']

export const TINTA = { utama: '#0b0b0b', kedua: '#52514e', redup: '#898781', grid: '#e1e0d9', sumbu: '#c3c2b7' }

/** Animasi dimatikan bila pengguna memilih "kurangi gerakan" di sistem operasinya */
export const kurangiGerak = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const fmtAngka = (n: number) => n.toLocaleString('id-ID')
