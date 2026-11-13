import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/services/api'

export interface RingkasRuang { id_ruang: number; terakhir_id: number; belum: number; mention: number; bisu: boolean }
export interface Ringkasan {
  ruang: RingkasRuang[]; online: number[]; total_belum: number
  mengetik: { id_ruang: number; id_karyawan: number; nama: string }[]
}

/** Status chat global: lencana belum dibaca di sidebar, daftar online, "sedang mengetik" — lewat polling ringan. */
export const useChatStore = defineStore('chat', () => {
  const ringkasan = ref<Ringkasan | null>(null)
  const terputus = ref(false)
  const ruangDilihat = ref<number | null>(null) // ruang yang sedang terbuka di layar
  let cepat = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let jalan = false
  let urutan = 0

  const totalBelum = computed(() => ringkasan.value?.total_belum ?? 0)
  const online = computed(() => new Set(ringkasan.value?.online ?? []))

  function izinNotifikasi() {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted'
  }
  function beritahuBrowser(sebelum: Ringkasan | null, sesudah: Ringkasan) {
    if (!sebelum || !izinNotifikasi()) return
    for (const r of sesudah.ruang) {
      const lama = sebelum.ruang.find((x) => x.id_ruang === r.id_ruang)
      if (!lama || r.belum <= lama.belum) continue
      if (r.bisu && r.mention <= lama.mention) continue
      if (!document.hidden && ruangDilihat.value === r.id_ruang) continue
      try {
        const n = new Notification(r.mention > lama.mention ? 'Anda disebut di obrolan' : 'Pesan baru', { body: `${r.belum - lama.belum} pesan baru di obrolan`, tag: `chat-${r.id_ruang}` })
        n.onclick = () => { window.focus(); window.location.assign(`/chat/${r.id_ruang}`) }
      } catch { /* browser menolak */ }
    }
  }

  async function ambil() {
    const ke = ++urutan
    try {
      const { data } = await api.get('/chat/ringkasan', { senyap: true })
      if (ke !== urutan) return
      beritahuBrowser(ringkasan.value, data.data)
      ringkasan.value = data.data
      terputus.value = false
    } catch (e: any) {
      terputus.value = true
      if (e?.response?.status === 403) berhenti() // akun belum terhubung ke karyawan — jangan terus mengetuk
    }
  }
  function jadwal() {
    clearTimeout(timer)
    if (!jalan) return
    const ms = document.hidden ? 30_000 : cepat ? 3_000 : 10_000
    timer = setTimeout(async () => { await ambil(); jadwal() }, ms)
  }
  function ubahLayar() { if (jalan) { if (!document.hidden) ambil(); jadwal() } }

  function mulai() {
    if (jalan) return
    jalan = true
    document.addEventListener('visibilitychange', ubahLayar)
    ambil().then(jadwal)
  }
  function berhenti() {
    jalan = false
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', ubahLayar)
  }
  /** Halaman chat terbuka → polling lebih rapat */
  function setCepat(v: boolean) { cepat = v; jadwal() }
  async function segarkan() { await ambil() }

  return { ringkasan, terputus, ruangDilihat, totalBelum, online, mulai, berhenti, setCepat, segarkan }
})
