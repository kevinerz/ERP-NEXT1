<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSalesStore } from '@/stores/sales'
import { useMasterStore } from '@/stores/master'

const router = useRouter()
const route = useRoute()
const sales = useSalesStore()
const master = useMasterStore()
const id = Number(route.params.id)

// Edit lead modal
const showEditLead = ref(false)
const editForm = ref<any>({})
const editSubmitting = ref(false)
const editError = ref('')

// Add Opportunity modal
const showAddOpp = ref(false)
const oppForm = ref({ nama_opportunity: '', id_layanan: 0, estimasi_nilai: 0, tahapan: 'Prospecting', tgl_target_close: '', catatan: '' })
const oppSubmitting = ref(false)
const oppError = ref('')

// Add Activity modal
const showAddActivity = ref(false)
const actForm = ref({ jenis_aktivitas: 'Call', tanggal_aktivitas: new Date().toISOString().substring(0, 16), ringkasan: '', hasil: 'Netral' })
const actSubmitting = ref(false)
const actError = ref('')

const successMsg = ref('')

const STATUS_LEAD = ['Baru', 'Dihubungi', 'Qualified', 'Tidak Tertarik', 'Konversi']
const SUMBER_LEAD = ['Referral', 'Cold Call', 'Website', 'Media Sosial', 'Pameran', 'Lainnya']
const TAHAPAN_OPP = ['Prospecting', 'Presentasi', 'Survey', 'Negosiasi', 'Penawaran', 'Won', 'Lost']
const JENIS_AKTIVITAS = ['Call', 'Meeting', 'Email', 'WhatsApp', 'Site Visit', 'Presentasi', 'Lainnya']
const HASIL = ['Positif', 'Negatif', 'Netral']

const TAHAPAN_COLOR: Record<string, string> = {
  Prospecting: '#3b82f6', Presentasi: '#8b5cf6', Survey: '#f59e0b',
  Negosiasi: '#f97316', Penawaran: '#06b6d4', Won: '#22c55e', Lost: '#ef4444',
}

onMounted(async () => {
  await Promise.all([
    sales.fetchOneLead(id),
    sales.fetchSalesList(),
    master.fetchLayanan(),
  ])
})

function openEditLead() {
  const l = sales.currentLead
  editForm.value = {
    nama_prospek: l.nama_prospek,
    nama_perusahaan: l.nama_perusahaan || '',
    no_kontak: l.no_kontak || '',
    email: l.email || '',
    sumber_lead: l.sumber_lead,
    status_lead: l.status_lead,
    id_sales_pic: l.id_sales_pic,
    catatan_awal: l.catatan_awal || '',
  }
  editError.value = ''
  showEditLead.value = true
}

async function handleEditLead() {
  editSubmitting.value = true; editError.value = ''
  try {
    await sales.updateLead(id, editForm.value)
    await sales.fetchOneLead(id)
    showEditLead.value = false
    flash('Lead diperbarui')
  } catch (e: any) { editError.value = e.response?.data?.message || 'Gagal' }
  finally { editSubmitting.value = false }
}

async function handleAddOpp() {
  if (!oppForm.value.nama_opportunity) { oppError.value = 'Nama opportunity wajib diisi'; return }
  oppSubmitting.value = true; oppError.value = ''
  try {
    await sales.createOpportunity({
      id_lead: id,
      id_sales_pic: sales.currentLead.id_sales_pic,
      nama_opportunity: oppForm.value.nama_opportunity,
      id_layanan: oppForm.value.id_layanan || undefined,
      estimasi_nilai: oppForm.value.estimasi_nilai || 0,
      tahapan: oppForm.value.tahapan,
      tgl_target_close: oppForm.value.tgl_target_close || undefined,
      catatan: oppForm.value.catatan || undefined,
    })
    await sales.fetchOneLead(id)
    showAddOpp.value = false
    oppForm.value = { nama_opportunity: '', id_layanan: 0, estimasi_nilai: 0, tahapan: 'Prospecting', tgl_target_close: '', catatan: '' }
    flash('Opportunity dibuat')
  } catch (e: any) { oppError.value = e.response?.data?.message || 'Gagal' }
  finally { oppSubmitting.value = false }
}

async function handleAddActivity() {
  if (!actForm.value.ringkasan) { actError.value = 'Ringkasan wajib diisi'; return }
  actSubmitting.value = true; actError.value = ''
  try {
    await sales.createActivity({
      id_lead: id,
      id_sales_pic: sales.currentLead.id_sales_pic,
      jenis_aktivitas: actForm.value.jenis_aktivitas,
      tanggal_aktivitas: new Date(actForm.value.tanggal_aktivitas).toISOString(),
      ringkasan: actForm.value.ringkasan,
      hasil: actForm.value.hasil,
    })
    await sales.fetchOneLead(id)
    showAddActivity.value = false
    actForm.value = { jenis_aktivitas: 'Call', tanggal_aktivitas: new Date().toISOString().substring(0, 16), ringkasan: '', hasil: 'Netral' }
    flash('Aktivitas dicatat')
  } catch (e: any) { actError.value = e.response?.data?.message || 'Gagal' }
  finally { actSubmitting.value = false }
}

