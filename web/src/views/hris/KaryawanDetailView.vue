<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { confirmDialog, pesanGalat } from '@/composables/useDialog'
import { useRouter, useRoute } from 'vue-router'
import { useHrisStore } from '@/stores/hris'
import { fmtDate as formatDate } from '@/composables/useFormat'
import api from '@/services/api'
import { toast } from '@/composables/useDialog'
import { infoDept, inisial, kelengkapan, masaKerjaTeks, hariMenuju, umur, tgl, nomorWa } from './hris-util'

const router = useRouter()
const route = useRoute()
const hris = useHrisStore()

const id = Number(route.params.id)
const showCreateUser = ref(false)
const showResetPw = ref(false)
const showEditRoles = ref(false)
const editRoleIds = ref<number[]>([])

const userForm = ref({ username: '', password: '', role_ids: [] as number[] })
const newPassword = ref('')
const actionLoading = ref(false)
const actionError = ref('')
const actionSuccess = ref('')

let successTimer: ReturnType<typeof setTimeout> | null = null
function setSuccess(msg: string) {
  actionSuccess.value = msg
  if (successTimer) clearTimeout(successTimer)
  successTimer = setTimeout(() => { actionSuccess.value = '' }, 3000)
}
onUnmounted(() => { if (successTimer) clearTimeout(successTimer) })

// Penanda UI: fetch awal selesai (fetchRoles tidak men-set hris.loading,
// jadi tanpa ini state "tidak ditemukan" sempat berkedip saat memuat).
const loaded = ref(false)

// Store dipakai bersama: jangan sempat menampilkan profil karyawan lain yang tersisa
if (hris.current?.id_karyawan !== id) hris.current = null
const galatMuat = ref('')
async function muatProfil() {
  loaded.value = false; galatMuat.value = ''
  try {
    const { data } = await api.get(`/hris/karyawan/${id}`)
    hris.current = data.data
  } catch (e: any) {
    // 404 = memang tidak ada; selain itu tampilkan alasan + "Coba lagi"
    if (e?.response?.status !== 404) galatMuat.value = pesanGalat(e, 'Gagal memuat data karyawan')
  } finally { loaded.value = true }
}

onMounted(async () => {
  hris.fetchRoles()
  await muatProfil()
  muatAktivitas()
})

// cegah klik ganda selama request berjalan
const togglingStatus = ref(false)
async function handleToggleStatus() {
  const aktif = !!hris.current?.status_aktif
  if (aktif && !(await confirmDialog({
    title: 'Nonaktifkan karyawan?',
    message: `${hris.current?.nama_lengkap ?? 'Karyawan ini'} akan ditandai nonaktif.`,
    variant: 'warning',
    confirmLabel: 'Ya, Nonaktifkan',
  }))) return
  if (togglingStatus.value) return
  actionError.value = ''
  togglingStatus.value = true
  try {
    await hris.toggleStatus(id)
    await hris.fetchOne(id)
    setSuccess('Status karyawan diperbarui')
  } catch (e: any) {
    actionError.value = pesanGalat(e, 'Gagal mengubah status karyawan')
  } finally { togglingStatus.value = false }
}

const deleting = ref(false)

async function handleDelete() {
  if (!hris.current) return
  if (!(await confirmDialog({ title: 'Hapus Karyawan?', message: `Hapus karyawan "${hris.current.nama_lengkap}"? Tindakan ini tidak bisa dibatalkan.`, variant: 'danger', confirmLabel: 'Ya, Hapus' }))) return
  if (deleting.value) return
  actionError.value = ''
  deleting.value = true
  try {
    await hris.deleteKaryawan(id)
    toast('Karyawan dihapus')
    router.push('/hris/karyawan')
  } catch (e: any) {
    actionError.value = pesanGalat(e, 'Gagal menghapus karyawan')
  } finally {
    deleting.value = false
  }
}

async function handleCreateUser() {
  if (actionLoading.value) return
  actionError.value = ''
  if (!userForm.value.username.trim()) { actionError.value = 'Username wajib diisi'; return }
  if (userForm.value.password.length < 8) { actionError.value = 'Password minimal 8 karakter'; return }
  if (!userForm.value.role_ids.length) { actionError.value = 'Pilih minimal satu role'; return }
  actionLoading.value = true
  try {
    await hris.createUserAccount(id, userForm.value)
    await hris.fetchOne(id)
    showCreateUser.value = false
    userForm.value = { username: '', password: '', role_ids: [] }
    setSuccess('Akun user berhasil dibuat')
  } catch (e: any) {
    actionError.value = pesanGalat(e, 'Gagal membuat akun')
  } finally {
    actionLoading.value = false
  }
}

async function handleResetPw() {
  if (actionLoading.value) return
  if (!newPassword.value || newPassword.value.length < 8) {
    actionError.value = 'Password minimal 8 karakter'
    return
  }
  actionLoading.value = true
  actionError.value = ''
  try {
    await hris.resetPassword(id, newPassword.value)
    showResetPw.value = false
    newPassword.value = ''
    setSuccess('Password berhasil direset')
  } catch (e: any) {
    actionError.value = pesanGalat(e, 'Gagal reset password')
  } finally {
    actionLoading.value = false
  }
}

function openEditRoles() {
  editRoleIds.value = hris.current?.user?.user_roles.map(ur => ur.role.id_role) ?? []
  actionError.value = ''
  showEditRoles.value = true
}

async function handleEditRoles() {
  if (actionLoading.value) return
  if (!editRoleIds.value.length) {
    actionError.value = 'Pilih minimal satu role'
    return
  }
  actionLoading.value = true
  actionError.value = ''
  try {
    await hris.updateUserRoles(id, editRoleIds.value)
    await hris.fetchOne(id)
    showEditRoles.value = false
    setSuccess('Role berhasil diperbarui')
  } catch (e: any) {
    actionError.value = pesanGalat(e, 'Gagal memperbarui role')
  } finally {
    actionLoading.value = false
  }
}

