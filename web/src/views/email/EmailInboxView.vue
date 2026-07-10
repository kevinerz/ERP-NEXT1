<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useEmailStore } from '@/stores/email'

const email = useEmailStore()

// ─── CONNECT FORM ─────────────────────────────────────────────
const connecting = ref(false)
const connectError = ref('')
const form = ref({ email_address: '', password: '', imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 465 })

function pakaiPresetHostinger() {
  form.value.imap_host = 'imap.hostinger.com'
  form.value.imap_port = 993
  form.value.smtp_host = 'smtp.hostinger.com'
  form.value.smtp_port = 465
}

async function handleConnect() {
  if (!form.value.email_address || !form.value.password || !form.value.imap_host || !form.value.smtp_host) {
    connectError.value = 'Semua field wajib diisi'; return
  }
  connecting.value = true; connectError.value = ''
  try {
    await email.connect(form.value)
    await loadInbox()
  } catch (e: any) { connectError.value = e.response?.data?.message || 'Gagal terhubung' }
  finally { connecting.value = false }
}

async function handleDisconnect() {
  if (!confirm(`Putuskan koneksi dari ${email.account?.email_address}? Kamu bisa connect lagi kapan saja.`)) return
  await email.disconnect()
}

// ─── INBOX ────────────────────────────────────────────────────
const page = ref(1)
const search = ref('')
const selectedUid = ref<number | null>(null)

async function loadInbox() {
  await email.fetchInbox({ page: page.value, search: search.value || undefined })
}
function doSearch() { page.value = 1; loadInbox() }
function goPage(p: number) { page.value = p; loadInbox() }

async function openMessage(uid: number) {
  selectedUid.value = uid
  await email.fetchMessage(uid)
}

async function toggleSeen(m: any, e: Event) {
  e.stopPropagation()
  await email.setSeen(m.uid, !m.seen)
}

async function hapusEmail(uid: number) {
  if (!confirm('Hapus email ini?')) return
  await email.deleteMessage(uid)
  if (selectedUid.value === uid) selectedUid.value = null
}

function fmtTgl(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ─── COMPOSE ──────────────────────────────────────────────────
const showCompose = ref(false)
const composeForm = ref({ to: '', cc: '', bcc: '', subject: '', html: '', in_reply_to: '' })
const composeFiles = ref<File[]>([])
const sending = ref(false)
const sendError = ref('')
const showCc = ref(false)

function bukaCompose() {
  composeForm.value = { to: '', cc: '', bcc: '', subject: '', html: '', in_reply_to: '' }
  composeFiles.value = []
  showCc.value = false
  sendError.value = ''
  showCompose.value = true
}
function bukaBalas() {
  if (!email.current) return
  const fromAddr = email.current.from?.match(/<(.+)>/)?.[1] || email.current.from || ''
  composeForm.value = {
    to: fromAddr,
    cc: '', bcc: '',
    subject: email.current.subject.startsWith('Re:') ? email.current.subject : `Re: ${email.current.subject}`,
    html: `<br><br><hr><p>Pada ${fmtTgl(email.current.date)}, ${email.current.from} menulis:</p><blockquote>${email.current.html || email.current.text || ''}</blockquote>`,
    in_reply_to: String(email.current.uid),
  }
  composeFiles.value = []
  showCc.value = false
  sendError.value = ''
  showCompose.value = true
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) composeFiles.value = [...composeFiles.value, ...Array.from(input.files)]
}
function hapusFile(i: number) { composeFiles.value.splice(i, 1) }

async function kirimEmail() {
  if (!composeForm.value.to || !composeForm.value.subject) {
    sendError.value = 'Tujuan dan subjek wajib diisi'; return
  }
  sending.value = true; sendError.value = ''
  try {
    await email.sendMail(composeForm.value, composeFiles.value)
    showCompose.value = false
  } catch (e: any) { sendError.value = e.response?.data?.message || 'Gagal mengirim email' }
  finally { sending.value = false }
}

onMounted(async () => {
  await email.fetchAccount()
  if (email.account) await loadInbox()
})

const totalPages = computed(() => Math.max(1, Math.ceil(email.meta.total / email.meta.limit)))
</script>

