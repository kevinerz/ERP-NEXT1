<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import portalApi from '@/services/portalApi'

const sites     = ref<any[]>([])
const loading   = ref(true)
const loadError = ref('')
const search    = ref('')
const expanded  = ref<number | null>(null)

onMounted(async () => {
  try {
    const res  = await portalApi.get('/portal/sites/list')
    sites.value = res.data.data
  } catch (e: any) {
    loadError.value = e?.response?.data?.message || 'Gagal memuat data site.'
  } finally { loading.value = false }
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return sites.value
  return sites.value.filter(s =>
    s.nama_site?.toLowerCase().includes(q) ||
    s.kode_site?.toLowerCase().includes(q) ||
    s.kota?.toLowerCase().includes(q) ||
    s.alamat?.toLowerCase().includes(q)
  )
})

function toggle(id: number) {
  expanded.value = expanded.value === id ? null : id
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtRupiah(n: number | string | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
}

function waLink(phone: string | null) {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (!clean) return null
  const num = clean.startsWith('0') ? '62' + clean.slice(1)
            : clean.startsWith('62') ? clean
            : '62' + clean
  return `https://wa.me/${num}`
}

function mapsShareLink(gps: string | null) {
  if (!gps) return null
  const [lat, lng] = gps.split(',').map((s: string) => s.trim())
  return `https://maps.google.com/?q=${lat},${lng}`
}

function mapsRouteLink(gps: string | null) {
  if (!gps) return null
  const [lat, lng] = gps.split(',').map((s: string) => s.trim())
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}
</script>

<template>
  <div class="sl-page">

    <!-- Header -->
    <div class="sl-header">
      <div class="sl-header-inner">
        <div>
          <div class="sl-eyebrow">MASTER DATA</div>
          <h1 class="sl-title">Daftar Site</h1>
        </div>
        <div class="sl-count" v-if="!loading">{{ filtered.length }} site</div>
      </div>

      <div class="sl-toolbar">
        <div class="sl-search-wrap">
          <span class="sl-search-icon">🔍</span>
          <input
            v-model="search"
            class="sl-search"
            placeholder="Cari nama site, kode, kota…"
            type="search"
          />
        </div>
      </div>
    </div>

    <!-- States -->
    <div v-if="loading" class="sl-state">
      <span class="spinner"></span> Memuat data site…
    </div>
    <div v-else-if="loadError" class="sl-error">{{ loadError }}</div>
    <div v-else-if="!filtered.length" class="sl-state">
      {{ search ? 'Tidak ada site yang cocok dengan pencarian.' : 'Tidak ada site terdaftar.' }}
    </div>

    <!-- Site list -->
    <div class="sl-list" v-else>
      <div
        v-for="site in filtered"
        :key="site.id_site"
        :class="['sl-card', `sl-${site.status_site?.toLowerCase()}`]"
      >
        <!-- Card header (always visible) -->
        <div class="sl-card-head" @click="toggle(site.id_site)">
          <div class="sl-card-left">
            <span :class="['sl-status-dot', `dot-${site.status_site?.toLowerCase()}`]"></span>
            <div>
              <div class="sl-site-name">{{ site.nama_site }}</div>
              <div class="sl-site-sub">
                {{ site.kode_site }}
                <span v-if="site.layanan">· {{ site.layanan.nama_layanan }}</span>
                <span v-if="site.kota" class="sl-kota">· {{ site.kota }}{{ site.provinsi ? ', ' + site.provinsi : '' }}</span>
              </div>
            </div>
          </div>
          <div class="sl-card-right">
            <span :class="['sl-pill', `pill-${site.status_site?.toLowerCase()}`]">{{ site.status_site }}</span>
            <span class="sl-expand-icon">{{ expanded === site.id_site ? '▲' : '▼' }}</span>
          </div>
        </div>

        <!-- Expanded detail -->
        <div v-if="expanded === site.id_site" class="sl-detail">

          <!-- Info grid -->
          <div class="sl-section">
            <div class="sl-section-title">INFORMASI SITE</div>
            <div class="sl-info-grid">
              <div class="sl-info-item">
                <span class="sl-info-key">Alamat</span>
                <span class="sl-info-val">{{ site.alamat || '—' }}</span>
              </div>
              <div class="sl-info-item">
                <span class="sl-info-key">Kota / Provinsi</span>
                <span class="sl-info-val">{{ [site.kota, site.provinsi].filter(Boolean).join(', ') || '—' }}</span>
              </div>
              <div class="sl-info-item">
                <span class="sl-info-key">Layanan</span>
                <span class="sl-info-val">{{ site.layanan?.nama_layanan || '—' }}</span>
              </div>
              <div class="sl-info-item">
                <span class="sl-info-key">Tgl Aktif</span>
                <span class="sl-info-val">{{ fmtDate(site.tgl_aktif) }}</span>
              </div>
              <div class="sl-info-item" v-if="site.tgl_terminasi">
                <span class="sl-info-key">Tgl Terminasi</span>
                <span class="sl-info-val">{{ fmtDate(site.tgl_terminasi) }}</span>
              </div>
              <div class="sl-info-item" v-if="site.koordinat_gps">
                <span class="sl-info-key">Koordinat GPS</span>
                <div class="sl-gps-row">
                  <span class="sl-info-val sl-mono">{{ site.koordinat_gps }}</span>
                  <div class="sl-gps-actions">
                    <a :href="mapsShareLink(site.koordinat_gps)" target="_blank" rel="noopener" class="sl-gps-btn sl-gps-share" title="Bagikan Lokasi">
                      📍 Lokasi
                    </a>
                    <a :href="mapsRouteLink(site.koordinat_gps)" target="_blank" rel="noopener" class="sl-gps-btn sl-gps-route" title="Buka Rute di Google Maps">
                      🧭 Rute
                    </a>
                  </div>
                </div>
              </div>
              <div class="sl-info-item sl-full" v-if="site.catatan">
                <span class="sl-info-key">Catatan</span>
                <span class="sl-info-val">{{ site.catatan }}</span>
              </div>
            </div>
          </div>

          <!-- Kontrak -->
          <div class="sl-section" v-if="site.kontrak">
            <div class="sl-section-title">KONTRAK AKTIF</div>
            <div class="sl-info-grid">
              <div class="sl-info-item">
                <span class="sl-info-key">Nomor Kontrak</span>
                <span class="sl-info-val sl-mono">{{ site.kontrak.nomor_kontrak }}</span>
              </div>
              <div class="sl-info-item">
                <span class="sl-info-key">Mulai</span>
                <span class="sl-info-val">{{ fmtDate(site.kontrak.tgl_mulai) }}</span>
              </div>
              <div class="sl-info-item">
                <span class="sl-info-key">Berakhir</span>
                <span class="sl-info-val">{{ fmtDate(site.kontrak.tgl_berakhir) }}</span>
              </div>
              <div class="sl-info-item">
                <span class="sl-info-key">Harga MRC</span>
                <span class="sl-info-val">{{ fmtRupiah(site.kontrak.harga_mrc) }} / bln</span>
              </div>
            </div>
          </div>

          <!-- PIC -->
          <div class="sl-section" v-if="site.pic?.length">
            <div class="sl-section-title">PIC SITE</div>
            <div class="sl-pic-list">
              <div v-for="(p, i) in site.pic" :key="i" class="sl-pic-item">
                <div class="sl-pic-name">
                  {{ p.nama_pic }}
                  <span v-if="p.is_utama" class="sl-pic-utama">Utama</span>
                </div>
                <div class="sl-pic-sub" v-if="p.jabatan">{{ p.jabatan }}</div>
                <div class="sl-pic-contacts">
                  <a v-if="p.no_kontak && waLink(p.no_kontak)"
                     :href="waLink(p.no_kontak)"
                     target="_blank" rel="noopener"
                     class="sl-pic-contact sl-wa-link"
                     title="Chat WhatsApp">
                    <span class="sl-wa-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    </span>
                    {{ p.no_kontak }}
                  </a>
                  <span v-else-if="p.no_kontak" class="sl-pic-contact">📞 {{ p.no_kontak }}</span>
                  <span v-if="p.email" class="sl-pic-contact">✉ {{ p.email }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Perangkat -->
          <div class="sl-section" v-if="site.perangkat?.length">
            <div class="sl-section-title">PERANGKAT</div>
            <div class="sl-table-wrap">
              <table class="sl-table">
                <thead>
                  <tr>
                    <th>Jenis</th>
                    <th>Merk / Model</th>
                    <th>Serial Number</th>
                    <th>IP Address</th>
                    <th>MAC Address</th>
                    <th>Tgl Pasang</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in site.perangkat" :key="i">
                    <td><span class="sl-badge-type">{{ p.jenis_perangkat }}</span></td>
                    <td>{{ [p.merk, p.tipe_model].filter(Boolean).join(' ') || '—' }}</td>
                    <td class="sl-mono-sm">{{ p.serial_number || '—' }}</td>
                    <td class="sl-mono-sm">{{ p.ip_address || '—' }}</td>
                    <td class="sl-mono-sm">{{ p.mac_address || '—' }}</td>
                    <td>{{ fmtDate(p.tgl_pasang) }}</td>
                    <td>
                      <span :class="['sl-badge-status', p.status_perangkat === 'Aktif' ? 'badge-aktif' : 'badge-na']">
                        {{ p.status_perangkat }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

* { box-sizing: border-box; }
.sl-page {
  font-family: 'Inter', system-ui, sans-serif;
  background: #F0F4F9;
  min-height: 100%;
  padding-bottom: 48px;
  color: #0B1D35;
}

/* ── Header ───────────────────────────────────────────────── */
.sl-header {
  background: #0B1D35;
  padding: 20px 32px 0;
  margin-bottom: 0;
}
.sl-header-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.sl-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #5A8ED4;
  margin-bottom: 4px;
}
.sl-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.3px;
}
.sl-count {
  font-size: 12px;
  color: #7A9EC4;
  font-weight: 600;
  padding-bottom: 4px;
}
.sl-toolbar {
  max-width: 1100px;
  margin: 14px auto 0;
  padding-bottom: 16px;
}
.sl-search-wrap {
  position: relative;
  max-width: 400px;
}
.sl-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  pointer-events: none;
}
.sl-search {
  width: 100%;
  padding: 9px 14px 9px 36px;
  border: 1.5px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  background: rgba(255,255,255,0.1);
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
.sl-search::placeholder { color: #7A9EC4; }
.sl-search:focus { border-color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); }

/* ── List container ───────────────────────────────────────── */
.sl-list {
  max-width: 1100px;
  margin: 24px auto 0;
  padding: 0 32px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Card ─────────────────────────────────────────────────── */
.sl-card {
  background: #fff;
  border-radius: 4px;
  border: 1px solid #E3EAF3;
  border-left: 4px solid #CBD5E1;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(11,29,53,0.05);
}
.sl-aktif      { border-left-color: #0B7C4B; }
.sl-prospek    { border-left-color: #1456A6; }
.sl-terminasi  { border-left-color: #C41E1E; }

.sl-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
  gap: 12px;
  transition: background 0.12s;
}
.sl-card-head:hover { background: #F8FAFC; }

.sl-card-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.sl-status-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-aktif     { background: #0B7C4B; }
.dot-prospek   { background: #1456A6; }
.dot-terminasi { background: #C41E1E; }

.sl-site-name {
  font-size: 15px;
  font-weight: 700;
  color: #0B1D35;
  letter-spacing: -0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sl-site-sub {
  font-size: 11px;
  color: #7A8FA6;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sl-kota { color: #9EB3C9; }

.sl-card-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.sl-pill {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
}
.pill-aktif     { background: #ECFDF5; color: #065F46; }
.pill-prospek   { background: #EFF6FF; color: #1E40AF; }
.pill-terminasi { background: #FEF2F2; color: #991B1B; }
.sl-expand-icon {
  font-size: 9px;
  color: #9EB3C9;
  width: 18px;
  text-align: center;
}

/* ── Detail area ──────────────────────────────────────────── */
.sl-detail {
  border-top: 1px solid #F0F4F9;
  background: #FAFBFC;
}
.sl-section {
  border-bottom: 1px solid #EEF2F7;
  padding: 14px 18px;
}
.sl-section:last-child { border-bottom: none; }
.sl-section-title {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.8px;
  color: #9EB3C9;
  text-transform: uppercase;
  margin-bottom: 10px;
}

/* Info grid */
.sl-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px 24px;
}
.sl-info-item { display: flex; flex-direction: column; gap: 3px; }
.sl-full { grid-column: 1 / -1; }
.sl-info-key {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #9EB3C9;
}
.sl-info-val {
  font-size: 13px;
  color: #1E3A5C;
  font-weight: 500;
  line-height: 1.4;
}
.sl-mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }

/* PIC */
.sl-pic-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.sl-pic-item {
  background: #fff;
  border: 1px solid #E3EAF3;
  border-radius: 4px;
  padding: 10px 14px;
  min-width: 200px;
  flex: 1;
  max-width: 320px;
}
.sl-pic-name {
  font-size: 13px;
  font-weight: 700;
  color: #0B1D35;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sl-pic-utama {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: #ECFDF5;
  color: #065F46;
  padding: 1px 6px;
  border-radius: 2px;
}
.sl-pic-sub {
  font-size: 11px;
  color: #7A8FA6;
  margin-top: 2px;
}
.sl-pic-contacts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}
.sl-pic-contact {
  font-size: 11px;
  color: #2D4A6A;
}
.sl-wa-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #16a34a;
  text-decoration: none;
  padding: 3px 8px;
  border-radius: 4px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  transition: background 0.12s, border-color 0.12s;
  width: fit-content;
}
.sl-wa-link:hover { background: #dcfce7; border-color: #86efac; }
.sl-wa-icon { display: flex; align-items: center; color: #16a34a; }

/* GPS actions */
.sl-gps-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.sl-gps-actions {
  display: flex;
  gap: 6px;
}
.sl-gps-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 4px;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.12s;
}
.sl-gps-share {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}
.sl-gps-share:hover { background: #dbeafe; }
.sl-gps-route {
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
}
.sl-gps-route:hover { background: #dcfce7; }

/* Table */
.sl-table-wrap { overflow-x: auto; }
.sl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 700px;
}
.sl-table th {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #9EB3C9;
  padding: 6px 8px;
  text-align: left;
  background: #F0F4F9;
  border-bottom: 1px solid #E3EAF3;
}
.sl-table td {
  padding: 9px 8px;
  color: #1E3A5C;
  border-bottom: 1px solid #F0F4F9;
  vertical-align: middle;
}
.sl-table tr:last-child td { border-bottom: none; }
.sl-mono-sm { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; color: #5A7184; }
.sl-badge-type {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  background: #EEF2F7;
  color: #5A7184;
  padding: 2px 7px;
  border-radius: 2px;
  white-space: nowrap;
}
.sl-badge-status {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 2px;
}
.badge-aktif { background: #ECFDF5; color: #065F46; }
.badge-na    { background: #F1F5F9; color: #64748B; }

/* ── States ───────────────────────────────────────────────── */
.sl-state {
  max-width: 1100px;
  margin: 60px auto;
  padding: 0 32px;
  text-align: center;
  font-size: 13px;
  color: #9EB3C9;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.sl-error {
  max-width: 1100px;
  margin: 24px auto 0;
  padding: 0 32px;
}

.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid #C5D4E8;
  border-top-color: #1456A6;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .sl-header { padding: 16px 16px 0; }
  .sl-toolbar { padding-bottom: 12px; }
  .sl-list { padding: 0 12px; margin-top: 16px; }
  .sl-section { padding: 12px 14px; }
}
</style>