// ─── Modul Akses ──────────────────────────────────────────────
const ALL_MODULS = [
  { key: 'hris',          label: 'HRIS',        icon: '👤' },
  { key: 'master',        label: 'Master Data',  icon: '📦' },
  { key: 'sales',         label: 'Sales',        icon: '💼' },
  { key: 'crm',           label: 'CRM',          icon: '🤝' },
  { key: 'projects',      label: 'Proyek',       icon: '📋' },
  { key: 'operations',    label: 'Operasional',  icon: '🔧' },
  { key: 'instalasi',     label: 'Pemasangan',   icon: '🛠️' },
  { key: 'assets',        label: 'Aset',         icon: '🖥️' },
  { key: 'contracts',     label: 'Kontrak',      icon: '📄' },
  { key: 'finance',       label: 'Finance',      icon: '💰' },
  { key: 'reports',       label: 'Laporan',      icon: '📈' },
  { key: 'notifications', label: 'Notifikasi',   icon: '🔔' },
  { key: 'public-wo',     label: 'Public WO',    icon: '🌐' },
  { key: 'prtg',          label: 'PRTG',         icon: '📡' },
  { key: 'mekari',        label: 'Mekari',       icon: '💳' },
  { key: 'whatsapp',      label: 'WhatsApp',     icon: '💬' },
  { key: 'fileserver',    label: 'File Server',  icon: '🗃️' },
]

const PRESETS = [
  { key: 'teknisi',   label: 'Teknisi',    icon: '🔧', moduls: ['operations', 'instalasi', 'public-wo', 'assets', 'notifications'] },
  { key: 'noc',       label: 'NOC',        icon: '📺', moduls: ['operations', 'notifications', 'prtg', 'assets', 'public-wo'] },
  { key: 'sales',     label: 'Sales',      icon: '💼', moduls: ['sales', 'crm', 'master', 'contracts', 'reports'] },
  { key: 'presales',  label: 'Pre-Sales',  icon: '🔍', moduls: ['sales', 'master'] },
  { key: 'finance',   label: 'Finance/AR', icon: '💰', moduls: ['finance', 'reports', 'contracts', 'master'] },
  { key: 'helpdesk',  label: 'Helpdesk',   icon: '🤝', moduls: ['crm', 'operations', 'notifications', 'master', 'whatsapp'] },
  { key: 'manager',   label: 'Manager',    icon: '📋', moduls: ['hris', 'master', 'sales', 'crm', 'projects', 'operations', 'instalasi', 'assets', 'contracts', 'finance', 'reports', 'notifications', 'public-wo'] },
]

const showEditModul  = ref(false)
const editModulAkses = ref<string[]>([])
const semuaModul     = ref(false)

function openEditModul() {
  const raw: string[] = hris.current?.user?.modul_akses ?? []
  semuaModul.value     = raw.length === 0
  editModulAkses.value = raw.length ? [...raw] : []
  actionError.value    = ''
  showEditModul.value  = true
}

function onSemuaModulChange() {
  if (semuaModul.value) editModulAkses.value = []
}

function applyPreset(moduls: string[]) {
  semuaModul.value     = false
  editModulAkses.value = [...moduls]
}

async function handleEditModul() {
  if (actionLoading.value) return
  // daftar kosong = akses SEMUA modul di backend → jangan sampai terkirim tanpa sengaja
  if (!semuaModul.value && !editModulAkses.value.length) {
    actionError.value = 'Pilih minimal satu modul, atau centang Administrator untuk akses semua modul'
    return
  }
  actionLoading.value = true
  actionError.value   = ''
  try {
    // semuaModul = true → kirim [] agar backend simpan null (akses semua)
    await hris.updateModulAkses(id, semuaModul.value ? [] : editModulAkses.value)
    await hris.fetchOne(id)
    showEditModul.value = false
    setSuccess('Akses modul berhasil diperbarui')
  } catch (e: any) {
    actionError.value = pesanGalat(e, 'Gagal memperbarui akses modul')
  } finally {
    actionLoading.value = false
  }
}

const togglingUser = ref(false)
async function handleToggleUserStatus() {
  const aktif = !!hris.current?.user?.is_aktif
  if (aktif && !(await confirmDialog({
    title: 'Nonaktifkan akun?',
    message: 'Pengguna tidak akan bisa login ke ERP sampai akunnya diaktifkan lagi.',
    variant: 'warning',
    confirmLabel: 'Ya, Nonaktifkan',
  }))) return
  if (togglingUser.value) return
  actionError.value = ''
  togglingUser.value = true
  try {
    await hris.toggleUserStatus(id)
    await hris.fetchOne(id)
    setSuccess('Status akun diperbarui')
  } catch (e: any) {
    actionError.value = pesanGalat(e, 'Gagal mengubah status akun')
  } finally { togglingUser.value = false }
}

// ─── Tampilan profil ──────────────────────────────────────────
const k = computed(() => hris.current)
const dept = computed(() => infoDept(k.value?.departemen))
const lengkap = computed(() => (k.value ? kelengkapan(k.value) : { persen: 0, kurang: [] as string[] }))
const tab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : 'profil')
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t === 'profil' ? undefined : t } }).catch(() => {}))
const tampilRahasia = ref(false)
const samar = (v?: string | null) => (!v ? '—' : tampilRahasia.value ? v : `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`)
const menuLain = ref(false)
const ultahLagi = computed(() => hariMenuju(k.value?.tgl_lahir))
async function salin(teks: string, label: string) {
  try { await navigator.clipboard.writeText(teks); toast(`${label} disalin`) } catch { toast(`${label} gagal disalin — salin manual`, 'warning') }
}
const JENIS_KELAMIN: Record<string, string> = { L: 'Laki-laki', P: 'Perempuan' }

