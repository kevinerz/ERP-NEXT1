<script setup lang="ts">
// Tahap Network: akun VPN NOCaaS (NS & UN) + device PRTG dari template — dibuat lewat tombol
import { computed, onMounted, ref } from 'vue'
import api from '@/services/api'
import { fmtDateTime } from '@/composables/useFormat'
import { alertDialog, alertError, confirmDialog, pesanGalat, promptDialog, toast, toastGalat } from '@/composables/useDialog'

const props = defineProps<{ idPb: number; bisaUbah: boolean }>()
const emit = defineEmits<{ (e: 'berubah'): void }>()

const s = ref<any>(null)
const nama = ref('')
const grup = ref<any[]>([])
const idGrup = ref<number | null>(null)
const cariGrup = ref('')
const proses = ref(false)
const error = ref('')
const tersalin = ref(false)
const memuatGrupNya = ref(false)

async function muat() {
  try {
    const r = await api.get(`/pasang-baru/order/${props.idPb}/vpn`)
    s.value = r.data.data
    if (!nama.value) nama.value = s.value.nama
    error.value = ''
  } catch (e: any) {
    // Muat awal gagal → pesan + Coba lagi; muat ulang setelah aksi gagal → jangan sembunyikan panel yang sudah tampil
    if (!s.value) error.value = pesanGalat(e, 'Gagal memuat status VPN')
    else toastGalat(e, 'Gagal memuat ulang status VPN')
  }
}
onMounted(muat)

const perluPrtg = computed(() => s.value?.vpn && ((s.value.vpn.ns && !s.value.prtg.ns) || (s.value.vpn.un && !s.value.prtg.un)))
const vpnLengkap = computed(() => s.value?.vpn?.ns && s.value?.vpn?.un)

async function buatVpn() {
  const n = nama.value.trim()
  if (proses.value || n.length < 3) return
  // Dikunci sejak konfirmasi dibuka supaya klik ganda tidak membuat akun VPN dua kali
  proses.value = true
  if (!(await confirmDialog({ title: 'Buat akun VPN di NOCaaS?', message: `Akun NS-${n.toUpperCase()} dan UN-${n.toUpperCase()} akan dibuat sungguhan di NOCaaS dengan IP tunnel berikutnya.`, confirmLabel: 'Buat VPN', variant: 'warning' }))) { proses.value = false; return }
  try {
    const r = await api.post(`/pasang-baru/order/${props.idPb}/vpn`, { nama: n })
    s.value = r.data.data ?? s.value
    await alertDialog({ title: 'VPN', message: r.data.message })
    emit('berubah')
    await muatGrup()
  } catch (e) { alertError(e) } finally { proses.value = false; await muat() }
}

async function muatGrup() {
  if (grup.value.length || !props.bisaUbah || memuatGrupNya.value) return
  memuatGrupNya.value = true
  try {
    const r = await api.get(`/pasang-baru/order/${props.idPb}/prtg-grup`)
    grup.value = r.data.data
    if (!idGrup.value && grup.value[0]?.skor > 0) idGrup.value = grup.value[0].objid
    if (!grup.value.length) toast('Tidak ada grup di PRTG', 'warning')
  } catch (e) { alertError(e, 'Gagal memuat grup PRTG') } finally { memuatGrupNya.value = false }
}
const grupTersaring = computed(() => {
  const k = cariGrup.value.trim().toLowerCase()
  const g = k ? grup.value.filter((x) => x.name.toLowerCase().includes(k)) : grup.value
  return g.slice(0, 200)
})

async function aturTemplate() {
  const v = await promptDialog({ title: 'Device template PRTG', message: 'Objid device PRTG yang sensornya disalin untuk site baru (Ping, CPU Load, traffic ether). Lihat angka id= di URL device PRTG.', label: 'Objid device', defaultValue: s.value?.template?.objid ? String(s.value.template.objid) : '', inputType: 'number', validate: (x) => (Number(x) > 0 && Number.isInteger(Number(x)) ? null : 'Isi objid berupa angka bulat positif') })
  if (!v || proses.value) return
  proses.value = true
  try {
    const r = await api.put('/pasang-baru/prtg-template', { objid: Number(v) })
    await alertDialog({ title: 'Template PRTG', message: r.data.message })
    await muat()
  } catch (e) { alertError(e) } finally { proses.value = false }
}

