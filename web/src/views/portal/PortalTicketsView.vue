<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import portalApi from '@/services/portalApi'

const route  = useRoute()
const router = useRouter()

const tickets = ref<any[]>([])
const meta    = ref({ total: 0, page: 1, limit: 20, total_pages: 1 })
const loading = ref(true)
const status  = ref((route.query.status as string) || '')
const id_site = ref((route.query.id_site as string) || '')
const page    = ref(1)
const selected = ref<any>(null)

onMounted(fetchTickets)
watch([status, id_site], () => { page.value = 1; fetchTickets() })

async function fetchTickets() {
  loading.value = true
  try {
    const params: any = { page: page.value, limit: 20 }
    if (status.value)  params.status  = status.value
    if (id_site.value) params.id_site = id_site.value
    const res = await portalApi.get('/portal/tickets', { params })
    tickets.value = res.data.data
    meta.value    = res.data.meta
  } finally { loading.value = false }
}

function goPage(p: number) { page.value = p; fetchTickets() }

async function openDetail(t: any) {
  const res = await portalApi.get(`/portal/tickets/${t.id_ticket}`)
  selected.value = res.data.data
}

const STATUS_LIST = ['', 'Open', 'In_Progress', 'Resolved', 'Closed']
const STATUS_LABEL: Record<string, string> = {
  '': 'Semua', Open: 'Open', In_Progress: 'Dalam Proses', Resolved: 'Resolved', Closed: 'Closed',
}

function statusCls(s: string) {
  if (s === 'Open')        return 'st-open'
  if (s === 'In_Progress') return 'st-inprogress'
  if (s === 'Resolved')    return 'st-resolved'
  if (s === 'Closed')      return 'st-closed'
  return ''
}

function prioritasCls(p: string) {
  if (p === 'Critical') return 'pri-critical'
  if (p === 'High')     return 'pri-high'
  if (p === 'Medium')   return 'pri-medium'
  return 'pri-low'
}