// ─── Aktivitas kerja ──────────────────────────────────────────
interface Aktivitas {
  tiket: { aktif: number; bulan_ini: number }; wo: { aktif: number; bulan_ini: number }; instalasi: { aktif: number; bulan_ini: number }
  rapat_30h: number; tindak_terbuka: number
  tiket_terbaru: { id_ticket: number; nomor_tiket: string; judul_tiket: string; status_tiket: string; updated_at: string }[]
}
const aktivitas = ref<Aktivitas | null>(null)
const aktivitasGagal = ref(false)
async function muatAktivitas() {
  aktivitasGagal.value = false
  try { const { data } = await api.get(`/hris/karyawan/${id}/aktivitas`); aktivitas.value = data.data } catch { aktivitasGagal.value = true }
}
const modulLabel = (key: string) => ALL_MODULS.find((m) => m.key === key) ?? { key, label: key, icon: '•' }
</script>

<template>
  <div class="pf">
    <div v-if="!hris.current && loaded && galatMuat" class="pf-hilang" role="alert">
      <div>🍂</div><b>Gagal memuat data karyawan</b>
      <span class="pf-redup">{{ galatMuat }}</span>
      <button type="button" class="pf-btn utama" @click="muatProfil">↻ Coba lagi</button>
      <button type="button" class="pf-btn" @click="router.push('/hris/karyawan')">← Kembali ke Buku Tim</button>
    </div>
    <div v-else-if="!hris.current && loaded" class="pf-hilang">
      <div>🍂</div><b>Karyawan tidak ditemukan</b>
      <button type="button" class="pf-btn" @click="router.push('/hris/karyawan')">← Kembali ke Buku Tim</button>
    </div>
    <div v-else-if="!hris.current" class="pf-kerangka"></div>

    <template v-if="k">
      <button type="button" class="pf-kembali" @click="router.push('/hris/karyawan')">← Buku Tim</button>

      <!-- SAMPUL -->
      <header class="pf-sampul" :class="{ mati: !k.status_aktif }" :style="{ '--c': dept.warna, '--l': dept.lembut }">
        <div class="pf-foto">
          <img v-if="k.foto_url" :src="k.foto_url" alt="" />
          <span v-else>{{ inisial(k.nama_lengkap) }}</span>
          <i v-if="k.status_aktif" class="pf-status" title="Aktif"></i>
        </div>
        <div class="pf-identitas">
          <div class="pf-pil">
            <span class="pf-dept">{{ dept.ikon }} {{ k.departemen }}</span>
            <span v-if="!k.status_aktif" class="pf-tanda">Nonaktif</span>
            <span v-if="ultahLagi === 0" class="pf-tanda ultah">🎂 Ulang tahun hari ini!</span>
          </div>
          <h1>{{ k.nama_lengkap }}</h1>
          <p class="pf-jabatan">{{ k.jabatan }}</p>
          <div class="pf-fakta">
            <button type="button" title="Salin NIP" @click="salin(k.nip, 'NIP')"><span>NIP</span><code>{{ k.nip }}</code></button>
            <span><span>Masa kerja</span>{{ masaKerjaTeks(k.tgl_bergabung) }}</span>
            <span v-if="umur(k.tgl_lahir) != null"><span>Usia</span>{{ umur(k.tgl_lahir) }} tahun</span>
            <span v-if="k.user?.last_login"><span>Login terakhir</span>{{ formatDate(k.user.last_login) }}</span>
          </div>
        </div>
        <div class="pf-aksi">
          <div class="pf-kontak">
            <a v-if="k.no_hp" :href="`https://wa.me/${nomorWa(k.no_hp)}`" target="_blank" rel="noopener" title="WhatsApp">💬</a>
            <a v-if="k.no_hp" :href="`tel:${k.no_hp}`" title="Telepon">📞</a>
            <a v-if="k.email" :href="`mailto:${k.email}`" title="Email">✉️</a>
          </div>
          <button type="button" class="pf-btn utama" @click="router.push(`/hris/karyawan/${id}/edit`)">✏️ Ubah profil</button>
          <div class="pf-menu">
            <button type="button" class="pf-btn" aria-label="Aksi lain" @click="menuLain = !menuLain">⋯</button>
            <div v-if="menuLain" class="pf-menu-isi" @click="menuLain = false">
              <button type="button" :disabled="togglingStatus" @click="handleToggleStatus">{{ k.status_aktif ? '⏸️ Nonaktifkan karyawan' : '▶️ Aktifkan karyawan' }}</button>
              <button type="button" class="bahaya" :disabled="deleting" @click="handleDelete">🗑️ Hapus karyawan</button>
            </div>
          </div>
        </div>
      </header>

      <div v-if="actionSuccess" class="pf-pesan ok">✓ {{ actionSuccess }}</div>
      <div v-if="actionError && !showCreateUser && !showResetPw && !showEditRoles && !showEditModul" class="pf-pesan gagal">{{ actionError }}</div>

      <div class="pf-tata">
        <!-- KIRI -->
        <aside class="pf-kiri">
          <section class="pf-kartu">
            <h4>Kelengkapan profil</h4>
            <div class="pf-lengkap">
              <span class="pf-cincin" :style="{ '--p': lengkap.persen }"><i>{{ lengkap.persen }}<small>%</small></i></span>
              <div>
                <b>{{ lengkap.persen === 100 ? 'Lengkap 🎉' : `${lengkap.kurang.length} data belum diisi` }}</b>
                <small v-if="lengkap.kurang.length">{{ lengkap.kurang.join(', ') }}</small>
              </div>
            </div>
            <button v-if="lengkap.kurang.length" type="button" class="pf-btn penuh" @click="router.push(`/hris/karyawan/${id}/edit`)">Lengkapi sekarang</button>
          </section>

          <section class="pf-kartu">
            <h4>Sekilas</h4>
            <dl class="pf-sekilas">
              <dt>📅 Bergabung</dt><dd>{{ tgl(k.tgl_bergabung) }}</dd>
              <dt>🎂 Lahir</dt><dd>{{ k.tempat_lahir || '—' }}{{ k.tgl_lahir ? `, ${tgl(k.tgl_lahir)}` : '' }}<small v-if="ultahLagi != null && ultahLagi > 0 && ultahLagi <= 60"> · ulang tahun {{ ultahLagi }} hari lagi</small></dd>
              <dt>📱 HP</dt><dd><a v-if="k.no_hp" :href="`tel:${k.no_hp}`">{{ k.no_hp }}</a><template v-else>—</template></dd>
              <dt>✉️ Email</dt><dd><a v-if="k.email" :href="`mailto:${k.email}`">{{ k.email }}</a><template v-else>—</template></dd>
              <dt>🔐 Akun ERP</dt><dd><template v-if="k.user"><code>{{ k.user.username }}</code> <small :class="k.user.is_aktif ? 'hijau' : 'merah'">{{ k.user.is_aktif ? 'aktif' : 'nonaktif' }}</small></template><template v-else>Belum ada</template></dd>
            </dl>
          </section>

          <section v-if="k.kontak_darurat_nama || k.kontak_darurat_hp" class="pf-kartu darurat">
            <h4>🚑 Kontak darurat</h4>
            <b>{{ k.kontak_darurat_nama || '—' }}</b>
            <small>{{ k.kontak_darurat_hubungan || 'Hubungan belum diisi' }}</small>
            <a v-if="k.kontak_darurat_hp" class="pf-btn penuh" :href="`tel:${k.kontak_darurat_hp}`">📞 {{ k.kontak_darurat_hp }}</a>
          </section>
        </aside>

        <!-- KANAN -->
        <div class="pf-kanan">
          <nav class="pf-tab" role="tablist">
            <button type="button" role="tab" :class="{ on: tab === 'profil' }" @click="tab = 'profil'">Profil</button>
            <button type="button" role="tab" :class="{ on: tab === 'kerja' }" @click="tab = 'kerja'">Pekerjaan</button>
            <button type="button" role="tab" :class="{ on: tab === 'akun' }" @click="tab = 'akun'">Akun &amp; akses <i v-if="!k.user" class="pf-titik"></i></button>
          </nav>

          <!-- PROFIL -->
          <div v-if="tab === 'profil'" class="pf-isi">
            <section class="pf-kartu">
              <div class="pf-kepala"><h3>Data pribadi</h3>
                <button type="button" class="pf-mata" @click="tampilRahasia = !tampilRahasia">{{ tampilRahasia ? '🙈 Sembunyikan' : '👁️ Tampilkan' }} nomor identitas</button>
              </div>
              <dl class="pf-data">
                <div><dt>Jenis kelamin</dt><dd>{{ JENIS_KELAMIN[k.jenis_kelamin ?? ''] ?? '—' }}</dd></div>
                <div><dt>Agama</dt><dd>{{ k.agama || '—' }}</dd></div>
                <div><dt>Status pernikahan</dt><dd>{{ k.status_pernikahan || '—' }}</dd></div>
                <div><dt>Pendidikan terakhir</dt><dd>{{ k.pendidikan_terakhir || '—' }}</dd></div>
                <div><dt>No. KTP</dt><dd class="mono">{{ samar(k.no_ktp) }}</dd></div>
                <div><dt>NPWP</dt><dd class="mono">{{ samar(k.no_npwp) }}</dd></div>
                <div class="lebar"><dt>Alamat sesuai KTP</dt><dd>{{ k.alamat_ktp || '—' }}</dd></div>
              </dl>
            </section>

            <section class="pf-kartu">
              <div class="pf-kepala"><h3>Rekening payroll</h3></div>
              <div v-if="k.bank_nama || k.bank_no_rekening" class="pf-bank">
                <div class="pf-bank-kartu">
                  <small>{{ k.bank_nama || 'Bank' }}</small>
                  <b class="mono">{{ samar(k.bank_no_rekening) }}</b>
                  <span>a.n. {{ k.bank_atas_nama || k.nama_lengkap }}</span>
                </div>
                <button v-if="k.bank_no_rekening && tampilRahasia" type="button" class="pf-btn" @click="salin(k.bank_no_rekening!, 'Nomor rekening')">📋 Salin nomor</button>
              </div>
              <p v-else class="pf-redup">Rekening belum diisi.</p>
            </section>

            <section class="pf-kartu">
              <div class="pf-kepala"><h3>Kontak darurat</h3></div>
              <dl class="pf-data">
                <div><dt>Nama</dt><dd>{{ k.kontak_darurat_nama || '—' }}</dd></div>
                <div><dt>Hubungan</dt><dd>{{ k.kontak_darurat_hubungan || '—' }}</dd></div>
                <div><dt>No. HP</dt><dd>{{ k.kontak_darurat_hp || '—' }}</dd></div>
              </dl>
            </section>
          </div>

          <!-- PEKERJAAN -->
          <div v-else-if="tab === 'kerja'" class="pf-isi">
            <section class="pf-kartu">
              <div class="pf-kepala"><h3>Beban kerja saat ini</h3><small class="pf-redup">angka "30 hari" = dibuat dalam 30 hari terakhir</small></div>
              <div v-if="!aktivitas && aktivitasGagal" class="pf-redup">Data aktivitas gagal dimuat. <button type="button" class="pf-btn" @click="muatAktivitas">↻ Coba lagi</button></div>
              <div v-else-if="!aktivitas" class="pf-redup">Memuat…</div>
              <div v-else class="pf-kerja">
                <div><span>🎫</span><b>{{ aktivitas.tiket.aktif }}</b><small>Tiket gangguan aktif</small><em>{{ aktivitas.tiket.bulan_ini }} dalam 30 hari</em></div>
                <div><span>🧰</span><b>{{ aktivitas.wo.aktif }}</b><small>Work order berjalan</small><em>{{ aktivitas.wo.bulan_ini }} dalam 30 hari</em></div>
                <div><span>🛠️</span><b>{{ aktivitas.instalasi.aktif }}</b><small>Pemasangan berjalan</small><em>{{ aktivitas.instalasi.bulan_ini }} dalam 30 hari</em></div>
                <div><span>📹</span><b>{{ aktivitas.rapat_30h }}</b><small>Rapat dihadiri</small><em>30 hari terakhir</em></div>
                <div><span>☑️</span><b>{{ aktivitas.tindak_terbuka }}</b><small>Tugas rapat terbuka</small><em>sebagai PIC</em></div>
              </div>
            </section>
            <section class="pf-kartu">
              <div class="pf-kepala"><h3>Tiket terakhir sebagai PIC</h3></div>
              <p v-if="aktivitas && !aktivitas.tiket_terbaru.length" class="pf-redup">Belum pernah menjadi PIC tiket gangguan.</p>
              <button v-for="t in aktivitas?.tiket_terbaru ?? []" :key="t.id_ticket" type="button" class="pf-tiket" @click="router.push(`/operations/${t.id_ticket}`)">
                <code>{{ t.nomor_tiket }}</code><span>{{ t.judul_tiket }}</span><em>{{ t.status_tiket.replace('_', ' ') }}</em>
              </button>
            </section>
          </div>

          <!-- AKUN -->
          <div v-else class="pf-isi">
            <section v-if="!k.user" class="pf-kartu pf-tanpa-akun">
              <div>🔐</div>
              <h3>Belum punya akun ERP</h3>
              <p>Buat akun supaya {{ k.nama_lengkap.split(' ')[0] }} bisa login, menerima tiket, undangan rapat, dan notifikasi.</p>
              <button type="button" class="pf-btn utama" @click="actionError = ''; showCreateUser = true">＋ Buat akun</button>
            </section>
            <template v-else>
              <section class="pf-kartu">
                <div class="pf-kepala"><h3>Akun login</h3>
                  <span class="pf-status-akun" :class="k.user.is_aktif ? 'on' : 'off'">{{ k.user.is_aktif ? '● Aktif' : '● Nonaktif' }}</span>
                </div>
                <dl class="pf-data">
                  <div><dt>Username</dt><dd class="mono">{{ k.user.username }}</dd></div>
                  <div><dt>Login terakhir</dt><dd>{{ formatDate(k.user.last_login) }}</dd></div>
                  <div class="lebar"><dt>Role</dt><dd><span v-for="ur in k.user.user_roles" :key="ur.role.id_role" class="pf-chip">{{ ur.role.nama_role }}</span><template v-if="!k.user.user_roles.length">—</template></dd></div>
                </dl>
                <div class="pf-tombol-baris">
                  <button type="button" class="pf-btn" @click="openEditRoles">🎭 Ubah role</button>
                  <button type="button" class="pf-btn" @click="actionError = ''; newPassword = ''; showResetPw = true">🔑 Reset password</button>
                  <button type="button" class="pf-btn" :class="k.user.is_aktif ? 'bahaya' : ''" :disabled="togglingUser" @click="handleToggleUserStatus">
                    {{ togglingUser ? 'Memproses…' : k.user.is_aktif ? '⏸️ Nonaktifkan akun' : '▶️ Aktifkan akun' }}
                  </button>
                </div>
              </section>
              <section class="pf-kartu">
                <div class="pf-kepala"><h3>Akses modul</h3><button type="button" class="pf-btn" @click="openEditModul">Atur akses</button></div>
                <p v-if="!k.user.modul_akses?.length" class="pf-semua">⭐ Administrator — bisa membuka semua modul</p>
                <div v-else class="pf-modul">
                  <span v-for="m in k.user.modul_akses" :key="m">{{ modulLabel(m).icon }} {{ modulLabel(m).label }}</span>
                </div>
              </section>
            </template>
          </div>
        </div>
      </div>

      <!-- Modal: Buat Akun -->
      <div v-if="showCreateUser" class="pf-lapis" @click.self="showCreateUser = false">
        <div v-focus-trap class="pf-modal">
          <h3>Buat akun ERP</h3>
          <p class="pf-redup">Untuk {{ k.nama_lengkap }}</p>
          <label class="pf-field">Username<input v-model="userForm.username" type="text" placeholder="username" autocomplete="off" /></label>
          <label class="pf-field">Password<input v-model="userForm.password" type="password" placeholder="Min. 8 karakter" autocomplete="new-password" /></label>
          <div class="pf-field">Role
            <div class="pf-role">
              <label v-for="r in hris.roles" :key="r.id_role" :class="{ on: userForm.role_ids.includes(r.id_role) }">
                <input v-model="userForm.role_ids" type="checkbox" :value="r.id_role" />
                <b>{{ r.nama_role }}</b><small>{{ r.deskripsi }}</small>
              </label>
            </div>
          </div>
          <p v-if="actionError" class="pf-galat">{{ actionError }}</p>
          <div class="pf-modal-kaki">
            <button type="button" class="pf-btn" @click="showCreateUser = false">Batal</button>
            <button type="button" class="pf-btn utama" :disabled="actionLoading" @click="handleCreateUser">{{ actionLoading ? 'Menyimpan…' : 'Buat akun' }}</button>
          </div>
        </div>
      </div>

      <!-- Modal: Reset Password -->
      <div v-if="showResetPw" class="pf-lapis" @click.self="showResetPw = false">
        <div v-focus-trap class="pf-modal kecil">
          <h3>Reset password</h3>
          <p class="pf-redup">Akun <b>{{ k.user?.username }}</b></p>
          <label class="pf-field">Password baru<input v-model="newPassword" type="password" placeholder="Min. 8 karakter" autocomplete="new-password" /></label>
          <p v-if="actionError" class="pf-galat">{{ actionError }}</p>
          <div class="pf-modal-kaki">
            <button type="button" class="pf-btn" @click="showResetPw = false">Batal</button>
            <button type="button" class="pf-btn utama" :disabled="actionLoading" @click="handleResetPw">{{ actionLoading ? 'Menyimpan…' : 'Reset' }}</button>
          </div>
        </div>
      </div>

      <!-- Modal: Edit Role -->
      <div v-if="showEditRoles" class="pf-lapis" @click.self="showEditRoles = false">
        <div v-focus-trap class="pf-modal">
          <h3>Ubah role</h3>
          <p class="pf-redup">Akun <b>{{ k.user?.username }}</b></p>
          <div class="pf-role">
            <label v-for="r in hris.roles" :key="r.id_role" :class="{ on: editRoleIds.includes(r.id_role) }">
              <input v-model="editRoleIds" type="checkbox" :value="r.id_role" />
              <b>{{ r.nama_role }}</b><small>{{ r.deskripsi }}</small>
            </label>
          </div>
          <p v-if="actionError" class="pf-galat">{{ actionError }}</p>
          <div class="pf-modal-kaki">
            <button type="button" class="pf-btn" @click="showEditRoles = false">Batal</button>
            <button type="button" class="pf-btn utama" :disabled="actionLoading" @click="handleEditRoles">{{ actionLoading ? 'Menyimpan…' : 'Simpan role' }}</button>
          </div>
        </div>
      </div>

      <!-- Modal: Akses Modul -->
      <div v-if="showEditModul" class="pf-lapis" @click.self="showEditModul = false">
        <div v-focus-trap class="pf-modal lebar">
          <h3>Atur akses modul</h3>
          <p class="pf-redup">Akun <b>{{ k.user?.username }}</b></p>
          <label class="pf-admin" :class="{ on: semuaModul }">
            <input v-model="semuaModul" type="checkbox" @change="onSemuaModulChange" />
            <span>⭐ Administrator — semua modul, tidak dibatasi</span>
          </label>
          <template v-if="!semuaModul">
            <div class="pf-preset">
              <small>Preset jabatan:</small>
              <button v-for="p in PRESETS" :key="p.key" type="button" :class="{ on: editModulAkses.join(',') === p.moduls.join(',') }" @click="applyPreset(p.moduls)">{{ p.icon }} {{ p.label }}</button>
            </div>
            <small class="pf-redup">{{ editModulAkses.length }} modul dipilih</small>
            <div class="pf-modul-pilih">
              <label v-for="m in ALL_MODULS" :key="m.key" :class="{ on: editModulAkses.includes(m.key) }">
                <input v-model="editModulAkses" type="checkbox" :value="m.key" />
                <span>{{ m.icon }}</span>{{ m.label }}
              </label>
            </div>
          </template>
          <p v-if="actionError" class="pf-galat">{{ actionError }}</p>
          <div class="pf-modal-kaki">
            <button type="button" class="pf-btn" @click="showEditModul = false">Batal</button>
            <button type="button" class="pf-btn utama" :disabled="actionLoading" @click="handleEditModul">{{ actionLoading ? 'Menyimpan…' : 'Simpan akses' }}</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pf { --kertas: #fbf8f2; --tinta: #1c2a22; --hutan: #1f4d3a; --terakota: #c2552d; --garis: #e9e2d4; --redup: #8a8170;
  --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;
  background: var(--kertas); padding: 18px 24px 70px; min-height: 100%; box-sizing: border-box; color: var(--tinta); }
