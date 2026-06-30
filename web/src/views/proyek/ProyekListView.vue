<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProyekStore } from '@/stores/proyek'
import { useMasterStore } from '@/stores/master'
import api from '@/services/api'

const router = useRouter()
const proyek = useProyekStore()
const master = useMasterStore()

const filterStatus = ref('')
const page = ref(1)

// Modal tambah project
const showModal = ref(false)
const form = ref({ id_opportunity: 0, id_site: 0, id_pm: 0, id_kontrak: null as number | null, tgl_mulai: '', tgl_target_selesai: '', catatan: '' })
const submitting = ref(false)
const formError = ref('')

// Opportunity search (simple — user types ID)
const oppId = ref('')

const STATUS_LIST = ['Perencanaan', 'Instalasi', 'Testing', 'Selesai', 'Ditahan']
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Perencanaan: { bg: '#eff6ff', color: '#1d4ed8' },
  Instalasi:   { bg: '#fef9c3', color: '#a16207' },
  Testing:     { bg: '#fff7ed', color: '#c2410c' },
  Selesai:     { bg: '#f0fdf4', color: '#15803d' },
  Ditahan:     { bg: '#fef2f2', color: '#dc2626' },
}

onMounted(async () => {
  await Promise.all([proyek.fetchSummary(), proyek.fetchPmList(), proyek.fetchSiteList()])
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (filterStatus.value) params.status_project = filterStatus.value
  proyek.fetchList(params)
}
function doFilter() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

async function handleSubmit() {
  if (!form.value.id_opportunity || !form.value.id_site || !form.value.id_pm) {
    formError.value = 'Opportunity ID, Site, dan PM wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const result = await proyek.create({
      id_opportunity: Number(form.value.id_opportunity),
      id_site: form.value.id_site,
      id_pm: form.value.id_pm,
      id_kontrak: form.value.id_kontrak || undefined,
      tgl_mulai: form.value.tgl_mulai || undefined,
      tgl_target_selesai: form.value.tgl_target_selesai || undefined,
      catatan: form.value.catatan || undefined,
    })
    showModal.value = false
    router.push(`/projects/${result.id_project}`)
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Terjadi kesalahan'
  } finally { submitting.value = false }
}

async function hapusProyek(id: number, nomor: string) {
  if (!confirm(`Hapus project "${nomor}" ini?`)) return
  try {
    await api.delete(`/projects/${id}`)
    await proyek.fetchSummary()
    fetchData()
  } catch (e: any) {
    alert(e.response?.data?.message || 'Gagal menghapus project')
  }
}

