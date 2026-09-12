<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import portalApi from '@/services/portalApi'

const sites      = ref<any[]>([])
const downStatus = ref<{ id_site: number; sensors: string[] }[]>([])
const loading    = ref(true)
const loadError  = ref('')
let   leafletMap: any = null

function parseCoord(gps: string | null): [number, number] | null {
  if (!gps) return null
  const parts = gps.split(',').map((p: string) => parseFloat(p.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return [parts[0], parts[1]]
  return null
}

function siteIsDown(id_site: number) {
  return downStatus.value.some(d => d.id_site === id_site)
}

function siteDownSensors(id_site: number) {
  return downStatus.value.find(d => d.id_site === id_site)?.sensors ?? []
}

async function initMap() {
  await nextTick()
  const el = document.getElementById('portal-geo-map')
  if (!el) return

  if (!(window as any).L) {
    await new Promise<void>((resolve, reject) => {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(css)
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
      script.onload = () => resolve()
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  const L = (window as any).L
  if (leafletMap) { leafletMap.remove(); leafletMap = null }

  leafletMap = L.map(el, { zoomControl: true }).setView([-2.5, 118], 5)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap)

  const sitesWithCoord = sites.value.filter(s => parseCoord(s.koordinat_gps))
  if (!sitesWithCoord.length) return

  const bounds: [number, number][] = []

  for (const site of sitesWithCoord) {
    const coord = parseCoord(site.koordinat_gps)!
    bounds.push(coord)
    const isDown = siteIsDown(site.id_site)
    const tiket  = site.tiket_aktif || 0
    const color  = isDown ? '#dc2626' : tiket > 0 ? '#f59e0b' : '#16a34a'

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        background:${color};border:2px solid #fff;border-radius:50%;
        width:14px;height:14px;
        box-shadow:0 0 0 2px ${color},0 2px 8px rgba(0,0,0,0.3);
        ${isDown ? 'animation:pulse-marker 1.4s ease-in-out infinite;' : ''}
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -12],
    })

    const downList    = siteDownSensors(site.id_site)
    const sensorsHtml = downList.length
      ? `<div style="margin-top:8px;border-top:1px solid #fecaca;padding-top:6px">
           <div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:4px">⚠ Sensor Down</div>
           ${downList.slice(0, 5).map(s => `<div style="font-size:11px;color:#7f1d1d;margin-bottom:2px">• ${s}</div>`).join('')}
           ${downList.length > 5 ? `<div style="font-size:11px;color:#9f1239">+ ${downList.length - 5} lainnya</div>` : ''}
         </div>`
      : ''

    const popup = `
      <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:260px">
        <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:2px">${site.nama_site}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:8px">${site.kode_site}${site.layanan?.nama_layanan ? ' · ' + site.layanan.nama_layanan : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <span style="background:${isDown?'#fef2f2':tiket>0?'#fffbeb':'#f0fdf4'};color:${isDown?'#dc2626':tiket>0?'#d97706':'#15803d'};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">
            ${isDown ? '● Down' : tiket > 0 ? '● Ada Tiket' : '● Online'}
          </span>
          ${tiket > 0 ? `<span style="background:#eff6ff;color:#1d4ed8;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">${tiket} Tiket</span>` : ''}
        </div>
        ${site.kota || site.provinsi ? `<div style="font-size:11px;color:#64748b">📍 ${[site.kota, site.provinsi].filter(Boolean).join(', ')}</div>` : ''}
        ${sensorsHtml}
      </div>`

    L.marker(coord, { icon }).addTo(leafletMap).bindPopup(popup, { maxWidth: 280 })
  }

  if (bounds.length === 1) {
    leafletMap.setView(bounds[0], 14)
  } else if (bounds.length > 1) {
    leafletMap.fitBounds(bounds, { padding: [60, 60] })
  }
}

onMounted(async () => {
  try {
    const [sitesRes, downRes] = await Promise.all([
      portalApi.get('/portal/sites'),
      portalApi.get('/portal/sites/down-status').catch(() => ({ data: { data: [] } })),
    ])
    sites.value      = sitesRes.data.data
    downStatus.value = downRes.data.data ?? []
  } catch (e: any) {
    loadError.value = e?.response?.data?.message || 'Gagal memuat data site.'
  } finally {
    loading.value = false
    await initMap()
  }
})

onUnmounted(() => {
  if (leafletMap) { leafletMap.remove(); leafletMap = null }
})

const sitesWithCoord  = () => sites.value.filter(s => parseCoord(s.koordinat_gps)).length
const sitesDown       = () => downStatus.value.length
</script>

<template>
  <div class="map-page">
    <div class="map-header">
      <div class="map-header-inner">
        <div>
          <div class="map-eyebrow">PETA JARINGAN</div>
          <h1 class="map-title">Lokasi Site</h1>
        </div>
        <div class="map-legend">
          <span class="leg-item"><span class="leg-dot leg-ok"></span> Online</span>
          <span class="leg-item"><span class="leg-dot leg-warn"></span> Ada Tiket</span>
          <span class="leg-item"><span class="leg-dot leg-down"></span> Down</span>
        </div>
      </div>
      <div class="map-stats" v-if="!loading">
        <div class="stat-item">
          <span class="stat-val">{{ sites.length }}</span>
          <span class="stat-lbl">Total Site</span>
        </div>
        <div class="stat-item">
          <span class="stat-val">{{ sitesWithCoord() }}</span>
          <span class="stat-lbl">Di Peta</span>
        </div>
        <div class="stat-item" :class="sitesDown() > 0 ? 'stat-down' : ''">
          <span class="stat-val">{{ sitesDown() }}</span>
          <span class="stat-lbl">Down</span>
        </div>
      </div>
    </div>

    <div class="map-wrap">
      <div v-if="loading" class="map-state">
        <span class="spinner"></span> Memuat peta…
      </div>
      <div v-else-if="loadError" class="map-error">{{ loadError }}</div>
      <template v-else>
        <div id="portal-geo-map" class="geo-map"></div>
        <div v-if="!sitesWithCoord()" class="map-no-coord">
          Koordinat GPS belum diatur pada data site. Tambahkan di menu Master → Detail Site.
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

* { box-sizing: border-box; }

.map-page {
  font-family: 'Inter', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: calc(100vh - 56px);
  background: #F0F4F9;
}

/* ── Header ───────────────────────────────────────────────── */
.map-header {
  background: #0B1D35;
  padding: 20px 32px;
}
.map-header-inner {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  max-width: 1400px;
  margin: 0 auto;
  gap: 16px;
  flex-wrap: wrap;
}
.map-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #5A8ED4;
  margin-bottom: 4px;
}
.map-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.3px;
}
.map-legend {
  display: flex;
  align-items: center;
  gap: 16px;
}
.leg-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}
.leg-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
  flex-shrink: 0;
}
.leg-ok   { background: #16a34a; }
.leg-warn { background: #f59e0b; }
.leg-down { background: #dc2626; }

.map-stats {
  display: flex;
  gap: 0;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  overflow: hidden;
  max-width: 1400px;
  margin: 12px auto 0;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 20px;
  border-right: 1px solid rgba(255,255,255,0.1);
  gap: 2px;
}
.stat-item:last-child { border-right: none; }
.stat-val {
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.stat-lbl {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #7A9EC4;
}
.stat-down .stat-val { color: #f87171; }

/* ── Map ──────────────────────────────────────────────────── */
.map-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
}
.geo-map {
  flex: 1;
  width: 100%;
  min-height: 500px;
  z-index: 0;
}
.map-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #9EB3C9;
  font-weight: 500;
  gap: 8px;
  padding: 80px;
}
.map-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #dc2626;
  padding: 60px;
}
.map-no-coord {
  background: #fffbeb;
  border-top: 1px solid #fde68a;
  padding: 12px 24px;
  font-size: 12px;
  color: #92400e;
  text-align: center;
}

.spinner {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid #C5D4E8;
  border-top-color: #1456A6;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Pulse for down markers */
@keyframes pulse-marker {
  0%   { box-shadow: 0 0 0 2px #dc2626, 0 0 0 5px rgba(220,38,38,0.35); }
  50%  { box-shadow: 0 0 0 2px #dc2626, 0 0 0 10px rgba(220,38,38,0); }
  100% { box-shadow: 0 0 0 2px #dc2626, 0 0 0 5px rgba(220,38,38,0.35); }
}

/* Leaflet popup */
:deep(.leaflet-popup-content-wrapper) {
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
}
:deep(.leaflet-popup-content) {
  margin: 12px 14px;
}
</style>
