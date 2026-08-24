<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePortalAuthStore } from '@/stores/portalAuth'
import portalApi from '@/services/portalApi'

const auth   = usePortalAuthStore()
const router = useRouter()

const sites   = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await portalApi.get('/portal/sites')
    sites.value = res.data.data
  } finally { loading.value = false }
})

function statusMonitor(s: any) {
  if (!s.monitoring) return { label: 'Tidak Dipantau', cls: 'mon-none' }
  const st = (s.monitoring.status || '').toLowerCase()
  if (st === 'up' || st === 'online' || st === '3') return { label: 'Online', cls: 'mon-up' }
  if (st === 'down' || st === 'offline' || st === '4' || st === '5') return { label: 'Down', cls: 'mon-down' }
  return { label: s.monitoring.status, cls: 'mon-warn' }
}

function statusSite(s: string) {
  const map: Record<string, string> = { Aktif: 'site-aktif', Prospek: 'site-prospek', Terminasi: 'site-terminasi' }
  return map[s] || 'site-prospek'
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const totalUp   = () => sites.value.filter(s => statusMonitor(s).cls === 'mon-up').length
const totalDown = () => sites.value.filter(s => statusMonitor(s).cls === 'mon-down').length
const totalTiketAktif = () => sites.value.reduce((a, s) => a + (s.tiket_aktif || 0), 0)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Status Site</h2>
        <p class="sub">{{ auth.user?.pelanggan?.nama_pelanggan }}</p>
      </div>
    </div>

    <!-- Summary cards -->
    <div class="summary-row">
      <div class="summary-card">
        <div class="snum">{{ sites.length }}</div>
        <div class="slabel">Total Site</div>
      </div>
      <div class="summary-card green">
        <div class="snum">{{ totalUp() }}</div>
        <div class="slabel">Online</div>
      </div>
      <div class="summary-card red" v-if="totalDown() > 0">
        <div class="snum">{{ totalDown() }}</div>
        <div class="slabel">Down</div>
      </div>
      <div class="summary-card amber" v-if="totalTiketAktif() > 0">
        <div class="snum">{{ totalTiketAktif() }}</div>
        <div class="slabel">Tiket Aktif</div>
      </div>
    </div>

    <div v-if="loading" class="loading">Memuat data site...</div>

    <div class="site-grid" v-else>
      <div v-for="site in sites" :key="site.id_site" class="site-card">
        <div class="site-card-header">
          <div>
            <div class="site-name">{{ site.nama_site }}</div>
            <div class="site-kode">{{ site.kode_site }} · {{ site.layanan?.nama_layanan }}</div>
          </div>
          <div class="site-badges">
            <span :class="['badge-site', statusSite(site.status_site)]">{{ site.status_site }}</span>
            <span v-if="site.tiket_aktif" class="badge-tiket" @click="router.push({ path: '/portal/tickets', query: { id_site: site.id_site } })">
              {{ site.tiket_aktif }} tiket
            </span>
          </div>
        </div>

        <!-- Monitoring status -->
        <div :class="['monitor-bar', statusMonitor(site).cls]">
          <span class="mon-dot"></span>
          <span class="mon-label">{{ statusMonitor(site).label }}</span>
          <span v-if="site.monitoring?.sensor" class="mon-sensor">· {{ site.monitoring.sensor }}</span>
          <span v-if="site.monitoring?.last_change" class="mon-time">
            sejak {{ fmtDate(site.monitoring.last_change) }}
          </span>
        </div>

        <!-- Alamat -->
        <div class="site-info">
          <span class="info-icon">📍</span>
          <span class="info-text">{{ site.kota || '' }}{{ site.kota && site.provinsi ? ', ' : '' }}{{ site.provinsi || site.alamat }}</span>
        </div>

        <!-- Perangkat utama -->
        <div class="perangkat-list" v-if="site.perangkat?.length">
          <div v-for="(p, i) in site.perangkat.slice(0, 3)" :key="i" class="perangkat-item">
            <span class="p-type">{{ p.jenis_perangkat }}</span>
            <span class="p-name">{{ [p.merk, p.tipe_model].filter(Boolean).join(' ') || '—' }}</span>
            <span v-if="p.ip_address" class="p-ip">{{ p.ip_address }}</span>
            <span :class="['p-status', p.status_perangkat === 'Aktif' ? 'p-aktif' : 'p-na']">{{ p.status_perangkat }}</span>
          </div>
          <div v-if="site.perangkat.length > 3" class="perangkat-more">+{{ site.perangkat.length - 3 }} perangkat lainnya</div>
        </div>
        <div class="no-perangkat" v-else>Tidak ada data perangkat</div>

        <!-- Aktif sejak -->
        <div class="site-footer">Aktif sejak {{ fmtDate(site.tgl_aktif) }}</div>
      </div>
    </div>

    <div v-if="!loading && !sites.length" class="empty">Tidak ada site terdaftar untuk akun ini.</div>
  </div>
</template>

<style scoped>
.page        { padding: 28px 32px; max-width: 1200px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; font-weight: 800; }
.sub         { margin: 0; font-size: 13px; color: #64748b; }
.loading     { padding: 60px; text-align: center; color: #94a3b8; }
.empty       { padding: 60px; text-align: center; color: #94a3b8; }

.summary-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 22px; }
.summary-card { background: #fff; border-radius: 10px; padding: 14px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.summary-card.green { border-left: 4px solid #16a34a; }
.summary-card.red   { border-left: 4px solid #dc2626; }
.summary-card.amber { border-left: 4px solid #d97706; }
.snum  { font-size: 28px; font-weight: 800; color: #0f172a; }
.slabel{ font-size: 12px; color: #64748b; }

.site-grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.site-card   { background: #fff; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); display: flex; flex-direction: column; gap: 12px; }
.site-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.site-name   { font-size: 15px; font-weight: 700; color: #0f172a; }
.site-kode   { font-size: 12px; color: #64748b; margin-top: 2px; }
.site-badges { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.badge-site  { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.site-aktif  { background: #f0fdf4; color: #15803d; }
.site-prospek{ background: #fefce8; color: #854d0e; }
.site-terminasi { background: #fef2f2; color: #991b1b; }
.badge-tiket { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #92400e; cursor: pointer; }
.badge-tiket:hover { opacity: 0.8; }

.monitor-bar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; font-size: 13px; }
.mon-up      { background: #f0fdf4; }
.mon-down    { background: #fef2f2; }
.mon-warn    { background: #fefce8; }
.mon-none    { background: #f8fafc; }
.mon-dot     { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.mon-up .mon-dot   { color: #16a34a; }
.mon-down .mon-dot { color: #dc2626; }
.mon-warn .mon-dot { color: #d97706; }
.mon-none .mon-dot { color: #94a3b8; }
.mon-label   { font-weight: 700; flex-shrink: 0; }
.mon-up .mon-label   { color: #15803d; }
.mon-down .mon-label { color: #dc2626; }
.mon-warn .mon-label { color: #b45309; }
.mon-none .mon-label { color: #64748b; }
.mon-sensor  { color: #64748b; font-size: 12px; }
.mon-time    { color: #94a3b8; font-size: 11px; margin-left: auto; }

.site-info   { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
.info-icon   { font-size: 14px; }

.perangkat-list { display: flex; flex-direction: column; gap: 4px; }
.perangkat-item { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 0; border-top: 1px solid #f1f5f9; }
.perangkat-item:first-child { border-top: none; }
.p-type { font-size: 10px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; }
.p-name { color: #374151; font-weight: 500; flex: 1; }
.p-ip   { color: #94a3b8; font-family: monospace; font-size: 11px; }
.p-status { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
.p-aktif  { background: #f0fdf4; color: #15803d; }
.p-na     { background: #f8fafc; color: #64748b; }
.perangkat-more { font-size: 11px; color: #94a3b8; padding-top: 4px; }
.no-perangkat   { font-size: 12px; color: #94a3b8; font-style: italic; }

.site-footer { font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 10px; }
</style>
