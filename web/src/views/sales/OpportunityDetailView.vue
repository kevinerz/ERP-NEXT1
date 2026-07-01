<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/services/api'
import { useSalesStore } from '@/stores/sales'
import { useMasterStore } from '@/stores/master'

const router = useRouter()
const route = useRoute()
const sales = useSalesStore()
const master = useMasterStore()
const id = Number(route.params.id)

// Edit opportunity
const showEditOpp = ref(false)
const editForm = ref<any>({})
const editSubmitting = ref(false)
const editError = ref('')

// Add Quotation
const showAddQt = ref(false)
const qtForm = ref({ tgl_quotation: new Date().toISOString().substring(0, 10), tgl_berlaku_sampai: '', harga_mrc: 0, harga_otc: 0, catatan: '' })
const qtSubmitting = ref(false)
const qtError = ref('')

// Approve Quotation
const showApprove = ref(false)
const approveId = ref(0)
const approveForm = ref({ status_approval: 'Approved', id_approver: 0, catatan_approval: '' })
const approveSubmitting = ref(false)

// Buat Site dari Opportunity
const showBuatSite = ref(false)
const siteForm = ref({ id_pelanggan: 0, kode_site: '', nama_site: '', alamat_lengkap: '', kota: '', status_site: 'Prospek' })
const siteSubmitting = ref(false)
const siteError = ref('')

// Add / Edit Activity
const showAddActivity = ref(false)
const editingActivityId = ref<number | null>(null)
const actForm = ref({ jenis_aktivitas: 'Call', tanggal_aktivitas: new Date().toISOString().substring(0, 16), ringkasan: '', hasil: 'Netral' })
const actSubmitting = ref(false)
const actError = ref('')

const successMsg = ref('')

const TAHAPAN = ['Prospecting', 'Presentasi', 'Survey', 'Negosiasi', 'Penawaran', 'Won', 'Lost']
const JENIS_AKTIVITAS = ['Call', 'Meeting', 'Email', 'WhatsApp', 'Site Visit', 'Presentasi', 'Lainnya']
const HASIL = ['Positif', 'Negatif', 'Netral']
const TAHAPAN_COLOR: Record<string, string> = {
  Prospecting: '#3b82f6', Presentasi: '#8b5cf6', Survey: '#f59e0b',
  Negosiasi: '#f97316', Penawaran: '#06b6d4', Won: '#22c55e', Lost: '#ef4444',
}
const QT_STATUS_COLOR: Record<string, string> = {
  Draft: '#64748b', Approved: '#15803d', Rejected: '#dc2626',
}

onMounted(async () => {
  await Promise.all([
    sales.fetchOneOpportunity(id),
    sales.fetchSalesList(),
    master.fetchLayanan(),
    master.fetchPelangganDropdown(),
  ])
  if (sales.salesList.length) approveForm.value.id_approver = sales.salesList[0].id_karyawan
})

function openEditOpp() {
  const o = sales.currentOpp
  editForm.value = {
    nama_opportunity: o.nama_opportunity,
    id_layanan: o.id_layanan || 0,
    id_sales_pic: o.id_sales_pic,
    estimasi_nilai: Number(o.estimasi_nilai),
    tahapan: o.tahapan,
    alasan_lost: o.alasan_lost || '',
    tgl_target_close: o.tgl_target_close ? o.tgl_target_close.substring(0, 10) : '',
    catatan: o.catatan || '',
  }
  editError.value = ''
  showEditOpp.value = true
}

async function handleEditOpp() {
  editSubmitting.value = true; editError.value = ''
  try {
    await sales.updateOpportunity(id, {
      ...editForm.value,
      id_layanan: editForm.value.id_layanan || undefined,
      tgl_target_close: editForm.value.tgl_target_close || undefined,
      alasan_lost: editForm.value.alasan_lost || undefined,
    })
    await sales.fetchOneOpportunity(id)
    showEditOpp.value = false
    flash('Opportunity diperbarui')
  } catch (e: any) { editError.value = e.response?.data?.message || 'Gagal' }
  finally { editSubmitting.value = false }
}

async function handleAddQt() {
  qtSubmitting.value = true; qtError.value = ''
  try {
    await sales.createQuotation({
      id_opportunity: id,
      id_sales_pic: sales.currentOpp.id_sales_pic,
      tgl_quotation: qtForm.value.tgl_quotation,
      tgl_berlaku_sampai: qtForm.value.tgl_berlaku_sampai || undefined,
      harga_mrc: qtForm.value.harga_mrc,
      harga_otc: qtForm.value.harga_otc,
      catatan: qtForm.value.catatan || undefined,
    })
    await sales.fetchOneOpportunity(id)
    showAddQt.value = false
    qtForm.value = { tgl_quotation: new Date().toISOString().substring(0, 10), tgl_berlaku_sampai: '', harga_mrc: 0, harga_otc: 0, catatan: '' }
    flash('Quotation dibuat')
  } catch (e: any) { qtError.value = e.response?.data?.message || 'Gagal' }
  finally { qtSubmitting.value = false }
}