function fmtDatetime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Tiket Support</h2>
    </div>

    <!-- Filter -->
    <div class="filters">
      <div class="filter-group">
        <label>Status</label>
        <div class="seg-control">
          <button v-for="s in STATUS_LIST" :key="s" :class="['seg-btn', { active: status === s }]" @click="status = s">
            {{ STATUS_LABEL[s] }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Memuat tiket...</div>

    <div class="ticket-list" v-else>
      <div v-if="!tickets.length" class="empty">Tidak ada tiket ditemukan.</div>

      <div v-for="t in tickets" :key="t.id_ticket" class="ticket-row" @click="openDetail(t)">
        <div class="ticket-top">
          <span class="ticket-num">{{ t.nomor_tiket }}</span>
          <span :class="['badge-status', statusCls(t.status)]">{{ STATUS_LABEL[t.status] || t.status }}</span>
          <span :class="['badge-pri', prioritasCls(t.prioritas)]">{{ t.prioritas }}</span>
          <span class="ticket-site">{{ t.site?.nama_site }}</span>
        </div>
        <div class="ticket-title">{{ t.judul }}</div>
        <div class="ticket-meta">
          <span>Dibuka: {{ fmtDatetime(t.tgl_open) }}</span>
          <span v-if="t.sla_due">· SLA: {{ fmtDatetime(t.sla_due) }}</span>
          <span v-if="t.sla_breached" class="sla-breach">⚠ SLA Breached</span>
          <span v-if="t.update_terakhir" class="last-update">Update: {{ fmtDatetime(t.update_terakhir.created_at) }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="meta.total_pages > 1" class="pagination">
      <button v-for="p in meta.total_pages" :key="p" :class="['page-btn', { active: p === meta.page }]" @click="goPage(p)">{{ p }}</button>
    </div>

    <!-- Detail modal -->
    <div v-if="selected" class="modal-overlay" @click.self="selected = null">
      <div class="modal">
        <div class="modal-header">
          <div>
            <div class="modal-num">{{ selected.nomor_tiket }}</div>
            <h3>{{ selected.judul_tiket }}</h3>
          </div>
          <button class="btn-close" @click="selected = null">✕</button>
        </div>

        <div class="detail-badges">
          <span :class="['badge-status', statusCls(selected.status_tiket)]">{{ STATUS_LABEL[selected.status_tiket] || selected.status_tiket }}</span>
          <span :class="['badge-pri', prioritasCls(selected.prioritas)]">{{ selected.prioritas }}</span>
          <span v-if="selected.sla_breached" class="sla-breach">⚠ SLA Breached</span>
        </div>

        <dl class="detail-dl">
          <div><dt>Site</dt><dd>{{ selected.site?.nama_site }} ({{ selected.site?.kode_site }})</dd></div>
          <div><dt>Dibuka</dt><dd>{{ fmtDatetime(selected.tgl_open) }}</dd></div>
          <div v-if="selected.sla_due"><dt>SLA Due</dt><dd>{{ fmtDatetime(selected.sla_due) }}</dd></div>
          <div v-if="selected.tgl_resolved"><dt>Resolved</dt><dd>{{ fmtDatetime(selected.tgl_resolved) }}</dd></div>
        </dl>

        <div v-if="selected.deskripsi_masalah" class="detail-desc">
          <div class="desc-title">Deskripsi Masalah</div>
          <p>{{ selected.deskripsi_masalah }}</p>
        </div>

        <div v-if="selected.logs?.length" class="logs">
          <div class="logs-title">Riwayat Update ({{ selected.logs.length }})</div>
          <div v-for="log in selected.logs" :key="log.id_log" class="log-item">
            <div class="log-meta">
              <span class="log-user">{{ log.nama_user || 'Tim NEXT ONE' }}</span>
              <span class="log-time">{{ fmtDatetime(log.created_at) }}</span>
            </div>
            <div class="log-msg">{{ log.pesan }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page        { padding: 28px 32px; max-width: 900px; }
.page-header h2 { margin: 0 0 20px; font-size: 22px; color: #0f172a; font-weight: 800; }
.loading { padding: 60px; text-align: center; color: #94a3b8; }
.empty   { padding: 60px; text-align: center; color: #94a3b8; }

.filters   { margin-bottom: 20px; }
.filter-group { display: flex; align-items: center; gap: 12px; }
.filter-group label { font-size: 13px; font-weight: 600; color: #374151; }
.seg-control { display: flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 8px; }
.seg-btn     { padding: 5px 12px; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; background: transparent; cursor: pointer; color: #64748b; }
.seg-btn.active { background: #fff; color: #0f172a; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

.ticket-list { display: flex; flex-direction: column; gap: 8px; }
.ticket-row  { background: #fff; border-radius: 10px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); cursor: pointer; }
.ticket-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.ticket-top  { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.ticket-num  { font-size: 12px; font-family: monospace; color: #64748b; }
.ticket-title { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 6px; }
.ticket-meta  { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; flex-wrap: wrap; }
.ticket-site  { font-size: 12px; color: #3b82f6; font-weight: 600; margin-left: auto; }
.sla-breach   { color: #dc2626; font-weight: 700; }
.last-update  { color: #94a3b8; margin-left: auto; }

.badge-status { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.st-open        { background: #eff6ff; color: #1d4ed8; }
.st-inprogress  { background: #fefce8; color: #854d0e; }
.st-resolved    { background: #f0fdf4; color: #15803d; }
.st-closed      { background: #f8fafc; color: #64748b; }
.badge-pri      { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.pri-critical   { background: #fef2f2; color: #dc2626; }
.pri-high       { background: #fff7ed; color: #c2410c; }
.pri-medium     { background: #fffbeb; color: #b45309; }
.pri-low        { background: #f8fafc; color: #64748b; }

.pagination { display: flex; gap: 6px; padding: 20px 0; justify-content: center; }
.page-btn   { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: flex-start; justify-content: center; z-index: 100; padding: 40px 16px; overflow-y: auto; }
.modal        { background: #fff; border-radius: 14px; padding: 28px 32px; width: 620px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 12px; }
.modal-header h3 { margin: 4px 0 0; font-size: 18px; color: #0f172a; }
.modal-num  { font-size: 12px; font-family: monospace; color: #64748b; }
.btn-close  { padding: 4px 10px; background: #f1f5f9; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; color: #64748b; flex-shrink: 0; }
.detail-badges { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.detail-dl  { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; background: #f8fafc; border-radius: 8px; padding: 14px; }
.detail-dl > div { display: flex; gap: 12px; }
dt { font-size: 12px; font-weight: 600; color: #64748b; width: 80px; flex-shrink: 0; }
dd { font-size: 13px; color: #0f172a; margin: 0; }
.detail-desc { margin-bottom: 16px; }
.desc-title  { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
.detail-desc p { font-size: 14px; color: #374151; margin: 0; white-space: pre-wrap; }
.logs        { border-top: 1px solid #f1f5f9; padding-top: 16px; }
.logs-title  { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 10px; }
.log-item    { border-top: 1px solid #f8fafc; padding: 10px 0; }
.log-item:first-child { border-top: none; }
.log-meta    { display: flex; justify-content: space-between; margin-bottom: 4px; }
.log-user    { font-size: 12px; font-weight: 600; color: #374151; }
.log-time    { font-size: 11px; color: #94a3b8; }
.log-msg     { font-size: 13px; color: #0f172a; white-space: pre-wrap; }
</style>
