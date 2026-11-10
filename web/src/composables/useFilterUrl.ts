// Simpan filter / pencarian / halaman daftar di URL (?q=…&status=…&page=…).
// Dengan begitu tombol Kembali dari halaman detail mengembalikan daftar persis seperti sebelumnya,
// dan tautan daftar yang sudah tersaring bisa dibagikan.
//
// Pemakaian (di <script setup>, SEBELUM fetch pertama):
//   useFilterUrl({ q: search, status: filterStatus, page })
// Nilai awal ref diambil dari URL; setiap perubahan ditulis balik dengan router.replace
// (tidak menambah riwayat). Nilai kosong / sama dengan nilai awal tidak ditulis.
import { watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type Nilai = string | number | boolean | null | undefined

export function useFilterUrl(peta: Record<string, Ref<any>>) {
  const route = useRoute()
  const router = useRouter()
  const bawaan: Record<string, Nilai> = {}

  for (const [kunci, r] of Object.entries(peta)) {
    bawaan[kunci] = r.value
    const q = route.query[kunci]
    if (q === undefined || q === null || Array.isArray(q)) continue
    const awal = r.value
    r.value = typeof awal === 'number' ? (Number(q) || awal) : typeof awal === 'boolean' ? q === '1' : q
  }

  watch(Object.values(peta), () => {
    const query: Record<string, string> = {}
    // Pertahankan query lain yang bukan milik filter ini (mis. ?tab=)
    for (const [k, v] of Object.entries(route.query)) if (!(k in peta) && typeof v === 'string') query[k] = v
    for (const [kunci, r] of Object.entries(peta)) {
      const v = r.value as Nilai
      if (v === '' || v === null || v === undefined || v === bawaan[kunci]) continue
      query[kunci] = typeof v === 'boolean' ? (v ? '1' : '0') : String(v)
    }
    router.replace({ query }).catch(() => {})
  })
}
