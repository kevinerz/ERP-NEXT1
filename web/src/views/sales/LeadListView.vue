<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesStore, type Lead } from '@/stores/sales'

const router = useRouter()
const sales = useSalesStore()

const search = ref('')
const filterStatus = ref('')
const page = ref(1)

// Modal tambah lead
const showModal = ref(false)
const form = ref({ nama_prospek: '', nama_perusahaan: '', no_kontak: '', email: '', sumber_lead: 'Referral', id_sales_pic: 0, catatan_awal: '' })
const submitting = ref(false)
const formError = ref('')

const STATUS_LEAD = ['Baru', 'Dihubungi', 'Qualified', 'Tidak Tertarik', 'Konversi']
const SUMBER_LEAD = ['Referral', 'Cold Call', 'Website', 'Media Sosial', 'Pameran', 'Lainnya']

const STATUS_COLOR: Record<string, string> = {
  Baru: 'badge-blue', Dihubungi: 'badge-purple', Qualified: 'badge-yellow',
  'Tidak Tertarik': 'badge-red', Konversi: 'badge-green',
}

onMounted(async () => {
  await sales.fetchSalesList()
  if (sales.salesList.length) form.value.id_sales_pic = sales.salesList[0].id_karyawan
  fetchData()
})

function fetchData() {
  const params: any = { page: page.value }
  if (search.value) params.search = search.value
  if (filterStatus.value) params.status_lead = filterStatus.value
  sales.fetchLeads(params)
}
function doSearch() { page.value = 1; fetchData() }
function goPage(p: number) { page.value = p; fetchData() }

