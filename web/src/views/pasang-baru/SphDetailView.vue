<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { fmtDate, fmtDateTime, fmtRupiah } from '@/composables/useFormat'
import { alertError, confirmDialog, promptDialog } from '@/composables/useDialog'
import { printSphPasangBaru } from '@/composables/usePrint'
import { KELAS_SPH, KELAS_TAHAP } from './pb'

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
    const { data } = await api.get(`/pasang-baru/sph/${id.value}`)
    s.value = data.data
  } catch (e) {
    alertError(e, 'Gagal memuat SPH')
  } finally {
    memuat.value = false
  }
}
onMounted(muat)

const sales = computed(() => ['Sales', 'Director', 'Admin'].some((r) => auth.hasRole(r)))
const director = computed(() => ['Director', 'Admin'].some((r) => auth.hasRole(r)))
const bisaUbah = computed(() => sales.value && ['Draft', 'Ditolak'].includes(s.value?.status))
const totalBulanan = computed(() => (s.value?.order || []).reduce((a: number, o: any) => a + Number(o.biaya_bulanan), 0))
const totalInstalasi = computed(() => (s.value?.order || []).reduce((a: number, o: any) => a + Number(o.biaya_instalasi), 0))

async function jalankan(fn: () => Promise<any>) {
  proses.value = true
  try { await fn(); await muat() } catch (e) { alertError(e) } finally { proses.value = false }
}
async function ajukan() {
  if (!(await confirmDialog({ title: 'Ajukan ke Director', message: `Ajukan ${s.value.nomor_sph} (${s.value.order.length} site)?` }))) return
  jalankan(() => api.post(`/pasang-baru/sph/${id.value}/ajukan`))
}
async function setujui() {
  const catatan = await promptDialog({
    title: 'Setujui SPH', label: 'Catatan (opsional)', confirmLabel: 'Setujui',
    message: `${s.value.order.length} order pasang baru dan site berstatus Prospek akan dibuat.`,
  })
  if (catatan === null) return
  jalankan(() => api.post(`/pasang-baru/sph/${id.value}/putuskan`, { setuju: true, catatan: catatan || undefined }))
}
async function tolak() {
  const catatan = await promptDialog({ title: 'Tolak SPH', label: 'Alasan penolakan', confirmLabel: 'Tolak', variant: 'danger', validate: (v) => (v.trim() ? null : 'Alasan wajib diisi') })
  if (!catatan) return
  jalankan(() => api.post(`/pasang-baru/sph/${id.value}/putuskan`, { setuju: false, catatan }))
}
async function hapus() {
  if (!(await confirmDialog({ title: 'Hapus SPH', message: `Hapus ${s.value.nomor_sph}?`, variant: 'danger', confirmLabel: 'Hapus' }))) return
  proses.value = true
  try {
    await api.delete(`/pasang-baru/sph/${id.value}`)
    router.push('/pasang-baru')
  } catch (e) { alertError(e) } finally { proses.value = false }
}

const AKSI: Record<string, string> = { buat: 'Dibuat', ubah: 'Diubah', ajukan: 'Diajukan ke Director', setujui: 'Disetujui', tolak: 'Ditolak' }
</script>