<template>
  <div class="page">
    <!-- ─── BELUM CONNECT ─── -->
    <div v-if="email.accountChecked && !email.account" class="connect-wrap">
      <div class="connect-card">
        <h2>📧 Hubungkan Email</h2>
        <p class="sub">Masukkan detail akun email (IMAP/SMTP) — password disimpan terenkripsi, hanya kamu yang bisa akses inbox ini.</p>
        <button class="btn-preset" @click="pakaiPresetHostinger">⚡ Isi otomatis untuk Hostinger</button>
        <div class="field">
          <label>Alamat Email</label>
          <input v-model="form.email_address" type="email" placeholder="nama@weslink.id" />
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="form.password" type="password" placeholder="Password email" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Server Masuk (IMAP)</label>
            <input v-model="form.imap_host" placeholder="imap.hostinger.com" />
          </div>
          <div class="field small">
            <label>Port</label>
            <input v-model.number="form.imap_port" type="number" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Server Keluar (SMTP)</label>
            <input v-model="form.smtp_host" placeholder="smtp.hostinger.com" />
          </div>
          <div class="field small">
            <label>Port</label>
            <input v-model.number="form.smtp_port" type="number" />
          </div>
        </div>
        <p v-if="connectError" class="msg err">{{ connectError }}</p>
        <button class="btn-submit" @click="handleConnect" :disabled="connecting">
          {{ connecting ? 'Menghubungkan...' : 'Hubungkan' }}
        </button>
      </div>
    </div>

    <!-- ─── INBOX ─── -->
    <div v-else-if="email.account" class="inbox-layout">
      <div class="inbox-header">
        <div>
          <h2>📧 Email</h2>
          <p class="sub">{{ email.account.email_address }}</p>
        </div>
        <div class="header-actions">
          <button class="btn-primary" @click="bukaCompose">✏️ Tulis Email</button>
          <button class="btn-secondary" @click="handleDisconnect">Putuskan</button>
        </div>
      </div>

      <div class="filters">
        <input v-model="search" @keyup.enter="doSearch" placeholder="🔍 Cari subjek / pengirim / isi..." class="search-input" />
        <button class="btn-search" @click="doSearch">Cari</button>
      </div>

      <p v-if="email.error" class="msg err">{{ email.error }}</p>

      <div class="split">
        <div class="list-pane">
          <div v-if="email.loading" class="loading">Memuat inbox...</div>
          <div v-else-if="!email.list.length" class="empty">Tidak ada email</div>
          <div v-else class="msg-list">
            <div v-for="m in email.list" :key="m.uid"
              :class="['msg-row', { unread: !m.seen, active: selectedUid === m.uid }]"
              @click="openMessage(m.uid)">
              <div class="msg-row-top">
                <span class="msg-from">{{ m.from?.name || m.from?.address || '(tanpa pengirim)' }}</span>
                <span class="msg-date">{{ fmtTgl(m.date) }}</span>
              </div>
              <div class="msg-subject">{{ m.subject }} <span v-if="m.hasAttachments">📎</span></div>
              <div class="msg-actions">
                <button class="link-btn" @click="toggleSeen(m, $event)">{{ m.seen ? 'Tandai belum dibaca' : 'Tandai dibaca' }}</button>
                <button class="link-btn danger" @click.stop="hapusEmail(m.uid)">Hapus</button>
              </div>
            </div>
          </div>
          <div v-if="totalPages > 1" class="pagination">
            <button class="page-btn" :disabled="page === 1" @click="goPage(page - 1)">‹</button>
            <span class="page-info">Halaman {{ page }} / {{ totalPages }}</span>
            <button class="page-btn" :disabled="page === totalPages" @click="goPage(page + 1)">›</button>
          </div>
        </div>

        <div class="detail-pane">
          <div v-if="email.loadingMessage" class="loading">Memuat email...</div>
          <div v-else-if="!email.current" class="empty">Pilih email untuk membaca</div>
          <div v-else class="msg-detail">
            <div class="detail-header">
              <h3>{{ email.current.subject }}</h3>
              <button class="btn-primary sm" @click="bukaBalas">↩️ Balas</button>
            </div>
            <div class="detail-meta">
              <div><strong>Dari:</strong> {{ email.current.from }}</div>
              <div v-if="email.current.to"><strong>Kepada:</strong> {{ email.current.to }}</div>
              <div><strong>Tanggal:</strong> {{ fmtTgl(email.current.date) }}</div>
            </div>
            <div v-if="email.current.attachments.length" class="attachments">
              <div v-for="a in email.current.attachments" :key="a.partId" class="attachment-chip"
                @click="email.downloadAttachment(email.current!.uid, a.partId, a.filename)">
                📎 {{ a.filename }} <span class="text-gray">({{ fmtSize(a.size) }})</span>
              </div>
            </div>
            <div class="detail-body" v-if="email.current.html" v-html="email.current.html"></div>
            <pre class="detail-body-text" v-else-if="email.current.text">{{ email.current.text }}</pre>
            <p v-else class="empty">(Email tanpa isi)</p>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="loading">Memuat...</div>

    <!-- ─── MODAL COMPOSE ─── -->
    <div v-if="showCompose" class="modal-overlay" @click.self="showCompose = false">
      <div class="modal">
        <h3>✏️ Tulis Email</h3>
        <div class="field">
          <label>Kepada</label>
          <input v-model="composeForm.to" placeholder="tujuan@email.com" />
        </div>
        <button v-if="!showCc" class="link-btn" @click="showCc = true">+ Cc/Bcc</button>
        <template v-else>
          <div class="field">
            <label>Cc</label>
            <input v-model="composeForm.cc" placeholder="cc@email.com" />
          </div>
          <div class="field">
            <label>Bcc</label>
            <input v-model="composeForm.bcc" placeholder="bcc@email.com" />
          </div>
        </template>
        <div class="field">
          <label>Subjek</label>
          <input v-model="composeForm.subject" placeholder="Subjek email" />
        </div>
        <div class="field">
          <label>Isi</label>
          <textarea v-model="composeForm.html" rows="8" placeholder="Tulis pesan..."></textarea>
        </div>
        <div class="field">
          <label class="upload-label">
            <input type="file" multiple hidden @change="handleFileInput" />
            <span>📎 Lampirkan File</span>
          </label>
          <div v-if="composeFiles.length" class="file-list">
            <span v-for="(f, i) in composeFiles" :key="i" class="file-chip">
              {{ f.name }} <button @click="hapusFile(i)">×</button>
            </span>
          </div>
        </div>
        <p v-if="sendError" class="msg err">{{ sendError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showCompose = false">Batal</button>
          <button class="btn-submit" @click="kirimEmail" :disabled="sending">
            {{ sending ? 'Mengirim...' : 'Kirim' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1300px; }
.loading, .empty { padding: 40px; text-align: center; color: #94a3b8; }

/* Connect form */
.connect-wrap { display: flex; justify-content: center; padding-top: 20px; }
.connect-card { background: #fff; border-radius: 14px; padding: 32px; width: 480px; max-width: 95vw; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.connect-card h2 { margin: 0 0 8px; font-size: 20px; color: #0f172a; }
.sub { margin: 0 0 16px; font-size: 13px; color: #64748b; }
.btn-preset { width: 100%; padding: 9px; margin-bottom: 16px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.field.small { max-width: 90px; }
.field-row { display: flex; gap: 10px; }
.field-row .field { flex: 1; }
.field label { font-size: 13px; font-weight: 600; color: #374151; }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; background: #f8fafc; color: #0f172a; font-family: inherit; }
.field input:focus, .field textarea:focus { border-color: #3b82f6; background: #fff; }
.btn-submit { width: 100%; padding: 10px; margin-top: 6px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.msg { font-size: 13px; margin: 8px 0; }
.msg.err { color: #dc2626; }

/* Inbox layout */
.inbox-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.inbox-header h2 { margin: 0 0 2px; font-size: 22px; color: #0f172a; }
.header-actions { display: flex; gap: 10px; }
.btn-primary { padding: 10px 18px; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary.sm { padding: 6px 14px; font-size: 13px; }
.btn-secondary { padding: 10px 16px; background: #fff; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.filters { display: flex; gap: 8px; margin-bottom: 14px; }
.search-input { flex: 1; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; }
.btn-search { padding: 9px 16px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }

.split { display: grid; grid-template-columns: 380px 1fr; gap: 16px; align-items: start; }
.list-pane, .detail-pane { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; min-height: 400px; }
.msg-list { max-height: 640px; overflow-y: auto; }
.msg-row { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
.msg-row:hover { background: #f8fafc; }
.msg-row.active { background: #eff6ff; }
.msg-row.unread .msg-from, .msg-row.unread .msg-subject { font-weight: 700; }
.msg-row-top { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 2px; }
.msg-from { font-weight: 600; color: #0f172a; }
.msg-subject { font-size: 13px; color: #334155; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.msg-actions { display: flex; gap: 10px; }
.link-btn { background: none; border: none; padding: 0; font-size: 11px; color: #1d4ed8; cursor: pointer; }
.link-btn.danger { color: #dc2626; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px; border-top: 1px solid #f1f5f9; }
.page-btn { padding: 4px 10px; border: 1.5px solid #e2e8f0; border-radius: 6px; background: #fff; cursor: pointer; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 12px; color: #64748b; }

.msg-detail { padding: 20px 24px; }
.detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.detail-header h3 { margin: 0; font-size: 17px; color: #0f172a; }
.detail-meta { font-size: 13px; color: #475569; margin-bottom: 14px; display: flex; flex-direction: column; gap: 3px; }
.attachments { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.attachment-chip { padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; font-size: 12px; cursor: pointer; }
.attachment-chip:hover { background: #eff6ff; }
.text-gray { color: #94a3b8; }
.detail-body { font-size: 14px; color: #0f172a; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 14px; overflow-x: auto; }
.detail-body-text { font-size: 14px; color: #0f172a; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 14px; white-space: pre-wrap; font-family: inherit; }

/* Compose modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; padding: 28px 32px; width: 560px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal h3 { margin: 0 0 16px; font-size: 18px; color: #0f172a; }
.upload-label { display: inline-block; padding: 8px 14px; background: #f1f5f9; border-radius: 8px; font-size: 13px; cursor: pointer; }
.file-list { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.file-chip { padding: 4px 10px; background: #eff6ff; border-radius: 12px; font-size: 12px; color: #1d4ed8; }
.file-chip button { background: none; border: none; color: #1d4ed8; cursor: pointer; margin-left: 4px; font-weight: 700; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.btn-cancel { padding: 9px 18px; background: #f1f5f9; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; }
</style>