async function handleSubmit() {
  if (!form.value.nama_prospek || !form.value.id_sales_pic) {
    formError.value = 'Nama prospek dan Sales PIC wajib diisi'; return
  }
  submitting.value = true; formError.value = ''
  try {
    const result = await sales.createLead({
      nama_prospek: form.value.nama_prospek,
      nama_perusahaan: form.value.nama_perusahaan || undefined,
      no_kontak: form.value.no_kontak || undefined,
      email: form.value.email || undefined,
      sumber_lead: form.value.sumber_lead,
      id_sales_pic: form.value.id_sales_pic,
      catatan_awal: form.value.catatan_awal || undefined,
    })
    showModal.value = false
    router.push(`/sales/lead/${result.id_lead}`)
  } catch (e: any) {
    formError.value = e.response?.data?.message || 'Terjadi kesalahan'
  } finally { submitting.value = false }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <button class="btn-back" @click="router.push('/sales')">← Sales</button>
        <h2>Lead</h2>
      </div>
      <button class="btn-primary" @click="showModal = true">+ Tambah Lead</button>
    </div>

    <div class="filter-bar">
      <input v-model="search" @keyup.enter="doSearch" placeholder="Cari nama / perusahaan..." class="input-search" />
      <select v-model="filterStatus" @change="doSearch" class="select-filter">
        <option value="">Semua Status</option>
        <option v-for="s in STATUS_LEAD" :key="s" :value="s">{{ s }}</option>
      </select>
      <button class="btn-search" @click="doSearch">Cari</button>
    </div>

    <div v-if="sales.error" class="alert-error">{{ sales.error }}</div>

    <div class="table-card">
      <div v-if="sales.loading" class="loading">Memuat...</div>
      <table v-else>
        <thead>
          <tr>
            <th>Prospek</th>
            <th>Perusahaan</th>
            <th>Kontak</th>
            <th>Sumber</th>
            <th>Sales PIC</th>
            <th>Status</th>
            <th>Opp</th>
            <th>Tgl</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!sales.leadList.length">
            <td colspan="8" class="empty">Tidak ada lead</td>
          </tr>
          <tr
            v-for="l in sales.leadList" :key="l.id_lead"
            class="row-link" @click="router.push(`/sales/lead/${l.id_lead}`)"
          >
            <td class="fw600">{{ l.nama_prospek }}</td>
            <td class="text-gray">{{ l.nama_perusahaan || '—' }}</td>
            <td>{{ l.no_kontak || '—' }}</td>
            <td><span class="sumber-badge">{{ l.sumber_lead }}</span></td>
            <td>{{ l.sales_pic?.nama_lengkap }}</td>
            <td><span :class="['status-badge', STATUS_COLOR[l.status_lead] || 'badge-gray']">{{ l.status_lead }}</span></td>
            <td class="center">{{ l._count?.opportunities ?? 0 }}</td>
            <td class="text-gray text-sm">{{ formatDate(l.created_at) }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="sales.leadMeta.total_pages > 1" class="pagination">
        <button v-for="p in sales.leadMeta.total_pages" :key="p"
          :class="['page-btn', { active: p === sales.leadMeta.page }]" @click="goPage(p)">{{ p }}</button>
      </div>
      <div class="table-footer" v-if="sales.leadMeta.total">Total: {{ sales.leadMeta.total }} lead</div>
    </div>

    <!-- Modal Tambah Lead -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>Tambah Lead</h3>
        <div class="form-grid">
          <div class="field full">
            <label>Nama Prospek <span class="req">*</span></label>
            <input v-model="form.nama_prospek" placeholder="Nama lengkap atau PIC" />
          </div>
          <div class="field full">
            <label>Nama Perusahaan</label>
            <input v-model="form.nama_perusahaan" placeholder="PT / CV / Toko..." />
          </div>
          <div class="field">
            <label>No. Kontak</label>
            <input v-model="form.no_kontak" placeholder="08xx-xxxx" />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="form.email" type="email" placeholder="email@..." />
          </div>
          <div class="field">
            <label>Sumber Lead</label>
            <select v-model="form.sumber_lead">
              <option v-for="s in SUMBER_LEAD" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field">
            <label>Sales PIC <span class="req">*</span></label>
            <select v-model="form.id_sales_pic">
              <option :value="0" disabled>Pilih Sales</option>
              <option v-for="s in sales.salesList" :key="s.id_karyawan" :value="s.id_karyawan">
                {{ s.nama_lengkap }}
              </option>
            </select>
          </div>
          <div class="field full">
            <label>Catatan Awal</label>
            <textarea v-model="form.catatan_awal" rows="3" placeholder="Opsional"></textarea>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">Batal</button>
          <button class="btn-submit" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? 'Menyimpan...' : 'Tambah Lead' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1100px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.btn-back { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; display: block; margin-bottom: 4px; }
.page-header h2 { margin: 0; font-size: 22px; color: #0f172a; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.input-search { flex: 1; min-width: 200px; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; }
.input-search:focus { border-color: #3b82f6; background: #fff; }
.select-filter { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; }
.btn-search { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; }
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.alert-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; padding: 10px 14px; margin-bottom: 12px; }

.table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f8fafc; }
th { padding: 12px 14px; font-size: 12px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 13px 14px; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; }
.empty { text-align: center; color: #94a3b8; padding: 40px; }
.loading { padding: 40px; text-align: center; color: #94a3b8; }
.fw600 { font-weight: 600; }
.text-gray { color: #64748b; }
.text-sm { font-size: 12px; }
.center { text-align: center; }
.row-link { cursor: pointer; transition: background 0.15s; }
.row-link:hover td { background: #f8fafc; }

.sumber-badge { background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 6px; font-size: 12px; }
.status-badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-blue { background: #eff6ff; color: #1d4ed8; }
.badge-purple { background: #f5f3ff; color: #6d28d9; }
.badge-yellow { background: #fffbeb; color: #b45309; }
.badge-red { background: #fef2f2; color: #dc2626; }
.badge-green { background: #f0fdf4; color: #15803d; }
.badge-gray { background: #f1f5f9; color: #64748b; }

.pagination { display: flex; gap: 6px; padding: 14px; justify-content: center; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 6px 12px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; cursor: pointer; }
.page-btn.active { background: #1e40af; color: #fff; border-color: #1e40af; }
.table-footer { padding: 10px 16px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; }

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