<template>
  <div class="page">
    <p v-if="memuat && !s" class="muted">Memuat…</p>
    <template v-else-if="s">
      <div class="page-header">
        <div>
          <h2 class="page-title">{{ s.nomor_sph }} <span class="badge" :class="KELAS_SPH[s.status]">{{ s.status }}</span></h2>
          <p class="page-subtitle">{{ s.pelanggan.nama_pelanggan }} · {{ s.order.length }} site · {{ s.durasi_bulan }} bulan · Sales {{ s.sales || '-' }}</p>
        </div>
        <div class="sd-tombol">
          <button class="btn btn-ghost" @click="router.push('/pasang-baru')">← Daftar</button>
          <button class="btn btn-ghost" @click="printSphPasangBaru(s)">🖨 Cetak SPH</button>
          <template v-if="bisaUbah">
            <button class="btn btn-ghost" :disabled="proses" @click="hapus">Hapus</button>
            <button class="btn btn-ghost" :disabled="proses" @click="router.push(`/pasang-baru/sph/${s.id_sph}/ubah`)">✏️ Ubah</button>
            <button class="btn btn-primary" :disabled="proses" @click="ajukan">Ajukan ke Director</button>
          </template>
          <template v-if="director && s.status === 'Menunggu Director'">
            <button class="btn btn-danger" :disabled="proses" @click="tolak">Tolak</button>
            <button class="btn btn-success" :disabled="proses" @click="setujui">✓ Setujui</button>
          </template>
        </div>
      </div>

      <div v-if="s.status === 'Ditolak'" class="alert alert-danger">
        Ditolak oleh {{ s.approver || 'Director' }} ({{ fmtDateTime(s.tgl_approval) }}): {{ s.catatan_approval }}
      </div>
      <div v-else-if="s.status === 'Disetujui'" class="alert alert-success">
        Disetujui oleh {{ s.approver || 'Director' }} ({{ fmtDateTime(s.tgl_approval) }})<template v-if="s.catatan_approval">: {{ s.catatan_approval }}</template>.
        Langkah berikutnya: unggah FAB di tiap order lalu serahkan ke OPS.
      </div>
      <div v-else-if="s.status === 'Menunggu Director'" class="alert alert-warning">Menunggu persetujuan Director.</div>

      <div class="grid-2 sd-info">
        <div class="detail-section">
          <div class="detail-section-header"><b>Pelanggan</b></div>
          <div class="detail-section-body">
            <div class="info-row"><span class="info-label">Perusahaan</span><span class="info-value">{{ s.pelanggan.nama_pelanggan }} <small class="muted">{{ s.pelanggan.kode_pelanggan }}</small></span></div>
            <div class="info-row"><span class="info-label">PIC</span><span class="info-value">{{ s.nama_pic }}</span></div>
            <div class="info-row"><span class="info-label">Telp</span><span class="info-value">{{ s.telp_pic || '-' }}</span></div>
            <div class="info-row"><span class="info-label">Email</span><span class="info-value">{{ s.email_pic || '-' }}</span></div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-header"><b>Nilai</b></div>
          <div class="detail-section-body">
            <div class="info-row"><span class="info-label">Total bulanan</span><span class="info-value"><b>{{ fmtRupiah(totalBulanan) }}</b></span></div>
            <div class="info-row"><span class="info-label">Total instalasi</span><span class="info-value">{{ fmtRupiah(totalInstalasi) }}</span></div>
            <div class="info-row"><span class="info-label">Lama berlangganan</span><span class="info-value">{{ s.durasi_bulan }} bulan</span></div>
            <div v-if="s.catatan" class="info-row"><span class="info-label">Catatan</span><span class="info-value">{{ s.catatan }}</span></div>
          </div>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead><tr><th>#</th><th>Site</th><th>Layanan</th><th class="kanan">Bulanan</th><th class="kanan">Instalasi</th><th>RFS</th><th>PIC store</th><th>Order</th></tr></thead>
          <tbody>
            <tr v-for="(o, i) in s.order" :key="o.id_pb" :class="{ klik: o.nomor_pb }" @click="o.nomor_pb && router.push(`/pasang-baru/order/${o.id_pb}`)">
              <td class="muted">{{ i + 1 }}</td>
              <td><b>{{ o.nama_site }}</b><br /><small class="muted">{{ o.alamat }}<template v-if="o.lantai_unit"> — {{ o.lantai_unit }}</template><template v-if="o.kota">, {{ o.kota }}</template></small></td>
              <td>{{ o.layanan.nama_layanan }}</td>
              <td class="kanan">{{ fmtRupiah(o.biaya_bulanan) }}</td>
              <td class="kanan">{{ fmtRupiah(o.biaya_instalasi) }}</td>
              <td>{{ o.tgl_rfs ? fmtDate(o.tgl_rfs) : '-' }}</td>
              <td>{{ o.pic_store_nama || '-' }}<br /><small class="muted">{{ o.pic_store_hp }}</small></td>
              <td>
                <template v-if="o.nomor_pb"><b>{{ o.nomor_pb }}</b><br /><span class="badge" :class="KELAS_TAHAP[o.tahap]">{{ o.tahap }}</span></template>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="detail-section">
        <div class="detail-section-header"><b>Riwayat</b></div>
        <div class="detail-section-body">
          <p v-for="r in s.riwayat" :key="r.id_riwayat" class="sd-riwayat">
            <small class="muted">{{ fmtDateTime(r.created_at) }}</small> · <b>{{ AKSI[r.aksi] || r.aksi }}</b> oleh {{ r.oleh || '-' }}<template v-if="r.catatan"> — {{ r.catatan }}</template>
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sd-tombol { display: flex; gap: 6px; flex-wrap: wrap; }
.sd-info { margin: 12px 0; }
.sd-riwayat { margin: 4px 0; font-size: 13px; }
.klik { cursor: pointer; }
.kanan { text-align: right; }
.muted { color: var(--text-3); }
</style>
