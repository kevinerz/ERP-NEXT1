<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsetStore } from '@/stores/aset'
import { fmtDateTime } from '@/composables/useFormat'

const route = useRoute()
const router = useRouter()
const aset = useAsetStore()

const id = Number(route.params.id)
const scanInput = ref('')
const scanMsg = ref('')
const scanIsError = ref(false)
const scanning = ref(false)
const finishing = ref(false)

onMounted(load)
async function load() { await aset.fetchOpnameOne(id) }

const o = computed(() => aset.opnameCurrent)
const items = computed(() => o.value?.items || [])
const snapshotItems = computed(() => items.value.filter((i) => !i.tidak_terdaftar))
const anomaliItems = computed(() => items.value.filter((i) => i.tidak_terdaftar))
const ditemukanCount = computed(() => snapshotItems.value.filter((i) => i.ditemukan).length)
const belumCount = computed(() => snapshotItems.value.length - ditemukanCount.value)
const isBerjalan = computed(() => o.value?.status_opname === 'Berjalan')

async function handleScan() {
  const kode = scanInput.value.trim()
  if (!kode) return
  scanning.value = true; scanMsg.value = ''; scanIsError.value = false
  try {
    const r = await aset.scanOpname(id, { kode_aset: kode })
    scanMsg.value = r.message
    scanIsError.value = !!r.anomali
    scanInput.value = ''
    await load()
  } catch (e: any) {
    scanMsg.value = e.response?.data?.message || 'Gagal mencatat scan'
    scanIsError.value = true
  } finally { scanning.value = false }
}

