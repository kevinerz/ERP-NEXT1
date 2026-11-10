<script setup lang="ts">
// Tab "NOCaaS" di detail site: kondisi & konfigurasi router dari NOCaaS (hanya baca),
// plus sinkron identitas router (merk, tipe, SN, MAC, IP tunnel) ke data perangkat site.
import { computed, onMounted, ref } from 'vue'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { confirmDialog, toast } from '@/composables/useDialog'
import { fmtDateTime, fmtRelativeTime } from '@/composables/useFormat'

const props = defineProps<{ idSite: number }>()
const emit = defineEmits<{ (e: 'berubah'): void }>()
const auth = useAuthStore()
const pengelola = computed(() => ['Admin', 'Director', 'Manager_Ops'].some((r) => auth.hasRole(r)) || auth.isSuperAdmin)

const memuat = ref(true)
const galat = ref('')
const routers = ref<any[]>([])
const pilih = ref(0)
const r = computed(() => routers.value[pilih.value] ?? null)
const live = computed(() => r.value?.live ?? null)

async function muat() {
  memuat.value = true; galat.value = ''
  try { routers.value = (await api.get(`/nocaas/site/${props.idSite}/panel`)).data.data.routers ?? [] }
  catch (e: any) { galat.value = e.response?.data?.message || 'Gagal memuat data NOCaaS' }
  finally { memuat.value = false }
}
onMounted(muat)

const STATUS: Record<string, { t: string; w: string; i: string }> = {
  online: { t: 'Online', w: 'baik', i: '🟢' }, partial: { t: 'Sebagian', w: 'waspada', i: '🟡' },
  internet_ok: { t: 'Internet OK, VPN putus', w: 'waspada', i: '🟡' }, offline: { t: 'Offline', w: 'kritis', i: '🔴' },
}
const persen = (b?: { bebas: number; total: number } | null) => (b && b.total ? Math.round(((b.total - b.bebas) / b.total) * 100) : null)
const mb = (n: number) => `${Math.round(n / 1048576)} MB`
const ifAktif = computed(() => (live.value?.interfaces ?? []).filter((i: any) => !i.disabled))

// ── Sinkron ke perangkat site ──
const pratinjau = ref<any>(null)
const proses = ref(false)
async function bukaSinkron() {
  proses.value = true
  try { pratinjau.value = (await api.get(`/nocaas/site/${props.idSite}/sinkron`)).data.data }
  catch (e: any) { toast(e.response?.data?.message || 'Gagal menyiapkan sinkron', 'danger') }
  finally { proses.value = false }
}
const adaIsi = computed(() => pratinjau.value?.baris?.some((b: any) => b.aksi === 'isi'))
const adaBeda = computed(() => pratinjau.value?.baris?.some((b: any) => b.aksi === 'beda'))
async function terapkan(timpa: boolean) {
  if (timpa && !(await confirmDialog({ title: 'Timpa data perangkat?', message: 'Nilai yang berbeda di ERP akan diganti dengan data dari NOCaaS.', confirmLabel: 'Timpa', variant: 'warning' }))) return
  proses.value = true
  try {
    const res = await api.post(`/nocaas/site/${props.idSite}/sinkron`, { timpa })
    toast(res.data.message)
    pratinjau.value = null
    emit('berubah')
  } catch (e: any) { toast(e.response?.data?.message || 'Sinkron gagal', 'danger') }
  finally { proses.value = false }
}
</script>