async function buatPrtg() {
  const g = grup.value.find((x) => x.objid === idGrup.value)
  if (!g || proses.value) return
  // Dikunci sejak konfirmasi dibuka supaya klik ganda tidak membuat device PRTG dua kali
  proses.value = true
  if (!(await confirmDialog({ title: 'Buat device di PRTG?', message: `Device "${s.value.template?.name}" disalin sungguhan ke grup ${g.name} untuk jalur yang belum ada (NS/UN), dengan host IP tunnel VPN.`, confirmLabel: 'Buat di PRTG', variant: 'warning' }))) { proses.value = false; return }
  try {
    const r = await api.post(`/pasang-baru/order/${props.idPb}/prtg`, { id_grup: g.objid })
    s.value = r.data.data ?? s.value
    await alertDialog({ title: 'PRTG', message: r.data.message })
    emit('berubah')
  } catch (e) { alertError(e) } finally { proses.value = false; await muat() }
}

async function salin() {
  if (!s.value?.vpn?.script) return
  try { await navigator.clipboard.writeText(s.value.vpn.script); tersalin.value = true; setTimeout(() => (tersalin.value = false), 2000) } catch { toast('Gagal menyalin — blok teks script lalu salin manual', 'warning') }
}
</script>

<template>
  <div class="detail-section">
    <div class="detail-section-header op-head">
      <b>VPN NOCaaS &amp; PRTG</b>
      <small v-if="s?.vpn" class="muted">VPN dibuat {{ fmtDateTime(s.vpn.at) }}</small>
    </div>
    <div class="detail-section-body">
      <div v-if="error" class="alert alert-danger" role="alert">
        {{ error }}
        <button type="button" class="btn btn-sm btn-ghost" @click="error = ''; muat()">↻ Coba lagi</button>
      </div>
      <template v-else-if="s">

        <!-- Langkah A: akun VPN -->
        <div class="vp-langkah">
          <div class="vp-judul"><span class="vp-no" :class="{ ok: vpnLengkap }">{{ vpnLengkap ? '✓' : 'A' }}</span> Akun VPN (L2TP) di NOCaaS</div>
          <div v-if="s.vpn" class="vp-jalur">
            <div v-for="j in (['ns', 'un'] as const)" :key="j" class="vp-chip" :class="{ kosong: !s.vpn[j] }">
              <b>{{ j.toUpperCase() }}</b>
              <template v-if="s.vpn[j]">{{ s.vpn[j].user }} · <code>{{ s.vpn[j].ip }}</code></template>
              <template v-else>belum dibuat</template>
            </div>
          </div>
          <div v-if="bisaUbah && !vpnLengkap" class="vp-form">
            <label class="form-label">Nama akun <small class="muted">(jadi NS-… &amp; UN-…)</small></label>
            <div class="vp-baris">
              <span class="vp-prefix">NS-/UN-</span>
              <input v-model="nama" class="form-input" maxlength="60" :disabled="!!s.vpn" />
              <button type="button" class="btn btn-primary" :class="{ 'is-loading': proses }" :disabled="proses || nama.trim().length < 3" @click="buatVpn">{{ s.vpn ? 'Coba jalur yang gagal' : 'Buat VPN' }}</button>
            </div>
            <small v-if="s.ip_berikut?.ns" class="muted">IP berikutnya: NS {{ s.ip_berikut.ns.remote_ip }} ({{ s.ip_berikut.ns.free_count }} sisa di subnet) · UN {{ s.ip_berikut.un.remote_ip }} ({{ s.ip_berikut.un.free_count }} sisa)</small>
            <small v-else-if="s.ip_berikut?.error" class="merah">NOCaaS: {{ s.ip_berikut.error }}</small>
          </div>
          <div v-if="s.vpn?.script" class="vp-script">
            <div class="vp-script-head"><span>Script Mikrotik (paste di terminal)</span><button type="button" class="btn btn-sm btn-ghost" @click="salin">{{ tersalin ? '✓ Tersalin' : '📋 Salin' }}</button></div>
            <pre>{{ s.vpn.script }}</pre>
          </div>
        </div>

        <!-- Langkah B: PRTG -->
        <div class="vp-langkah">
          <div class="vp-judul"><span class="vp-no" :class="{ ok: s.prtg.ns && s.prtg.un }">{{ s.prtg.ns && s.prtg.un ? '✓' : 'B' }}</span> Device PRTG (satu per jalur)</div>
          <div class="vp-jalur">
            <div v-for="j in (['ns', 'un'] as const)" :key="j" class="vp-chip" :class="{ kosong: !s.prtg[j] }">
              <b>{{ j.toUpperCase() }}</b>
              <template v-if="s.prtg[j]">device #{{ s.prtg[j] }}</template>
              <template v-else>belum ada</template>
            </div>
          </div>
          <p class="muted vp-ket">
            Template:
            <template v-if="s.template?.ada"><b>{{ s.template.name }}</b> (#{{ s.template.objid }}, {{ s.template.sensors }} sensor)</template>
            <b v-else-if="s.template" class="merah">#{{ s.template.objid }} tidak ditemukan di PRTG</b>
            <b v-else class="merah">belum diatur</b>
            <a v-baris v-if="bisaUbah" class="tautan" @click="aturTemplate"> ubah</a>
          </p>
          <template v-if="bisaUbah && perluPrtg">
            <div v-if="!grup.length" class="vp-baris"><button type="button" class="btn btn-ghost" :disabled="memuatGrupNya" @click="muatGrup">{{ memuatGrupNya ? 'Memuat grup…' : 'Pilih grup PRTG…' }}</button></div>
            <template v-else>
              <label class="form-label">Grup pelanggan di PRTG</label>
              <div class="vp-baris">
                <input v-model="cariGrup" class="form-input vp-cari" placeholder="Cari grup…" />
                <select v-model="idGrup" class="form-input">
                  <option :value="null" disabled>— pilih grup —</option>
                  <option v-for="g in grupTersaring" :key="g.objid" :value="g.objid">{{ g.skor ? '★ ' : '' }}{{ g.name }}</option>
                </select>
                <button type="button" class="btn btn-primary" :class="{ 'is-loading': proses }" :disabled="proses || !idGrup || !s.template?.ada" @click="buatPrtg">Buat di PRTG</button>
              </div>
            </template>
          </template>
          <p v-else-if="!s.vpn" class="muted vp-ket">Buat akun VPN dulu — device PRTG memakai IP tunnel NS &amp; UN.</p>
        </div>
      </template>
      <p v-else class="muted">Memuat…</p>
    </div>
  </div>
</template>

<style scoped>
.vp-langkah { padding: 4px 0 12px; }
.vp-langkah + .vp-langkah { border-top: 1px solid var(--border, #e2e8f0); padding-top: 12px; }
.vp-judul { font-weight: 600; display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vp-no { width: 22px; height: 22px; border-radius: 50%; background: #e2e8f0; color: #334155; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
.vp-no.ok { background: #dcfce7; color: #15803d; }
.vp-jalur { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.vp-chip { padding: 5px 10px; border-radius: 8px; background: #eff6ff; color: #1e3a8a; font-size: 13px; }
.vp-chip b { margin-right: 6px; }
.vp-chip.kosong { background: #f1f5f9; color: #64748b; }
.vp-form { display: flex; flex-direction: column; gap: 4px; }
.vp-baris { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.vp-baris .form-input { flex: 1 1 220px; min-width: 0; }
.vp-baris .vp-cari { flex: 0 1 180px; }
.vp-prefix { font-family: monospace; color: #64748b; font-size: 13px; }
.vp-script { margin-top: 10px; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden; }
.vp-script-head { display: flex; justify-content: space-between; align-items: center; padding: 4px 4px 4px 10px; background: #1e293b; color: #cbd5e1; font-size: 12px; }
.vp-script-head .btn { color: #e2e8f0; }
.vp-script pre { margin: 0; padding: 10px; background: #0f172a; color: #e2e8f0; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.vp-ket { margin: 4px 0 8px; font-size: 13px; }
.tautan { cursor: pointer; color: var(--primary, #2563eb); }
.merah { color: #dc2626; }
.muted { color: var(--text-3, #64748b); }
</style>
