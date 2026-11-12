import { ref } from 'vue'

/* ══════════════════════════════════════════════
   Bilah kemajuan global (garis tipis di atas layar)
   + status koneksi. Dipakai oleh router (pindah
   halaman) dan services/api (permintaan ke server).
   Dirender oleh <BilahKemajuan /> di App.vue.
   ══════════════════════════════════════════════ */

/** 0 = tersembunyi; 1–100 = lebar bilah (%) */
export const kemajuan = ref(0)
/** true saat peramban melapor offline atau permintaan terakhir gagal karena jaringan */
export const luring = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)

let aktif = 0
let tik: ReturnType<typeof setInterval> | null = null
let tundaMulai: ReturnType<typeof setTimeout> | null = null
let tundaSelesai: ReturnType<typeof setTimeout> | null = null

function jalan() {
  if (tundaSelesai) { clearTimeout(tundaSelesai); tundaSelesai = null }
  if (kemajuan.value === 0 || kemajuan.value === 100) kemajuan.value = 12
  if (tik) return
  // Melambat mendekati 90% — tidak pernah "selesai" sebelum pekerjaan benar-benar selesai
  tik = setInterval(() => {
    const sisa = 90 - kemajuan.value
    if (sisa > 0.5) kemajuan.value += sisa * 0.12
  }, 220)
}

/** Tandai satu pekerjaan dimulai. Bilah baru muncul bila pekerjaan lebih lama dari `tundaMs` (anti-kedip). */
export function mulaiKemajuan(tundaMs = 150) {
  aktif++
  if (aktif > 1 || tik) return
  if (tundaMs <= 0) return jalan()
  if (!tundaMulai) tundaMulai = setTimeout(() => { tundaMulai = null; if (aktif > 0) jalan() }, tundaMs)
}

/** Tandai satu pekerjaan selesai. */
export function selesaiKemajuan() {
  aktif = Math.max(0, aktif - 1)
  if (aktif > 0) return
  if (tundaMulai) { clearTimeout(tundaMulai); tundaMulai = null }
  if (tik) { clearInterval(tik); tik = null }
  if (kemajuan.value === 0) return
  kemajuan.value = 100
  tundaSelesai = setTimeout(() => { kemajuan.value = 0; tundaSelesai = null }, 260)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (luring.value = false))
  window.addEventListener('offline', () => (luring.value = true))
}