<template>
  <div class="np">
    <div v-if="memuat" class="np-muat"><span class="bola" /><span class="bola" /><span class="bola" /> Mengambil data NOCaaS…</div>
    <div v-else-if="galat" class="np-galat" role="alert">😵 {{ galat }} <button type="button" class="np-link" @click="muat">Coba lagi</button></div>
    <div v-else-if="!routers.length" class="np-kosong"><span class="maskot">🛰️</span>Site ini belum terpetakan ke router NOCaaS. Petakan dari halaman <RouterLink to="/nocaas">Pembanding NOCaaS</RouterLink>.</div>

    <template v-else>
      <div v-if="routers.length > 1" class="np-pilih">
        <button v-for="(x, i) in routers" :key="x.site_key" type="button" :class="{ on: pilih === i }" @click="pilih = i">
          {{ STATUS[x.status]?.i }} {{ x.nama }} <small>{{ x.jenis }}</small>
        </button>
      </div>

      <div v-if="r" class="np-kepala">
        <div>
          <div class="np-nama">{{ live?.identity || r.nama }}</div>
          <div class="np-sub">{{ r.jenis === 'mikrotik' ? 'Mikrotik' : r.jenis }}<template v-if="live?.model"> · {{ live.model }}</template><template v-if="live?.ros"> · RouterOS {{ live.ros }}</template></div>
        </div>
        <span :class="['np-status', STATUS[r.status]?.w]">{{ STATUS[r.status]?.i }} {{ STATUS[r.status]?.t ?? r.status }} <small>sejak {{ fmtRelativeTime(r.status_sejak) }}</small></span>
        <button type="button" class="np-btn" :disabled="proses" @click="bukaSinkron">🔄 Sinkronkan ke perangkat</button>
      </div>

      <!-- Pratinjau sinkron -->
      <div v-if="pratinjau" class="np-sinkron">
        <div class="np-sinkron-judul">
          🔄 Sinkron ke perangkat site
          <small>{{ pratinjau.akan_dibuat ? 'Belum ada data perangkat router — akan dibuat baru' : `Perangkat #${pratinjau.target.id_perangkat} (${pratinjau.target.jenis})` }}</small>
        </div>
        <p v-if="pratinjau.peringatan" class="np-peringatan">⚠️ {{ pratinjau.peringatan }}</p>
        <table class="np-tabel">
          <thead><tr><th>Kolom</th><th>Di ERP</th><th>Dari NOCaaS</th><th /></tr></thead>
          <tbody>
            <tr v-for="b in pratinjau.baris" :key="b.kolom" :class="b.aksi">
              <td>{{ b.label }}</td>
              <td>{{ b.lama || '—' }}</td>
              <td><code>{{ b.baru }}</code></td>
              <td><span :class="['np-aksi', b.aksi]">{{ b.aksi === 'isi' ? 'akan diisi' : b.aksi === 'beda' ? 'berbeda' : 'sama ✓' }}</span></td>
            </tr>
          </tbody>
        </table>
        <div class="np-sinkron-aksi">
          <button type="button" class="np-btn utama" :disabled="proses || (!adaIsi && !pratinjau.akan_dibuat)" @click="terapkan(false)">Isi yang kosong</button>
          <button v-if="adaBeda && pengelola" type="button" class="np-btn" :disabled="proses" @click="terapkan(true)">Timpa yang berbeda juga</button>
          <small v-else-if="adaBeda" class="np-catatan">Nilai yang berbeda hanya bisa ditimpa Admin / Manager Ops.</small>
          <button type="button" class="np-link" @click="pratinjau = null">Batal</button>
        </div>
      </div>

      <div v-if="r" class="np-kisi">
        <!-- Koneksi -->
        <div class="np-kartu">
          <div class="np-judul">🔐 Koneksi VPN</div>
          <div class="np-vpn">
            <div v-for="j in (['ns', 'un'] as const)" :key="j" :class="['np-jalur', { mati: r[`${j}_online`] === false }]">
              <b>{{ j.toUpperCase() }}</b>
              <span>{{ r[`${j}_online`] == null ? 'tidak ada' : r[`${j}_online`] ? 'online' : 'offline' }}</span>
              <code v-if="r[`${j}_ip`]">{{ r[`${j}_ip`] }}</code>
              <small v-if="r.vpn?.[j]?.name">{{ r.vpn[j].name }}</small>
            </div>
          </div>
          <dl class="np-dl">
            <dt>IP publik</dt><dd><code>{{ r.public_ip || '—' }}</code></dd>
            <dt>ISP akses</dt><dd>{{ r.access_isp || '—' }}</dd>
            <dt>Putus 7 hari</dt><dd :class="{ merah: r.downs7 > 5 }">{{ r.downs7 }}×</dd>
            <dt>Naik-turun 24 jam</dt><dd :class="{ merah: r.flaps24 > 3 }">{{ r.flaps24 }}×</dd>
            <dt>Heartbeat</dt><dd>{{ r.hb_at ? fmtRelativeTime(r.hb_at) : '—' }}</dd>
          </dl>
        </div>

        <!-- Perangkat -->
        <div class="np-kartu">
          <div class="np-judul">🧰 Perangkat</div>
          <div v-if="!live" class="np-redup">Belum ada snapshot konfigurasi router dari NOCaaS.</div>
          <template v-else>
            <dl class="np-dl">
              <dt>Model</dt><dd>{{ live.model || '—' }}</dd>
              <dt>Serial number</dt><dd><code>{{ live.serial || '—' }}</code></dd>
              <dt>RouterOS</dt><dd>{{ live.ros || '—' }}<template v-if="live.firmware && live.firmware !== live.ros?.split(' ')[0]"> · firmware {{ live.firmware }}</template></dd>
              <dt>Uptime</dt><dd>{{ live.uptime || '—' }}</dd>
            </dl>
            <div class="np-meter">
              <span>CPU</span><div class="bar"><i :style="{ width: `${live.cpu ?? 0}%` }" :class="{ tinggi: (live.cpu ?? 0) > 80 }" /></div><b>{{ live.cpu ?? '—' }}%</b>
            </div>
            <div v-if="live.mem" class="np-meter">
              <span>Memori</span><div class="bar"><i :style="{ width: `${persen(live.mem)}%` }" :class="{ tinggi: (persen(live.mem) ?? 0) > 85 }" /></div><b>{{ persen(live.mem) }}%</b>
            </div>
            <div v-if="live.hdd" class="np-meter">
              <span>Storage</span><div class="bar"><i :style="{ width: `${persen(live.hdd)}%` }" /></div><b>{{ mb(live.hdd.total - live.hdd.bebas) }}</b>
            </div>
          </template>
        </div>

        <!-- Interface -->
        <div v-if="live" class="np-kartu lebar">
          <div class="np-judul">🔌 Interface <small>snapshot {{ fmtDateTime(r.live_at) }}</small></div>
          <div class="np-if">
            <div v-for="i in ifAktif" :key="i.name" :class="['np-port', { hidup: i.running }]" :title="i.comment || i.name">
              <span class="led" />
              <b>{{ i.name }}</b>
              <small>{{ i.running ? (i.speed || 'hidup') : 'mati' }}</small>
              <code v-if="i.mac">{{ i.mac }}</code>
            </div>
          </div>
        </div>

        <!-- LAN & DHCP -->
        <div v-if="live" class="np-kartu">
          <div class="np-judul">🏠 Jaringan lokal</div>
          <dl class="np-dl">
            <template v-for="a in live.ip" :key="a.address"><dt>{{ a.interface }}</dt><dd><code>{{ a.address }}</code><small v-if="a.dynamic"> (dinamis)</small></dd></template>
            <dt>DNS</dt><dd>{{ live.dns || '—' }}</dd>
            <dt>DHCP server</dt><dd>{{ live.dhcp_server?.map((d: any) => `${d.name} @ ${d.interface}`).join(', ') || '—' }}</dd>
          </dl>
        </div>
        <div v-if="live" class="np-kartu">
          <div class="np-judul">📱 Perangkat pelanggan terhubung <span class="np-angka">{{ live.dhcp_aktif }}</span></div>
          <div v-if="!live.dhcp_klien?.length" class="np-redup">Tidak ada klien DHCP aktif saat snapshot.</div>
          <ul v-else class="np-klien">
            <li v-for="k in live.dhcp_klien" :key="k.mac"><code>{{ k.ip }}</code><span>{{ k.host || '(tanpa nama)' }}</span><small>{{ k.mac }}</small></li>
          </ul>
        </div>
      </div>
      <p class="np-kaki">Data dari NOCaaS — diperbarui otomatis setiap sinkron (tiap menit untuk status, saat router mengirim snapshot untuk konfigurasi).</p>
    </template>
  </div>