.pf-redup { color: var(--redup); font-size: 13px; margin: 0; }
.mono, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
code { font-size: 12px; background: #f3eee3; padding: 1px 6px; border-radius: 5px; color: #5b5242; }
.hijau { color: #2f7a4d; } .merah { color: #b42318; }
.pf-kembali { border: 0; background: none; color: var(--hutan); font-weight: 800; font-size: 13px; cursor: pointer; padding: 2px 0 10px; }
.pf-kerangka { height: 220px; border-radius: 26px; background: linear-gradient(90deg, #fff, #f3eee3, #fff); background-size: 200% 100%; animation: pf-kilau 1.2s infinite; }
@keyframes pf-kilau { to { background-position: -200% 0; } }
.pf-hilang { text-align: center; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.pf-hilang div { font-size: 44px; } .pf-hilang b { font-family: var(--serif); font-size: 20px; }

/* Sampul */
.pf-sampul { --c: #1f4d3a; --l: #e6f3ea; position: relative; display: flex; flex-wrap: wrap; gap: 22px; align-items: center; padding: 24px 26px; border-radius: 26px; margin-bottom: 14px; border: 1px solid var(--garis);
  background: radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--c) 14%, transparent), transparent 55%), linear-gradient(120deg, var(--l), #fff 70%); }
.pf-sampul.mati { filter: grayscale(.7); }
.pf-foto { position: relative; width: 116px; height: 116px; border-radius: 32px; background: var(--c); color: #fff; display: grid; place-items: center; font-family: var(--serif); font-size: 42px; font-weight: 700; overflow: visible; flex-shrink: 0; box-shadow: 0 16px 30px -16px var(--c); transform: rotate(-3deg); }
.pf-foto img { width: 100%; height: 100%; object-fit: cover; border-radius: 32px; }
.pf-foto span { transform: rotate(3deg); }
.pf-status { position: absolute; right: -4px; bottom: -4px; width: 20px; height: 20px; border-radius: 50%; background: #2f7a4d; border: 4px solid #fff; }
.pf-identitas { flex: 1; min-width: 240px; }
.pf-pil { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
.pf-dept { font-size: 11.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--c); }
.pf-tanda { font-size: 11px; font-weight: 800; padding: 1px 8px; border-radius: 99px; background: #eee9df; color: #6b6253; }
.pf-tanda.ultah { background: #fdf0e3; color: var(--terakota); }
.pf-sampul h1 { margin: 0; font-family: var(--serif); font-size: 34px; font-weight: 700; letter-spacing: -.5px; line-height: 1.1; color: var(--tinta); }
.pf-jabatan { margin: 4px 0 12px; font-size: 15px; color: #5b5242; font-style: italic; font-family: var(--serif); }
.pf-fakta { display: flex; flex-wrap: wrap; gap: 8px 22px; }
.pf-fakta > * { display: flex; flex-direction: column; font-size: 13.5px; font-weight: 700; border: 0; background: none; padding: 0; text-align: left; font-family: inherit; color: var(--tinta); }
.pf-fakta button { cursor: pointer; }
.pf-fakta > * > span { font-size: 10.5px; text-transform: uppercase; letter-spacing: .8px; color: var(--redup); font-weight: 800; }
.pf-aksi { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.pf-kontak { display: flex; gap: 6px; }
.pf-kontak a { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 1px solid var(--garis); text-decoration: none; font-size: 16px; transition: transform .15s; }
.pf-kontak a:hover { transform: translateY(-2px); background: var(--l); }
.pf-aksi > .pf-btn, .pf-menu { align-self: stretch; }
.pf-aksi { flex-direction: row; flex-wrap: wrap; align-items: center; }
.pf-btn { border: 1px solid var(--garis); background: #fff; color: var(--tinta); border-radius: 999px; padding: 8px 15px; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: background .15s, transform .15s; }
.pf-btn:hover:not(:disabled) { background: #f6f1e6; }
.pf-btn:disabled { opacity: .5; cursor: default; }
.pf-btn.utama { background: var(--hutan); border-color: var(--hutan); color: #f7f3ea; }
.pf-btn.utama:hover:not(:disabled) { background: #173d2d; }
.pf-btn.bahaya { color: #b42318; border-color: #f2c4bd; }
.pf-btn.penuh { width: 100%; }
.pf-menu { position: relative; }
.pf-menu-isi { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; background: #fff; border: 1px solid var(--garis); border-radius: 14px; box-shadow: 0 18px 40px -16px rgba(28, 42, 34, .4); padding: 6px; min-width: 220px; display: flex; flex-direction: column; }
.pf-menu-isi button { border: 0; background: none; text-align: left; padding: 9px 12px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; color: var(--tinta); }
.pf-menu-isi button:hover { background: #f6f1e6; }
.pf-menu-isi button.bahaya { color: #b42318; }
.pf-pesan { padding: 10px 14px; border-radius: 14px; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
.pf-pesan.ok { background: #e6f3ea; color: #1f4d3a; } .pf-pesan.gagal { background: #fdecea; color: #b42318; }

/* Tata letak */
.pf-tata { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 18px; align-items: start; }
.pf-kiri { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 12px; }
.pf-kanan { min-width: 0; }
.pf-kartu { background: #fff; border: 1px solid var(--garis); border-radius: 20px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.pf-kartu h4 { margin: 0; font-family: var(--serif); font-size: 16px; }
.pf-kartu h3 { margin: 0; font-family: var(--serif); font-size: 19px; font-weight: 700; }
.pf-kepala { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.pf-lengkap { display: flex; gap: 12px; align-items: center; }
.pf-lengkap div { display: flex; flex-direction: column; min-width: 0; }
.pf-lengkap b { font-size: 13.5px; }
.pf-lengkap small { font-size: 11.5px; color: var(--redup); line-height: 1.4; }
.pf-cincin { --p: 50; width: 62px; height: 62px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: conic-gradient(var(--terakota) calc(var(--p) * 1%), #f0eadd 0); }
.pf-cincin i { width: 48px; height: 48px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-style: normal; font-family: var(--serif); font-size: 17px; font-weight: 700; }
.pf-cincin small { font-size: 10px; }
.pf-sekilas { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 0; font-size: 13px; }
.pf-sekilas dt { color: var(--redup); font-weight: 700; white-space: nowrap; }
.pf-sekilas dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.pf-sekilas dd small { color: var(--terakota); font-weight: 700; }
.pf-sekilas a { color: var(--hutan); }
.pf-kartu.darurat { background: linear-gradient(160deg, #fdf0e3, #fff 70%); border-color: #f2d6bf; gap: 4px; }
.pf-kartu.darurat b { font-family: var(--serif); font-size: 16px; }
.pf-kartu.darurat small { color: var(--redup); font-size: 12px; margin-bottom: 6px; }

/* Tab */
.pf-tab { display: flex; gap: 22px; border-bottom: 1px solid var(--garis); margin-bottom: 14px; }
.pf-tab button { border: 0; background: none; padding: 8px 2px 10px; font-family: var(--serif); font-size: 17px; font-weight: 700; color: var(--redup); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; position: relative; }
.pf-tab button.on { color: var(--tinta); border-color: var(--terakota); }
.pf-titik { position: absolute; top: 6px; right: -10px; width: 8px; height: 8px; border-radius: 50%; background: var(--terakota); }
.pf-isi { display: flex; flex-direction: column; gap: 14px; animation: pf-muncul .25s both; }
@keyframes pf-muncul { from { opacity: 0; transform: translateY(6px); } }
.pf-mata { border: 0; background: none; color: var(--hutan); font-weight: 700; font-size: 12.5px; cursor: pointer; }
.pf-data { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin: 0; }
.pf-data > div { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; border-bottom: 1px dashed var(--garis); }
.pf-data .lebar { grid-column: 1 / -1; }
.pf-data dt { font-size: 10.5px; text-transform: uppercase; letter-spacing: .8px; color: var(--redup); font-weight: 800; }
.pf-data dd { margin: 0; font-size: 14px; }
.pf-bank { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.pf-bank-kartu { width: 300px; max-width: 100%; aspect-ratio: 1.7; border-radius: 18px; padding: 16px 18px; color: #f7f3ea; display: flex; flex-direction: column; justify-content: space-between;
  background: radial-gradient(circle at 90% 10%, rgba(255, 255, 255, .18), transparent 40%), linear-gradient(135deg, #1f4d3a, #2f6b4f 60%, #c2552d 140%); box-shadow: 0 16px 30px -18px #1f4d3a; }
.pf-bank-kartu small { font-weight: 800; letter-spacing: 1px; text-transform: uppercase; font-size: 11.5px; opacity: .85; }
.pf-bank-kartu b { font-size: 20px; letter-spacing: 2px; }
.pf-bank-kartu span { font-size: 12.5px; opacity: .9; }
.pf-kerja { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.pf-kerja div { position: relative; border: 1px solid var(--garis); border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; background: linear-gradient(160deg, #fbf8f2, #fff); }
.pf-kerja span { position: absolute; right: 10px; top: 8px; font-size: 20px; }
.pf-kerja b { font-family: var(--serif); font-size: 30px; color: var(--hutan); line-height: 1.1; }
.pf-kerja small { font-size: 12.5px; font-weight: 700; }
.pf-kerja em { font-style: normal; font-size: 11px; color: var(--redup); }
.pf-tiket { display: flex; align-items: center; gap: 10px; border: 0; border-bottom: 1px dashed var(--garis); background: none; padding: 9px 2px; font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
.pf-tiket:hover { background: #fbf8f2; }
.pf-tiket span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pf-tiket em { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--redup); }
.pf-tanpa-akun { align-items: center; text-align: center; padding: 34px 20px; }
.pf-tanpa-akun div { font-size: 40px; }
.pf-tanpa-akun p { margin: 0 0 6px; color: var(--redup); font-size: 13.5px; max-width: 420px; }
.pf-status-akun { font-size: 12.5px; font-weight: 800; }
.pf-status-akun.on { color: #2f7a4d; } .pf-status-akun.off { color: #b42318; }
.pf-chip { display: inline-block; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: #e6f3ea; color: var(--hutan); margin: 0 4px 4px 0; }
.pf-tombol-baris { display: flex; flex-wrap: wrap; gap: 8px; }
.pf-semua { margin: 0; padding: 12px 14px; border-radius: 14px; background: #fdf3e2; color: #8a5a00; font-weight: 700; font-size: 13.5px; }
.pf-modul { display: flex; flex-wrap: wrap; gap: 6px; }
.pf-modul span { font-size: 12.5px; padding: 5px 11px; border-radius: 99px; background: #f6f1e6; border: 1px solid var(--garis); }

/* Modal */
.pf-lapis { position: fixed; inset: 0; z-index: 800; background: rgba(28, 42, 34, .5); backdrop-filter: blur(3px); display: flex; align-items: flex-start; justify-content: center; padding: 6vh 12px; overflow: auto; }
.pf-modal { width: 100%; max-width: 520px; background: var(--kertas); border-radius: 24px; padding: 22px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 30px 70px -24px rgba(28, 42, 34, .6); animation: pf-muncul .2s; }
.pf-modal.kecil { max-width: 420px; } .pf-modal.lebar { max-width: 680px; }
.pf-modal h3 { margin: 0; font-family: var(--serif); font-size: 22px; }
.pf-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 800; color: #5b5242; text-transform: uppercase; letter-spacing: .5px; }
.pf-field input { text-transform: none; letter-spacing: 0; font-weight: 500; border: 1px solid var(--garis); border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 14px; background: #fff; color: var(--tinta); }
.pf-field input:focus { outline: none; border-color: #2f6b4f; box-shadow: 0 0 0 3px rgba(47, 107, 79, .14); }
.pf-role { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow: auto; text-transform: none; letter-spacing: 0; }
.pf-role label { display: grid; grid-template-columns: auto 1fr; gap: 0 10px; align-items: center; padding: 9px 12px; border: 1px solid var(--garis); border-radius: 12px; background: #fff; cursor: pointer; }
.pf-role label.on { border-color: var(--hutan); background: #eef6f0; }
.pf-role input { grid-row: span 2; }
.pf-role b { font-size: 13.5px; color: var(--tinta); }
.pf-role small { font-size: 11.5px; color: var(--redup); font-weight: 500; }
.pf-galat { margin: 0; padding: 9px 12px; border-radius: 12px; background: #fdecea; color: #b42318; font-size: 13px; }
.pf-modal-kaki { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.pf-admin { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 14px; border: 1.5px dashed #e0c48a; background: #fffaf0; cursor: pointer; font-weight: 700; font-size: 13.5px; }
.pf-admin.on { border-style: solid; background: #fdf3e2; }
.pf-preset { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pf-preset small { font-weight: 700; color: var(--redup); }
.pf-preset button { border: 1px solid var(--garis); background: #fff; border-radius: 99px; padding: 5px 11px; font: inherit; font-size: 12.5px; cursor: pointer; }
.pf-preset button.on { background: var(--hutan); color: #fff; border-color: var(--hutan); }
.pf-modul-pilih { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.pf-modul-pilih label { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--garis); border-radius: 12px; background: #fff; cursor: pointer; font-size: 13px; }
.pf-modul-pilih label.on { border-color: var(--hutan); background: #eef6f0; font-weight: 700; }

@media (max-width: 1000px) { .pf-tata { grid-template-columns: 1fr; } .pf-kiri { position: static; } }
@media (max-width: 640px) { .pf { padding: 12px 12px 60px; } .pf-sampul { padding: 18px; } .pf-sampul h1 { font-size: 26px; } .pf-foto { width: 88px; height: 88px; font-size: 32px; } .pf-data { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