function openApprove(qtId: number) {
  approveId.value = qtId
  approveForm.value = { status_approval: 'Approved', id_approver: sales.salesList[0]?.id_karyawan || 0, catatan_approval: '' }
  showApprove.value = true
}

async function handleApprove() {
  approveSubmitting.value = true
  try {
    await sales.approveQuotation(approveId.value, approveForm.value)
    await sales.fetchOneOpportunity(id)
    showApprove.value = false
    flash(`Quotation ${approveForm.value.status_approval}`)
  } catch (e: any) { flash('Gagal approve') }
  finally { approveSubmitting.value = false }
}

function openAddActivity() {
  editingActivityId.value = null
  actForm.value = { jenis_aktivitas: 'Call', tanggal_aktivitas: new Date().toISOString().substring(0, 16), ringkasan: '', hasil: 'Netral' }
  actError.value = ''
  showAddActivity.value = true
}

function openEditActivity(a: any) {
  editingActivityId.value = a.id_activity
  actForm.value = {
    jenis_aktivitas: a.jenis_aktivitas,
    tanggal_aktivitas: a.tanggal_aktivitas ? new Date(a.tanggal_aktivitas).toISOString().substring(0, 16) : '',
    ringkasan: a.ringkasan,
    hasil: a.hasil || 'Netral',
  }
  actError.value = ''
  showAddActivity.value = true
}

async function hapusActivity(a: any) {
  if (!confirm('Hapus aktivitas ini?')) return
  try {
    await api.delete('/sales/activity/' + a.id_activity)
    await sales.fetchOneOpportunity(id)
    flash('Aktivitas dihapus')
  } catch (e: any) { alert(e?.response?.data?.message ?? 'Gagal menghapus aktivitas') }
}

async function handleAddActivity() {
  if (!actForm.value.ringkasan) { actError.value = 'Ringkasan wajib diisi'; return }
  actSubmitting.value = true; actError.value = ''
  try {
    if (editingActivityId.value) {
      await api.patch('/sales/activity/' + editingActivityId.value, {
        jenis_aktivitas: actForm.value.jenis_aktivitas,
        tanggal_aktivitas: new Date(actForm.value.tanggal_aktivitas).toISOString(),
        ringkasan: actForm.value.ringkasan,
        hasil: actForm.value.hasil,
      })
    } else {
      await sales.createActivity({
        id_opportunity: id,
        id_sales_pic: sales.currentOpp.id_sales_pic,
        jenis_aktivitas: actForm.value.jenis_aktivitas,
        tanggal_aktivitas: new Date(actForm.value.tanggal_aktivitas).toISOString(),
        ringkasan: actForm.value.ringkasan,
        hasil: actForm.value.hasil,
      })
    }
    await sales.fetchOneOpportunity(id)
    showAddActivity.value = false
    flash(editingActivityId.value ? 'Aktivitas diperbarui' : 'Aktivitas dicatat')
    editingActivityId.value = null
    actForm.value = { jenis_aktivitas: 'Call', tanggal_aktivitas: new Date().toISOString().substring(0, 16), ringkasan: '', hasil: 'Netral' }
  } catch (e: any) { actError.value = e.response?.data?.message || 'Gagal' }
  finally { actSubmitting.value = false }
}

function openBuatSite() {
  const opp = sales.currentOpp
  siteForm.value = {
    id_pelanggan: 0,
    kode_site: '',
    nama_site: opp.lead?.nama_perusahaan || opp.lead?.nama_prospek || '',
    alamat_lengkap: '',
    kota: '',
    status_site: 'Prospek',
  }
  siteError.value = ''
  showBuatSite.value = true
}

async function handleBuatSite() {
  if (!siteForm.value.id_pelanggan || !siteForm.value.kode_site || !siteForm.value.nama_site || !siteForm.value.alamat_lengkap) {
    siteError.value = 'Pelanggan, Kode, Nama, dan Alamat wajib diisi'; return
  }
  siteSubmitting.value = true; siteError.value = ''
  try {
    const r = await api.post('/master/site', {
      id_pelanggan: siteForm.value.id_pelanggan,
      id_layanan: sales.currentOpp.id_layanan,
      kode_site: siteForm.value.kode_site,
      nama_site: siteForm.value.nama_site,
      alamat_lengkap: siteForm.value.alamat_lengkap,
      kota: siteForm.value.kota || undefined,
      status_site: siteForm.value.status_site,
    })
    showBuatSite.value = false
    router.push(`/master/site/${r.data.data.id_site}`)
  } catch (e: any) { siteError.value = e.response?.data?.message || 'Gagal membuat site' }
  finally { siteSubmitting.value = false }
}