</template>

<style scoped>
.np { display: flex; flex-direction: column; gap: 14px; }
.np-muat, .np-kosong, .np-galat { padding: 28px; text-align: center; color: #64748b; font-size: 13.5px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
.np-galat { color: #b91c1c; }
.bola { width: 9px; height: 9px; border-radius: 50%; background: #2a78d6; animation: lompat 1s infinite; }
.bola:nth-child(2) { background: #1baf7a; animation-delay: .15s; }
.bola:nth-child(3) { background: #eb6834; animation-delay: .3s; }
.maskot { font-size: 28px; animation: lompat 2s infinite; display: inline-block; }
.np-link { border: 0; background: none; color: #2563eb; font-weight: 700; cursor: pointer; }
.np-pilih { display: flex; gap: 6px; flex-wrap: wrap; }
.np-pilih button { padding: 6px 12px; border-radius: 99px; border: 1px solid #e2e8f0; background: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.np-pilih button.on { background: #0f172a; color: #fff; border-color: #0f172a; }
.np-pilih small { opacity: .7; margin-left: 4px; }
.np-kepala { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 16px; border-radius: 16px; background: linear-gradient(120deg, #eaf2fd, #f3effd); border: 1px solid #dbe5f6; }
.np-kepala > div:first-child { flex: 1; min-width: 200px; }
.np-nama { font-size: 17px; font-weight: 800; color: #0f172a; overflow-wrap: anywhere; }
.np-sub { font-size: 12.5px; color: #52514e; }
.np-status { padding: 5px 12px; border-radius: 99px; font-size: 12.5px; font-weight: 800; background: #fff; }
.np-status small { font-weight: 500; opacity: .75; }
.np-status.baik { color: #0a6e0a; } .np-status.waspada { color: #8a5d00; } .np-status.kritis { color: #b42323; }
.np-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid #c7d7f3; background: #fff; color: #1c4f9c; font-weight: 700; font-size: 13px; cursor: pointer; }
.np-btn.utama { background: #2a78d6; border-color: #2a78d6; color: #fff; }
.np-btn:disabled { opacity: .55; cursor: not-allowed; }
.np-sinkron { padding: 14px 16px; border-radius: 16px; border: 1.5px dashed #93c5fd; background: #f8fbff; animation: muncul .25s; }
.np-sinkron-judul { font-weight: 800; font-size: 14px; margin-bottom: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.np-sinkron-judul small { font-weight: 500; color: #64748b; }
.np-tabel { width: 100%; border-collapse: collapse; font-size: 13px; }
.np-tabel th { text-align: left; font-size: 11.5px; color: #64748b; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
.np-tabel td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; overflow-wrap: anywhere; }
.np-tabel tr.isi td { background: #f0fdf4; }
.np-tabel tr.beda td { background: #fffbeb; }
.np-aksi { font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
.np-aksi.isi { background: #dcfce7; color: #15803d; } .np-aksi.beda { background: #fef3c7; color: #92400e; } .np-aksi.sama { background: #f1f5f9; color: #64748b; }
.np-sinkron-aksi { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
.np-catatan { color: #92400e; font-size: 12px; }
.np-peringatan { margin: 0 0 10px; padding: 8px 12px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 12.5px; font-weight: 600; }
.np-kisi { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.np-kartu { padding: 14px 16px; border-radius: 16px; background: #fff; border: 1px solid #ecebe6; min-width: 0; transition: box-shadow .2s; }
.np-kartu:hover { box-shadow: 0 8px 20px rgba(15, 23, 42, .06); }
.np-kartu.lebar { grid-column: 1 / -1; }
.np-judul { font-size: 13.5px; font-weight: 800; color: #1f1f1d; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.np-judul small { font-weight: 500; color: #64748b; font-size: 11.5px; }
.np-angka { padding: 1px 9px; border-radius: 99px; background: #2a78d6; color: #fff; font-size: 12px; }
.np-dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; font-size: 13px; }
.np-dl dt { color: #64748b; }
.np-dl dd { margin: 0; color: #0f172a; overflow-wrap: anywhere; }
.np-dl small { color: #94a3b8; }
.merah { color: #b42323 !important; font-weight: 700; }
code { font: 12.5px ui-monospace, SFMono-Regular, monospace; background: #f1f5f9; padding: 1px 6px; border-radius: 6px; }
.np-redup { color: #94a3b8; font-size: 13px; }
.np-vpn { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.np-jalur { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; border-radius: 12px; background: #ecfdf3; border: 1px solid #bbf7d0; font-size: 12.5px; color: #166534; }
.np-jalur.mati { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.np-jalur b { font-size: 13px; }
.np-jalur small { color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-meter { display: grid; grid-template-columns: 62px 1fr 52px; align-items: center; gap: 8px; margin-top: 8px; font-size: 12.5px; color: #52514e; }
.np-meter b { text-align: right; color: #0f172a; font-variant-numeric: tabular-nums; }
.bar { height: 8px; border-radius: 99px; background: #eef2f7; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 99px; background: #1baf7a; animation: isi 1s cubic-bezier(.2, .9, .3, 1) both; transform-origin: left; }
.bar i.tinggi { background: #d03b3b; }
.np-if { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.np-port { display: grid; grid-template-columns: 12px 1fr; gap: 2px 8px; align-items: center; padding: 8px 10px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 12.5px; }
.np-port .led { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; grid-row: span 3; align-self: start; margin-top: 4px; }
.np-port.hidup { background: #f0fdf4; border-color: #bbf7d0; }
.np-port.hidup .led { background: #0ca30c; box-shadow: 0 0 0 0 rgba(12, 163, 12, .5); animation: denyut 2s infinite; }
.np-port b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-port small { color: #64748b; }
.np-port code { font-size: 10.5px; padding: 0; background: none; color: #64748b; }
.np-klien { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; max-height: 260px; overflow-y: auto; font-size: 12.5px; }
.np-klien li { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; align-items: center; }
.np-klien span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-klien small { color: #94a3b8; font-family: ui-monospace, monospace; font-size: 11px; }
.np-kaki { margin: 0; font-size: 11.5px; color: #94a3b8; }
@keyframes lompat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes denyut { 70% { box-shadow: 0 0 0 6px rgba(12, 163, 12, 0); } }
@keyframes isi { from { transform: scaleX(0); } }
@keyframes muncul { from { opacity: 0; transform: translateY(-6px); } }
@media (prefers-reduced-motion: reduce) { .np * { animation: none !important; } }
@media (max-width: 640px) { .np-klien li { grid-template-columns: 100px 1fr; } .np-klien small { display: none; } .np-vpn { grid-template-columns: 1fr; } }
</style>
