<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import RuangRapat from './RuangRapat.vue'

// Halaman tamu rapat (tanpa login ERP) — /rapat/tamu/:kode
const route = useRoute()
const kode = String(route.params.kode || '')
const info = ref<{ judul: string; jadwal_at: string | null; status: string; pembuat: string } | null>(null)
const error = ref('')
const pesan = ref('')
const nama = ref('')
const instansi = ref('')
const pakaiMic = ref(true)
const pakaiKamera = ref(true)
const menyambung = ref(false)
const sesi = ref<{ url: string; token: string; judul: string } | null>(null)

const simpanLokal = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* abaikan */ } }
const bacaLokal = (k: string) => { try { return localStorage.getItem(k) || '' } catch { return '' } }

onMounted(async () => {
  document.title = 'Rapat — NEXT1'
  nama.value = bacaLokal('rapat_tamu_nama')
  instansi.value = bacaLokal('rapat_tamu_instansi')
  try {
    const { data } = await axios.get(`/api/meeting/tamu/${encodeURIComponent(kode)}`)
    info.value = data.data
    document.title = `${data.data.judul} — Rapat NEXT1`
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Link rapat tidak berlaku'
  }
})

async function masuk() {
  if (nama.value.trim().length < 2 || menyambung.value) return
  menyambung.value = true
  pesan.value = ''
  try {
    const { data } = await axios.post(`/api/meeting/tamu/${encodeURIComponent(kode)}/masuk`, { nama: nama.value.trim(), instansi: instansi.value.trim() || undefined })
    simpanLokal('rapat_tamu_nama', nama.value.trim())
    simpanLokal('rapat_tamu_instansi', instansi.value.trim())
    sesi.value = data.data
  } catch (e: any) {
    const m = e?.response?.data?.message
    pesan.value = Array.isArray(m) ? m.join(', ') : m || 'Gagal masuk rapat'
  } finally {
    menyambung.value = false
  }
}
function selesai(p: string) {
  sesi.value = null
  pesan.value = p || 'Anda telah keluar dari rapat.'
}
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '')
</script>

<template>
  <RuangRapat v-if="sesi" :url="sesi.url" :token="sesi.token" :judul="sesi.judul" :moderator="false" :mic="pakaiMic" :kamera="pakaiKamera" @selesai="selesai" />

  <div v-else class="tm">
    <div class="tm-kartu">
      <div class="tm-merek">📹 Rapat NEXT1</div>
      <template v-if="error">
        <h2>Link tidak berlaku</h2>
        <p class="tm-redup">{{ error }}. Minta link baru kepada pengundang.</p>
      </template>
      <template v-else-if="info">
        <h2>{{ info.judul }}</h2>
        <p class="tm-redup">Diundang oleh {{ info.pembuat }}<template v-if="info.jadwal_at"> · {{ fmt(info.jadwal_at) }}</template></p>
        <p v-if="info.status === 'Berlangsung'" class="tm-hidup">● Rapat sedang berlangsung</p>
        <form class="tm-form" @submit.prevent="masuk">
          <label>Nama Anda</label>
          <input v-model="nama" maxlength="100" placeholder="Nama lengkap" autofocus />
          <label>Instansi / perusahaan <small>(opsional)</small></label>
          <input v-model="instansi" maxlength="100" placeholder="mis. PT Contoh Jaya" />
          <div class="tm-cek">
            <label><input v-model="pakaiMic" type="checkbox" /> 🎙️ Mikrofon</label>
            <label><input v-model="pakaiKamera" type="checkbox" /> 📷 Kamera</label>
          </div>
          <p v-if="pesan" class="tm-pesan">{{ pesan }}</p>
          <button type="submit" :disabled="nama.trim().length < 2 || menyambung">{{ menyambung ? 'Menyambungkan…' : 'Masuk rapat' }}</button>
        </form>
        <p class="tm-redup kecil">Browser akan meminta izin kamera & mikrofon. Gunakan Chrome, Edge, atau Safari terbaru — tanpa instal aplikasi.</p>
      </template>
      <p v-else class="tm-redup">Memuat…</p>
    </div>
  </div>
</template>

<style scoped>
.tm { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: #0b1220; color: #e2e8f0; box-sizing: border-box; }
.tm-kartu { width: 100%; max-width: 420px; padding: 28px; border-radius: 16px; background: #111a2e; border: 1px solid #1e293b; }
.tm-merek { font-size: 13px; color: #94a3b8; margin-bottom: 10px; }
h2 { margin: 0 0 6px; font-size: 20px; }
.tm-redup { color: #94a3b8; font-size: 13.5px; margin: 0 0 10px; }
.kecil { font-size: 12px; margin-top: 14px; }
.tm-hidup { color: #4ade80; font-size: 13px; margin: 0 0 10px; }
.tm-form { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.tm-form label { font-size: 12.5px; color: #cbd5e1; margin-top: 6px; }
.tm-form small { color: #64748b; }
.tm-form input:not([type='checkbox']) { padding: 10px 12px; border-radius: 10px; border: 1px solid #334155; background: #0b1220; color: #e2e8f0; font-size: 15px; }
.tm-cek { display: flex; gap: 16px; margin-top: 8px; }
.tm-cek label { display: flex; gap: 6px; align-items: center; font-size: 14px; margin: 0; }
.tm-pesan { color: #fbbf24; font-size: 13px; margin: 6px 0 0; }
button { margin-top: 12px; padding: 12px; border: none; border-radius: 10px; background: #16a34a; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
</style>
