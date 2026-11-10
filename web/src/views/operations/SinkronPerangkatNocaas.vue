<script setup lang="ts">
// Sinkron massal identitas router (merk, tipe, SN, MAC, IP tunnel) dari NOCaaS ke perangkat semua site terpetakan.
// Hanya mengisi kolom KOSONG — data ERP yang sudah ada tidak pernah ditimpa. Khusus Admin / Director / Manager Ops.
import { ref } from 'vue'
import api from '@/services/api'
import { confirmDialog, toast } from '@/composables/useDialog'

const buka = ref(false)
const memuat = ref(false)
const pratinjau = ref<any>(null)
const hasil = ref<any>(null)

async function hitung() {
  buka.value = true; memuat.value = true; hasil.value = null
  try { pratinjau.value = (await api.get('/nocaas/sinkron-perangkat')).data.data }
  catch (e: any) { toast(e.response?.data?.message || 'Gagal menghitung', 'danger'); buka.value = false }
  finally { memuat.value = false }
}
async function jalankan() {
  const p = pratinjau.value
  if (!(await confirmDialog({
    title: `Isi data perangkat ${p.site} site?`,
    message: `${p.isi_kolom} kolom kosong akan diisi dari NOCaaS${p.buat_perangkat ? `, ${p.buat_perangkat} perangkat router baru dibuat` : ''}. Data yang sudah ada tidak diubah, dan salinan cadangan disimpan dulu.`,
    confirmLabel: 'Jalankan sinkron',
  }))) return
  memuat.value = true
  try {
    const r = await api.post('/nocaas/sinkron-perangkat')
    hasil.value = r.data.data
    toast(r.data.message)
    pratinjau.value = null
  } catch (e: any) { toast(e.response?.data?.message || 'Sinkron gagal', 'danger') }
  finally { memuat.value = false }
}
</script>

<template>
  <div class="spn">
    <button v-if="!buka" type="button" class="btn btn-ghost" @click="hitung">🔄 Sinkron data perangkat ke site</button>
    <div v-else class="spn-kartu">
      <div class="spn-judul">🔄 Sinkron data perangkat dari NOCaaS <button type="button" class="spn-x" aria-label="Tutup" @click="buka = false">✕</button></div>
      <div v-if="memuat" class="spn-redup">Menghitung / menjalankan…</div>
      <template v-else-if="hasil">
        <p>✅ <b>{{ hasil.site }}</b> site diperbarui · {{ hasil.isi_kolom }} kolom terisi · {{ hasil.buat_perangkat }} perangkat baru.</p>
        <small class="spn-redup">Cadangan: <code>{{ hasil.cadangan }}</code></small>
      </template>
      <template v-else-if="pratinjau">
        <p v-if="!pratinjau.site">👍 Semua perangkat site terpetakan sudah lengkap — tidak ada kolom kosong yang bisa diisi.</p>
        <template v-else>
          <p><b>{{ pratinjau.site }}</b> site akan diperbarui — <b>{{ pratinjau.isi_kolom }}</b> kolom kosong diisi<template v-if="pratinjau.buat_perangkat">, <b>{{ pratinjau.buat_perangkat }}</b> perangkat router baru</template>.</p>
          <ul class="spn-kolom">
            <li v-for="k in pratinjau.per_kolom" :key="k.kolom">{{ k.label }} <b>{{ k.n.toLocaleString('id-ID') }}</b></li>
          </ul>
          <small class="spn-redup">{{ pratinjau.beda_dilewati }} nilai yang berbeda dengan NOCaaS dibiarkan (tinjau per site di tab NOCaaS halaman site).</small>
          <div class="spn-aksi"><button type="button" class="btn btn-primary" @click="jalankan">Jalankan sinkron</button></div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.spn-kartu { padding: 14px 16px; border-radius: 14px; border: 1.5px dashed #93c5fd; background: #f8fbff; max-width: 560px; }
.spn-judul { display: flex; justify-content: space-between; font-weight: 800; margin-bottom: 8px; }
.spn-x { border: 0; background: none; cursor: pointer; color: #64748b; }
.spn-kartu p { margin: 6px 0; font-size: 13.5px; }
.spn-kolom { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 8px 0; }
.spn-kolom li { padding: 3px 10px; border-radius: 99px; background: #e8f1fd; color: #1c4f9c; font-size: 12.5px; }
.spn-redup { color: #64748b; font-size: 12px; }
.spn-aksi { margin-top: 10px; }
</style>