function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Proyek</h2>
        <p class="sub">Delivery project instalasi & implementasi</p>
      </div>
      <button class="btn-primary" @click="showModal = true">+ Buat Project</button>
    </div>

    <!-- Summary chips -->
    <div class="summary-row">
      <div
        v-for="s in proyek.summary" :key="s.status"
        class="summary-chip"
        :style="{ borderLeftColor: STATUS_COLOR[s.status]?.color || '#94a3b8' }"
        @click="filterStatus = filterStatus === s.status ? '' : s.status; doFilter()"
      >
        <div class="sc-count">{{ s.count }}</div>
        <div class="sc-label">{{ s.status }}</div>
      </div>
    </div>

    <!-- Filter pills -->
    <div class="filter-pills">
      <button :class="['pill', { active: filterStatus === '' }]" @click="filterStatus = ''; doFilter()">Semua</button>
      <button
        v-for="s in STATUS_LIST" :key="s"
        :class="['pill', { active: filterStatus === s }]"
        @click="filterStatus = s; doFilter()"
      >{{ s }}</button>
    </div>

    <div v-if="proyek.error" class="alert-error">{{ proyek.error }}</div>

    <div class="table-card">
      <div v-if="proyek.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>No. Project</th>
            <th>Site</th>
            <th>Opportunity</th>
            <th>PM</th>
            <th>Status</th>
            <th>Tgl Mulai</th>
            <th>Target Selesai</th>
            <th>WO</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!proyek.list.length">
            <td colspan="9" class="empty">Tidak ada project</td>
          </tr>
          <tr
            v-for="p in proyek.list" :key="p.id_project"
            class="row-link"
            @click="router.push(`/projects/${p.id_project}`)"
          >
            <td class="fw700">{{ p.nomor_project }}</td>
            <td>
              <div class="fw600">{{ p.site?.nama_site }}</div>
              <div class="text-gray text-sm">{{ p.site?.kota }}</div>
            </td>
            <td class="text-gray">{{ p.opportunity?.lead?.nama_perusahaan || p.opportunity?.lead?.nama_prospek }}</td>
            <td class="text-gray">{{ p.pm?.nama_lengkap }}</td>
            <td>
              <span class="status-badge"
                :style="{ background: STATUS_COLOR[p.status_project]?.bg, color: STATUS_COLOR[p.status_project]?.color }">
                {{ p.status_project }}
              </span>
            </td>
            <td class="text-gray text-sm">{{ fmtDate(p.tgl_mulai) }}</td>
            <td class="text-gray text-sm">{{ fmtDate(p.tgl_target_selesai) }}</td>
            <td class="center">{{ p._count?.work_orders ?? 0 }}</td>
            <td @click.stop>
              <button
                v-if="p.status_project === 'Perencanaan'"
                class="btn-hapus"
                @click="hapusProyek(p.id_project, p.nomor_project)"
              >Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="proyek.meta.total_pages > 1" class="pagination">
        <button v-for="p in proyek.meta.total_pages" :key="p"
          :class="['page-btn', { active: p === proyek.meta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="proyek.meta.total">Total: {{ proyek.meta.total }} project</div>
    </div>

    <!-- Modal Buat Project -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Buat Project Baru</h3>
        <div class="form-grid">
          <div class="field full">
            <label>ID Opportunity <span class="req">*</span></label>
            <input v-model.number="form.id_opportunity" type="number" placeholder="ID opportunity dari Sales" />
            <span class="hint">Cek di modul Sales → Opportunity</span>
          </div>
          <div class="field full">
            <label>Site <span class="req">*</span></label>
            <select v-model="form.id_site">
              <option :value="0">— Pilih Site —</option>
              <option v-for="s in proyek.siteList" :key="s.id_site" :value="s.id_site">
                [{{ s.kode_site }}] {{ s.nama_site }} — {{ s.pelanggan?.nama_pelanggan }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Project Manager <span class="req">*</span></label>
            <select v-model="form.id_pm">
              <option :value="0">— Pilih PM —</option>
              <option v-for="p in proyek.pmList" :key="p.id_karyawan" :value="p.id_karyawan">
                {{ p.nama_lengkap }} — {{ p.jabatan }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>ID Kontrak <span class="field-hint">(opsional)</span></label>
            <input v-model.number="form.id_kontrak" type="number" min="1" placeholder="Isi jika sudah ada kontrak terkait" />
          </div>
          <div class="field">
            <label>Tgl Mulai</label>
            <input v-model="form.tgl_mulai" type="date" />
          </div>
          <div class="field">
            <label>Target Selesai</label>
            <input v-model="form.tgl_target_selesai" type="date" />
          </div>
          <div class="field full">
            <label>Catatan</label>
            <textarea v-model="form.catatan" rows="2" placeholder="Opsional"></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Membuat...' : 'Buat Project' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.summary-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.summary-chip { background: #fff; border-radius: 8px; padding: 12px 16px; border-left: 4px solid #94a3b8; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; min-width: 100px; }
.summary-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.sc-count { font-size: 22px; font-weight: 800; color: #0f172a; }
.sc-label { font-size: 12px; color: #64748b; }

.filter-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.pill { padding: 6px 14px; border: 1.5px solid #e2e8f0; border-radius: 20px; font-size: 13px; font-weight: 600; background: #fff; color: #64748b; cursor: pointer; }
.pill.active { background: #1e40af; color: #fff; border-color: #1e40af; }

.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw600 { font-weight: 600; }
.fw700 { font-weight: 700; color: #1d4ed8; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.center { text-align: center; }
.row-link { cursor: pointer; }
.row-link:hover td { background: #f8fafc; }
.status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }

.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }
.btn-hapus { padding: 4px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 540px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field-hint { font-size: 11px; color: #94a3b8; font-weight: 400; }
.req { color: #ef4444; }
.hint { font-size: 11px; color: #94a3b8; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 4px 0 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