function flash(msg: string) {
  successMsg.value = msg
  setTimeout(() => successMsg.value = '', 3000)
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDatetime(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="page">
    <div v-if="sales.loading && !sales.currentLead" class="loading-page">Memuat...</div>
    <template v-else-if="sales.currentLead">
      <!-- Header -->
      <div class="page-header">
        <div>
          <button class="btn-back" @click="router.push('/sales/lead')">← Lead</button>
          <h2>{{ sales.currentLead.nama_prospek }}</h2>
          <p class="sub">{{ sales.currentLead.nama_perusahaan || 'Perorangan' }}</p>
        </div>
        <button class="btn-edit-lead" @click="openEditLead">Edit Lead</button>
      </div>

      <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>

      <div class="two-col">
        <!-- Info lead -->
        <div class="info-card">
          <div class="card-title">Informasi Lead</div>
          <div class="info-row"><span class="info-label">Status</span>
            <span class="status-chip">{{ sales.currentLead.status_lead }}</span>
          </div>
          <div class="info-row"><span class="info-label">Sumber</span><span>{{ sales.currentLead.sumber_lead }}</span></div>
          <div class="info-row"><span class="info-label">No. Kontak</span><span>{{ sales.currentLead.no_kontak || '—' }}</span></div>
          <div class="info-row"><span class="info-label">Email</span><span>{{ sales.currentLead.email || '—' }}</span></div>
          <div class="info-row"><span class="info-label">Sales PIC</span><span>{{ sales.currentLead.sales_pic?.nama_lengkap }}</span></div>
          <div class="info-row"><span class="info-label">Tanggal</span><span>{{ fmtDate(sales.currentLead.created_at) }}</span></div>
          <div v-if="sales.currentLead.catatan_awal" class="catatan-box">{{ sales.currentLead.catatan_awal }}</div>
        </div>

        <!-- Opportunity -->
        <div class="section-card">
          <div class="section-header">
            <span class="card-title">Opportunity ({{ sales.currentLead.opportunities?.length ?? 0 }})</span>
            <button class="btn-add-small" @click="showAddOpp = true">+ Tambah</button>
          </div>
          <div v-if="!sales.currentLead.opportunities?.length" class="empty-section">Belum ada opportunity</div>
          <div
            v-for="o in sales.currentLead.opportunities" :key="o.id_opportunity"
            class="opp-item"
            @click="router.push(`/sales/opportunity/${o.id_opportunity}`)"
          >
            <div class="opp-name">{{ o.nama_opportunity }}</div>
            <div class="opp-meta">
              <span class="tahapan-chip" :style="{ background: TAHAPAN_COLOR[o.tahapan] + '20', color: TAHAPAN_COLOR[o.tahapan] }">
                {{ o.tahapan }}
              </span>
              <span class="opp-nilai">{{ fmt(Number(o.estimasi_nilai)) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Aktivitas -->
      <div class="section-card mt16">
        <div class="section-header">
          <span class="card-title">Aktivitas ({{ sales.currentLead.activities?.length ?? 0 }})</span>
          <button class="btn-add-small" @click="showAddActivity = true">+ Catat</button>
        </div>
        <div v-if="!sales.currentLead.activities?.length" class="empty-section">Belum ada aktivitas</div>
        <div v-for="a in sales.currentLead.activities" :key="a.id_activity" class="activity-item">
          <div class="act-left">
            <span class="act-jenis">{{ a.jenis_aktivitas }}</span>
            <span class="act-date">{{ fmtDatetime(a.tanggal_aktivitas) }}</span>
          </div>
          <div class="act-right">
            <p class="act-ringkasan">{{ a.ringkasan }}</p>
            <span :class="['act-hasil', `hasil-${a.hasil?.toLowerCase()}`]">{{ a.hasil }}</span>
          </div>
        </div>
      </div>

      <!-- Modal Edit Lead -->
      <div v-if="showEditLead" class="modal-overlay" @click.self="showEditLead = false">
        <div class="modal">
          <h3>Edit Lead</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Nama Prospek</label>
              <input v-model="editForm.nama_prospek" />
            </div>
            <div class="field full">
              <label>Nama Perusahaan</label>
              <input v-model="editForm.nama_perusahaan" />
            </div>
            <div class="field">
              <label>No. Kontak</label>
              <input v-model="editForm.no_kontak" />
            </div>
            <div class="field">
              <label>Email</label>
              <input v-model="editForm.email" type="email" />
            </div>
            <div class="field">
              <label>Sumber</label>
              <select v-model="editForm.sumber_lead">
                <option v-for="s in SUMBER_LEAD" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="field">
              <label>Status</label>
              <select v-model="editForm.status_lead">
                <option v-for="s in STATUS_LEAD" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="field">
              <label>Sales PIC</label>
              <select v-model="editForm.id_sales_pic">
                <option v-for="s in sales.salesList" :key="s.id_karyawan" :value="s.id_karyawan">{{ s.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Catatan Awal</label>
              <textarea v-model="editForm.catatan_awal" rows="3"></textarea>
            </div>
          </div>
          <p v-if="editError" class="form-error">{{ editError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showEditLead = false">Batal</button>
            <button class="btn-submit" @click="handleEditLead" :disabled="editSubmitting">
              {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Add Opportunity -->
      <div v-if="showAddOpp" class="modal-overlay" @click.self="showAddOpp = false">
        <div class="modal">
          <h3>Tambah Opportunity</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Nama Opportunity <span class="req">*</span></label>
              <input v-model="oppForm.nama_opportunity" placeholder="Contoh: Internet 100Mbps FO - PT ABC" />
            </div>
            <div class="field">
              <label>Layanan</label>
              <select v-model="oppForm.id_layanan">
                <option :value="0">— Pilih Layanan —</option>
                <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">
                  {{ l.kode_layanan }} - {{ l.nama_layanan }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Tahapan</label>
              <select v-model="oppForm.tahapan">
                <option v-for="t in TAHAPAN_OPP" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="field">
              <label>Estimasi Nilai (Rp)</label>
              <input v-model.number="oppForm.estimasi_nilai" type="number" placeholder="0" />
            </div>
            <div class="field">
              <label>Target Close</label>
              <input v-model="oppForm.tgl_target_close" type="date" />
            </div>
            <div class="field full">
              <label>Catatan</label>
              <textarea v-model="oppForm.catatan" rows="2"></textarea>
            </div>
          </div>
          <p v-if="oppError" class="form-error">{{ oppError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showAddOpp = false">Batal</button>
            <button class="btn-submit" @click="handleAddOpp" :disabled="oppSubmitting">
              {{ oppSubmitting ? 'Menyimpan...' : 'Buat Opportunity' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Add Activity -->
      <div v-if="showAddActivity" class="modal-overlay" @click.self="showAddActivity = false">
        <div class="modal">
          <h3>Catat Aktivitas</h3>
          <div class="form-grid">
            <div class="field">
              <label>Jenis</label>
              <select v-model="actForm.jenis_aktivitas">
                <option v-for="j in JENIS_AKTIVITAS" :key="j" :value="j">{{ j }}</option>
              </select>
            </div>
            <div class="field">
              <label>Tanggal & Waktu</label>
              <input v-model="actForm.tanggal_aktivitas" type="datetime-local" />
            </div>
            <div class="field full">
              <label>Ringkasan <span class="req">*</span></label>
              <textarea v-model="actForm.ringkasan" rows="3" placeholder="Hasil diskusi, tindak lanjut..."></textarea>
            </div>
            <div class="field">
              <label>Hasil</label>
              <select v-model="actForm.hasil">
                <option v-for="h in HASIL" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
          <p v-if="actError" class="form-error">{{ actError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showAddActivity = false">Batal</button>
            <button class="btn-submit" @click="handleAddActivity" :disabled="actSubmitting">
              {{ actSubmitting ? 'Menyimpan...' : 'Catat' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1000px; }
.loading-page { padding: 60px; text-align: center; color: #94a3b8; }
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-edit-lead { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 16px; }

.two-col { display: grid; grid-template-columns: 300px 1fr; gap: 16px; }
.info-card, .section-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.mt16 { margin-top: 16px; }
.card-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px; display: block; }
.info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #0f172a; }
.info-label { color: #64748b; font-size: 13px; }
.status-chip { background: #eff6ff; color: #1d4ed8; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.catatan-box { margin-top: 12px; padding: 10px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #475569; }

.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.btn-add-small { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.empty-section { color: #94a3b8; font-size: 13px; padding: 12px 0; }

.opp-item { padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: background 0.15s; }
.opp-item:hover { background: #f8fafc; }
.opp-name { font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 6px; }
.opp-meta { display: flex; align-items: center; gap: 10px; }
.tahapan-chip { padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.opp-nilai { font-size: 12px; color: #64748b; }

.activity-item { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
.act-left { min-width: 160px; }
.act-jenis { display: block; font-size: 13px; font-weight: 700; color: #1d4ed8; margin-bottom: 4px; }
.act-date { font-size: 11px; color: #94a3b8; }
.act-right { flex: 1; }
.act-ringkasan { margin: 0 0 6px; font-size: 14px; color: #0f172a; }
.act-hasil { padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.hasil-positif { background: #f0fdf4; color: #15803d; }
.hasil-negatif { background: #fef2f2; color: #dc2626; }
.hasil-netral { background: #f1f5f9; color: #64748b; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 540px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 20px; font-size: 18px; color: #0f172a; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.full { grid-column: 1 / -1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 8px 12px; margin: 4px 0 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-submit { padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