function flash(msg: string) { successMsg.value = msg; setTimeout(() => successMsg.value = '', 3000) }
function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string) {
  return d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
function fmtDatetime(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="page">
    <div v-if="sales.loading && !sales.currentOpp" class="loading-page">Memuat...</div>
    <template v-else-if="sales.currentOpp">
      <!-- Header -->
      <div class="page-header">
        <div>
          <button class="btn-back" @click="router.push('/sales/opportunity')">← Opportunity</button>
          <h2>{{ sales.currentOpp.nama_opportunity }}</h2>
          <p class="sub">
            Lead: <strong @click="router.push(`/sales/lead/${sales.currentOpp.id_lead}`)" class="link">
              {{ sales.currentOpp.lead?.nama_prospek }}
            </strong>
            {{ sales.currentOpp.lead?.nama_perusahaan ? `· ${sales.currentOpp.lead.nama_perusahaan}` : '' }}
          </p>
        </div>
        <div class="header-actions">
          <span class="tahapan-big"
            :style="{ background: (TAHAPAN_COLOR[sales.currentOpp.tahapan] || '#94a3b8') + '20', color: TAHAPAN_COLOR[sales.currentOpp.tahapan] || '#94a3b8' }">
            {{ sales.currentOpp.tahapan }}
          </span>
          <button class="btn-site" @click="openBuatSite">+ Buat Site</button>
          <button class="btn-edit" @click="openEditOpp">Edit</button>
        </div>
      </div>

      <div v-if="successMsg" class="alert-success">{{ successMsg }}</div>

      <!-- Info row -->
      <div class="info-row-bar">
        <div class="info-chip">
          <span class="ic-label">Layanan</span>
          <span class="ic-value">{{ sales.currentOpp.layanan?.nama_layanan || '—' }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Estimasi Nilai</span>
          <span class="ic-value fw">{{ fmt(Number(sales.currentOpp.estimasi_nilai)) }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Sales PIC</span>
          <span class="ic-value">{{ sales.currentOpp.sales_pic?.nama_lengkap }}</span>
        </div>
        <div class="info-chip">
          <span class="ic-label">Target Close</span>
          <span class="ic-value">{{ fmtDate(sales.currentOpp.tgl_target_close || '') }}</span>
        </div>
      </div>

      <div v-if="sales.currentOpp.catatan" class="catatan-box">{{ sales.currentOpp.catatan }}</div>
      <div v-if="sales.currentOpp.alasan_lost" class="lost-box">Lost: {{ sales.currentOpp.alasan_lost }}</div>

      <!-- Quotations -->
      <div class="section-card mt16">
        <div class="section-header">
          <span class="card-title">Quotation ({{ sales.currentOpp.quotations?.length ?? 0 }})</span>
          <button class="btn-add-small" @click="showAddQt = true">+ Buat QT</button>
        </div>
        <div v-if="!sales.currentOpp.quotations?.length" class="empty-section">Belum ada quotation</div>
        <div v-for="q in sales.currentOpp.quotations" :key="q.id_quotation" class="qt-item">
          <div class="qt-left">
            <div class="qt-nomor">{{ q.nomor_quotation }}</div>
            <div class="qt-date">{{ fmtDate(q.tgl_quotation) }}</div>
          </div>
          <div class="qt-mid">
            <div class="qt-mrc">MRC: {{ fmt(Number(q.harga_mrc)) }}</div>
            <div class="qt-otc">OTC: {{ fmt(Number(q.harga_otc)) }}</div>
          </div>
          <div class="qt-right">
            <span class="qt-status" :style="{ color: QT_STATUS_COLOR[q.status_approval] || '#64748b' }">
              {{ q.status_approval }}
            </span>
            <button
              v-if="q.status_approval === 'Draft'"
              class="btn-approve" @click="openApprove(q.id_quotation)">
              Approve / Reject
            </button>
            <div v-else class="qt-approver">{{ q.approver?.nama_lengkap }}</div>
          </div>
        </div>
      </div>

      <!-- Aktivitas -->
      <div class="section-card mt16">
        <div class="section-header">
          <span class="card-title">Aktivitas ({{ sales.currentOpp.activities?.length ?? 0 }})</span>
          <button class="btn-add-small" @click="openAddActivity">+ Catat</button>
        </div>
        <div v-if="!sales.currentOpp.activities?.length" class="empty-section">Belum ada aktivitas</div>
        <div v-for="a in sales.currentOpp.activities" :key="a.id_activity" class="activity-item">
          <div class="act-left">
            <span class="act-jenis">{{ a.jenis_aktivitas }}</span>
            <span class="act-date">{{ fmtDatetime(a.tanggal_aktivitas) }}</span>
          </div>
          <div class="act-right">
            <p class="act-ringkasan">{{ a.ringkasan }}</p>
            <span :class="['act-hasil', `hasil-${a.hasil?.toLowerCase()}`]">{{ a.hasil }}</span>
          </div>
          <div class="act-actions">
            <button class="btn-act-edit" @click="openEditActivity(a)">Edit</button>
            <button class="btn-act-hapus" @click="hapusActivity(a)">Hapus</button>
          </div>
        </div>
      </div>

      <!-- Modal Edit Opp -->
      <div v-if="showEditOpp" class="modal-overlay" @click.self="showEditOpp = false">
        <div class="modal">
          <h3>Edit Opportunity</h3>
          <div class="form-grid">
            <div class="field full">
              <label>Nama Opportunity</label>
              <input v-model="editForm.nama_opportunity" />
            </div>
            <div class="field">
              <label>Layanan</label>
              <select v-model="editForm.id_layanan">
                <option :value="0">— Pilih —</option>
                <option v-for="l in master.layananList" :key="l.id_layanan" :value="l.id_layanan">
                  {{ l.kode_layanan }} - {{ l.nama_layanan }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Tahapan</label>
              <select v-model="editForm.tahapan">
                <option v-for="t in TAHAPAN" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="field">
              <label>Estimasi Nilai (Rp)</label>
              <input v-model.number="editForm.estimasi_nilai" type="number" />
            </div>
            <div class="field">
              <label>Target Close</label>
              <input v-model="editForm.tgl_target_close" type="date" />
            </div>
            <div class="field">
              <label>Sales PIC</label>
              <select v-model="editForm.id_sales_pic">
                <option v-for="s in sales.salesList" :key="s.id_karyawan" :value="s.id_karyawan">{{ s.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field full" v-if="editForm.tahapan === 'Lost'">
              <label>Alasan Lost</label>
              <textarea v-model="editForm.alasan_lost" rows="2"></textarea>
            </div>
            <div class="field full">
              <label>Catatan</label>
              <textarea v-model="editForm.catatan" rows="2"></textarea>
            </div>
          </div>
          <p v-if="editError" class="form-error">{{ editError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showEditOpp = false">Batal</button>
            <button class="btn-submit" @click="handleEditOpp" :disabled="editSubmitting">
              {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Add Quotation -->
      <div v-if="showAddQt" class="modal-overlay" @click.self="showAddQt = false">
        <div class="modal">
          <h3>Buat Quotation</h3>
          <div class="form-grid">
            <div class="field">
              <label>Tgl Quotation</label>
              <input v-model="qtForm.tgl_quotation" type="date" />
            </div>
            <div class="field">
              <label>Berlaku Sampai</label>
              <input v-model="qtForm.tgl_berlaku_sampai" type="date" />
            </div>
            <div class="field">
              <label>Harga MRC (Rp/bln)</label>
              <input v-model.number="qtForm.harga_mrc" type="number" placeholder="0" />
            </div>
            <div class="field">
              <label>Harga OTC (Rp)</label>
              <input v-model.number="qtForm.harga_otc" type="number" placeholder="0" />
            </div>
            <div class="field full">
              <label>Catatan</label>
              <textarea v-model="qtForm.catatan" rows="2"></textarea>
            </div>
          </div>
          <p v-if="qtError" class="form-error">{{ qtError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showAddQt = false">Batal</button>
            <button class="btn-submit" @click="handleAddQt" :disabled="qtSubmitting">
              {{ qtSubmitting ? 'Menyimpan...' : 'Buat Quotation' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Approve -->
      <div v-if="showApprove" class="modal-overlay" @click.self="showApprove = false">
        <div class="modal">
          <h3>Approval Quotation</h3>
          <div class="form-grid">
            <div class="field">
              <label>Keputusan</label>
              <select v-model="approveForm.status_approval">
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div class="field">
              <label>Approver</label>
              <select v-model="approveForm.id_approver">
                <option v-for="s in sales.salesList" :key="s.id_karyawan" :value="s.id_karyawan">{{ s.nama_lengkap }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Catatan Approval</label>
              <textarea v-model="approveForm.catatan_approval" rows="2"></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showApprove = false">Batal</button>
            <button class="btn-submit" @click="handleApprove" :disabled="approveSubmitting">
              {{ approveSubmitting ? 'Menyimpan...' : 'Konfirmasi' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Buat Site -->
      <div v-if="showBuatSite" class="modal-overlay" @click.self="showBuatSite = false">
        <div class="modal">
          <h3>Buat Site dari Opportunity</h3>
          <div class="site-pre-info">
            <span class="spi-label">Layanan</span>
            <span class="spi-val">{{ sales.currentOpp.layanan?.nama_layanan || '—' }}</span>
          </div>
          <div class="form-grid">
            <div class="field full">
              <label>Pelanggan <span class="req">*</span></label>
              <select v-model.number="siteForm.id_pelanggan">
                <option :value="0">— Pilih Pelanggan —</option>
                <option v-for="p in master.pelangganDropdown" :key="p.id_pelanggan" :value="p.id_pelanggan">
                  {{ p.kode_pelanggan }} — {{ p.nama_pelanggan }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Kode Site <span class="req">*</span></label>
              <input v-model="siteForm.kode_site" placeholder="Mis: SITE-JKT-001" />
            </div>
            <div class="field">
              <label>Nama Site <span class="req">*</span></label>
              <input v-model="siteForm.nama_site" />
            </div>
            <div class="field full">
              <label>Alamat Lengkap <span class="req">*</span></label>
              <textarea v-model="siteForm.alamat_lengkap" rows="2" placeholder="Jl. ..."></textarea>
            </div>
            <div class="field">
              <label>Kota</label>
              <input v-model="siteForm.kota" placeholder="Opsional" />
            </div>
            <div class="field">
              <label>Status Site</label>
              <select v-model="siteForm.status_site">
                <option value="Prospek">Prospek</option>
                <option value="Survey">Survey</option>
              </select>
            </div>
          </div>
          <p v-if="siteError" class="form-error">{{ siteError }}</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showBuatSite = false">Batal</button>
            <button class="btn-submit" @click="handleBuatSite" :disabled="siteSubmitting">
              {{ siteSubmitting ? 'Menyimpan...' : 'Buat Site' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Activity -->
      <div v-if="showAddActivity" class="modal-overlay" @click.self="showAddActivity = false">
        <div class="modal">
          <h3>{{ editingActivityId ? 'Edit Aktivitas' : 'Catat Aktivitas' }}</h3>
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
              {{ actSubmitting ? 'Menyimpan...' : (editingActivityId ? 'Simpan' : 'Catat') }}
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
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.link { color: #1d4ed8; cursor: pointer; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.tahapan-big { padding: 5px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; }
.btn-edit { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-site { padding: 9px 18px; background: linear-gradient(135deg, #065f46, #10b981); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-site:hover { opacity: 0.9; }
.site-pre-info { display: flex; align-items: center; gap: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
.spi-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; }
.spi-val { font-size: 14px; font-weight: 600; color: #15803d; }

.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 13px; padding: 10px 14px; margin-bottom: 16px; }

.info-row-bar { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.info-chip { background: #fff; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); flex: 1; min-width: 140px; }
.ic-label { display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
.ic-value { font-size: 14px; color: #0f172a; }
.fw { font-weight: 700; }

.catatan-box { background: #f8fafc; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #475569; margin-bottom: 4px; }
.lost-box { background: #fef2f2; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #dc2626; margin-bottom: 4px; }

.section-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.mt16 { margin-top: 16px; }
.card-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.btn-add-small { padding: 5px 12px; background: #eff6ff; color: #1d4ed8; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.empty-section { color: #94a3b8; font-size: 13px; padding: 12px 0; }

.qt-item { display: flex; align-items: center; gap: 16px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
.qt-left { min-width: 160px; }
.qt-nomor { font-size: 14px; font-weight: 700; color: #0f172a; }
.qt-date { font-size: 12px; color: #94a3b8; }
.qt-mid { flex: 1; }
.qt-mrc { font-size: 14px; font-weight: 600; color: #0f172a; }
.qt-otc { font-size: 12px; color: #64748b; }
.qt-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.qt-status { font-size: 13px; font-weight: 700; }
.btn-approve { padding: 4px 10px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.qt-approver { font-size: 12px; color: #64748b; }

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
.act-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.btn-act-edit { padding: 3px 10px; background: #f1f5f9; color: #374151; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; }
.btn-act-hapus { padding: 3px 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; }

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