async function toggleManual(item: any) {
  try {
    await aset.toggleOpnameItem(item.id_item, !item.ditemukan)
    await load()
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal update item') }
}

async function selesaikan() {
  if (!confirm(`Selesaikan sesi opname ini? ${belumCount.value} aset belum ditemukan akan tercatat sebagai selisih/hilang.`)) return
  finishing.value = true
  try {
    await aset.selesaikanOpname(id)
    await load()
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal menyelesaikan opname') }
  finally { finishing.value = false }
}

async function batalkan() {
  if (!confirm('Batalkan sesi opname ini? Semua progres akan dihapus.')) return
  try {
    await aset.removeOpname(id)
    router.push('/assets/stok-opname')
  } catch (e: any) { alert(e.response?.data?.message || 'Gagal membatalkan opname') }
}
</script>

<template>
  <div class="page" v-if="o">
    <div class="page-header">
      <div>
        <div class="breadcrumb"><span @click="router.push('/assets/stok-opname')">Stok Opname</span> › #{{ o.id_opname }}</div>
        <h2>{{ o.gudang?.nama_gudang }}</h2>
        <span class="status-badge" :class="o.status_opname === 'Selesai' ? 'st-selesai' : 'st-berjalan'">{{ o.status_opname }}</span>
      </div>
      <div class="actions" v-if="isBerjalan">
        <button class="btn-secondary" @click="batalkan">Batalkan</button>
        <button class="btn-primary" @click="selesaikan" :disabled="finishing">
          {{ finishing ? 'Menyelesaikan...' : 'Selesaikan Opname' }}
        </button>
      </div>
    </div>

    <div class="summary-row">
      <div class="summary-chip sc-total"><div class="sc-count">{{ snapshotItems.length }}</div><div class="sc-label">Total Aset</div></div>
      <div class="summary-chip sc-ok"><div class="sc-count">{{ ditemukanCount }}</div><div class="sc-label">Ditemukan</div></div>
      <div class="summary-chip sc-missing"><div class="sc-count">{{ belumCount }}</div><div class="sc-label">Belum / Hilang</div></div>
      <div class="summary-chip sc-anomali" v-if="anomaliItems.length"><div class="sc-count">{{ anomaliItems.length }}</div><div class="sc-label">Anomali</div></div>
    </div>

    <div v-if="isBerjalan" class="scan-box">
      <label>Scan / Ketik Kode Aset</label>
      <div class="scan-input-row">
        <input v-model="scanInput" @keyup.enter="handleScan" placeholder="AST-202607-0042" autofocus :disabled="scanning" />
        <button class="btn-scan" @click="handleScan" :disabled="scanning || !scanInput.trim()">Tandai Ditemukan</button>
      </div>
      <p v-if="scanMsg" :class="['scan-msg', scanIsError ? 'scan-err' : 'scan-ok']">{{ scanMsg }}</p>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th>Kode Aset</th>
            <th>Perangkat</th>
            <th>Status</th>
            <th>Waktu Scan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in snapshotItems" :key="it.id_item" :class="{ 'row-found': it.ditemukan }">
            <td class="center">
              <input type="checkbox" :checked="it.ditemukan" :disabled="!isBerjalan" @change="toggleManual(it)" />
            </td>
            <td class="kode">{{ it.aset?.kode_aset }}</td>
            <td>
              <div class="fw600">{{ it.aset?.nama_perangkat }}</div>
              <div class="text-gray text-sm">{{ it.aset?.merk }} {{ it.aset?.tipe_model }}</div>
            </td>
            <td>
              <span class="status-badge" :class="it.ditemukan ? 'st-selesai' : 'st-hilang'">
                {{ it.ditemukan ? 'Ditemukan' : (o.status_opname === 'Selesai' ? 'Hilang' : 'Belum') }}
              </span>
            </td>
            <td class="text-sm">{{ it.waktu_scan ? fmtDateTime(it.waktu_scan) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="table-card anomali-card" v-if="anomaliItems.length">
      <div class="anomali-header">⚠️ Aset Ditemukan Tapi Tidak Terdaftar di Gudang Ini</div>
      <table>
        <thead>
          <tr><th>Kode Aset</th><th>Perangkat</th><th>Waktu Scan</th></tr>
        </thead>
        <tbody>
          <tr v-for="it in anomaliItems" :key="it.id_item">
            <td class="kode">{{ it.aset?.kode_aset }}</td>
            <td>{{ it.aset?.nama_perangkat }}</td>
            <td class="text-sm">{{ fmtDateTime(it.waktu_scan!) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else-if="aset.loading" class="page"><p>Memuat...</p></div>
  <div v-else class="page"><p>Sesi opname tidak ditemukan.</p></div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1000px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.breadcrumb { font-size: 12px; color: #94a3b8; margin-bottom: 4px; cursor: pointer; }
.breadcrumb span:hover { text-decoration: underline; }
.page-header h2 { margin: 0 0 6px; font-size: 22px; color: #0f172a; }
.actions { display: flex; gap: 10px; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { padding: 10px 18px; background: #fff; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.st-berjalan { background: #fef9c3; color: #a16207; }
.st-selesai { background: #f0fdf4; color: #15803d; }
.st-hilang { background: #fef2f2; color: #dc2626; }

.summary-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
.summary-chip { background: #fff; border-radius: 8px; padding: 12px 18px; border-left: 4px solid #94a3b8; box-shadow: 0 1px 3px rgba(0,0,0,0.07); min-width: 110px; }
.sc-count { font-size: 22px; font-weight: 800; color: #0f172a; }
.sc-label { font-size: 11px; color: #64748b; }
.sc-total { border-left-color: #64748b; }
.sc-ok { border-left-color: #15803d; }
.sc-missing { border-left-color: #dc2626; }
.sc-anomali { border-left-color: #d97706; }

.scan-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px; }
.scan-box label { display: block; font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 8px; }
.scan-input-row { display: flex; gap: 10px; }
.scan-input-row input { flex: 1; padding: 10px 14px; border: 1.5px solid #bfdbfe; border-radius: 8px; font-size: 15px; outline: none; font-family: monospace; }
.scan-input-row input:focus { border-color: #3b82f6; }
.btn-scan { padding: 10px 20px; background: #1e40af; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-scan:disabled { opacity: 0.5; cursor: not-allowed; }
.scan-msg { margin: 10px 0 0; font-size: 13px; font-weight: 600; }
.scan-ok { color: #15803d; }
.scan-err { color: #d97706; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 12px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; vertical-align: top; }
.center { text-align: center; }
.kode { font-weight: 700; color: #1d4ed8; font-size: 13px; white-space: nowrap; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.row-found td { background: #f0fdf4; }
.anomali-card .anomali-header { padding: 12px 16px; background: #fffbeb; color: #92400e; font-weight: 600; font-size: 13px; }
</style>
