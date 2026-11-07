<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { fmtDateTime } from '@/composables/useFormat'
import { alertError, confirmDialog, promptDialog } from '@/composables/useDialog'
import { KELAS_SPH, KELAS_SURVEY } from './pb'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = computed(() => Number(route.params.id))
const s = ref<any>(null)
const memuat = ref(true)
const proses = ref(false)

async function muat() {
  memuat.value = true
  try {
    const { data } = await api.get(`/pasang-baru/survey/${id.value}`)
    s.value = data.data
  } catch (e) {
    alertError(e, 'Gagal memuat survey')
  } finally {
    memuat.value = false
  }
}
onMounted(muat)

const sales = computed(() => ['Sales', 'Director', 'Admin'].some((r) => auth.hasRole(r)))
const baru = computed(() => s.value?.status === 'Baru')

async function jalankan(fn: () => Promise<any>) {
  proses.value = true
  try { await fn(); await muat() } catch (e) { alertError(e) } finally { proses.value = false }
}
async function batal() {
  const catatan = await promptDialog({ title: 'Batalkan survey', label: 'Alasan (opsional)', confirmLabel: 'Batalkan', variant: 'danger' })
  if (catatan === null) return
  jalankan(() => api.post(`/pasang-baru/survey/${id.value}/batal`, { catatan: catatan || undefined }))
}
const aktifkan = () => jalankan(() => api.post(`/pasang-baru/survey/${id.value}/aktifkan`))
async function hapus() {
  if (!(await confirmDialog({ title: 'Hapus survey', message: `Hapus ${s.value.nomor_survey}?`, variant: 'danger', confirmLabel: 'Hapus' }))) return
  proses.value = true
  try {
    await api.delete(`/pasang-baru/survey/${id.value}`)
    router.push('/pasang-baru?tab=Survey')
  } catch (e) { alertError(e) } finally { proses.value = false }
}

const AKSI: Record<string, string> = {
  buat: 'Dibuat', ubah: 'Diubah', batal: 'Dibatalkan', aktifkan: 'Dibuka kembali', sph: 'Dilanjutkan ke SPH', sph_hapus: 'SPH dihapus',
}
</script>

<template>
  <div class="page">
    <p v-if="memuat && !s" class="muted">Memuat…</p>
    <template v-else-if="s">
      <div class="page-header">
        <div>
          <h2 class="page-title">{{ s.nomor_survey }} <span class="badge" :class="KELAS_SURVEY[s.status]">{{ s.status }}</span></h2>
          <p class="page-subtitle">{{ s.nama_perusahaan }} · {{ s.site.length }} site · Sales {{ s.sales || '-' }}</p>
        </div>
        <div class="sv-tombol">
          <button class="btn btn-ghost" @click="router.push('/pasang-baru?tab=Survey')">← Daftar</button>
          <template v-if="sales">
            <button v-if="!s.sph.length" class="btn btn-ghost" :disabled="proses" @click="hapus">Hapus</button>
            <template v-if="baru">
              <button class="btn btn-ghost" :disabled="proses" @click="batal">Batalkan</button>
              <button class="btn btn-ghost" :disabled="proses" @click="router.push(`/pasang-baru/survey/${s.id_survey}/ubah`)">✏️ Ubah</button>
            </template>
            <button v-if="s.status === 'Batal'" class="btn btn-ghost" :disabled="proses" @click="aktifkan">Buka kembali</button>
            <button v-if="s.status !== 'Batal'" class="btn btn-primary" :disabled="proses" @click="router.push(`/pasang-baru/sph/baru?survey=${s.id_survey}`)">
              📄 {{ s.sph.length ? 'Buat SPH lagi' : 'Lanjut ke SPH' }}
            </button>
          </template>
        </div>
      </div>

      <div v-if="s.sph.length" class="alert alert-success sv-sph">
        Sudah dibuat SPH:
        <a v-for="x in s.sph" :key="x.id_sph" href="#" @click.prevent="router.push(`/pasang-baru/sph/${x.id_sph}`)">
          <b>{{ x.nomor_sph }}</b> <span class="badge" :class="KELAS_SPH[x.status]">{{ x.status }}</span>
        </a>
      </div>

      <div class="grid-2 sv-info">
        <div class="detail-section">
          <div class="detail-section-header"><b>Perusahaan &amp; PIC</b></div>
          <div class="detail-section-body">
            <div class="info-row">
              <span class="info-label">Perusahaan</span>
              <span class="info-value">{{ s.nama_perusahaan }}
                <span v-if="s.pelanggan" class="badge badge-green">Pelanggan {{ s.pelanggan.kode_pelanggan }}</span>
                <span v-else class="badge badge-gray">Calon pelanggan</span>
              </span>
            </div>
            <div class="info-row"><span class="info-label">Nama PIC</span><span class="info-value">{{ s.nama_pic }}</span></div>
            <div class="info-row"><span class="info-label">Telp</span><span class="info-value">{{ s.telp_pic || '-' }}</span></div>
            <div class="info-row"><span class="info-label">Email</span><span class="info-value">{{ s.email_pic || '-' }}</span></div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-header"><b>Keterangan</b></div>
          <div class="detail-section-body">
            <div class="info-row"><span class="info-label">Dibuat</span><span class="info-value">{{ fmtDateTime(s.created_at) }}</span></div>
            <div class="info-row"><span class="info-label">Diperbarui</span><span class="info-value">{{ fmtDateTime(s.updated_at) }}</span></div>
            <div class="info-row"><span class="info-label">Catatan</span><span class="info-value sv-catatan">{{ s.catatan || '-' }}</span></div>
          </div>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead><tr><th>#</th><th>Nama site</th><th>Alamat</th><th>Lantai/Unit</th><th>Kota</th><th>Layanan</th></tr></thead>
          <tbody>
            <tr v-for="(o, i) in s.site" :key="o.id_survey_site">
              <td class="muted">{{ i + 1 }}</td>
              <td><b>{{ o.nama_site }}</b></td>
              <td>{{ o.alamat }}</td>
              <td>{{ o.lantai_unit || '-' }}</td>
              <td>{{ o.kota || '-' }}</td>
              <td>{{ o.layanan.nama_layanan }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="detail-section">
        <div class="detail-section-header"><b>Riwayat</b></div>
        <div class="detail-section-body">
          <p v-for="r in s.riwayat" :key="r.id_riwayat" class="sv-riwayat">
            <small class="muted">{{ fmtDateTime(r.created_at) }}</small> · <b>{{ AKSI[r.aksi] || r.aksi }}</b> oleh {{ r.oleh || '-' }}<template v-if="r.catatan"> — {{ r.catatan }}</template>
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sv-tombol { display: flex; gap: 6px; flex-wrap: wrap; }
.sv-info { margin: 12px 0; }
.sv-sph { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.sv-catatan { white-space: pre-wrap; }
.sv-riwayat { margin: 4px 0; font-size: 13px; }
.muted { color: var(--text-3); }
</style>
