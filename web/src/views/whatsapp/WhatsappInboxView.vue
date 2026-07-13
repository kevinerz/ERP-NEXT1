<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWhatsappStore } from '@/stores/whatsapp'

const wa = useWhatsappStore()
const connecting = ref(false)
const selectedId = ref<number | null>(null)
const messageText = ref('')
const sending = ref(false)
const sendError = ref('')
const messagesEnd = ref<HTMLElement | null>(null)

let statusTimer: ReturnType<typeof setInterval> | null = null
let dataTimer: ReturnType<typeof setInterval> | null = null

const isConnected = computed(() => wa.status === 'connected')
const isWaitingQr = computed(() => wa.status === 'qr_pending' || wa.status === 'connecting')

async function mulaiConnect() {
  connecting.value = true
  try {
    await wa.connect()
    await pollUntilResolved()
  } finally { connecting.value = false }
}

async function pollUntilResolved() {
  if (statusTimer) clearInterval(statusTimer)
  statusTimer = setInterval(async () => {
    await wa.fetchQr()
    if (wa.status === 'connected') {
      clearInterval(statusTimer!); statusTimer = null
      await wa.fetchChats()
      startDataPolling()
    }
  }, 2000)
}

function startDataPolling() {
  if (dataTimer) clearInterval(dataTimer)
  dataTimer = setInterval(async () => {
    await wa.fetchChats()
    if (selectedId.value) await wa.fetchMessages(selectedId.value)
  }, 5000)
}

async function bukaChat(idChat: number) {
  selectedId.value = idChat
  await wa.fetchMessages(idChat)
  scrollToEnd()
}

async function kirimPesan() {
  const text = messageText.value.trim()
  if (!text || !selectedId.value) return
  sending.value = true; sendError.value = ''
  try {
    await wa.kirim(selectedId.value, text)
    messageText.value = ''
    await wa.fetchMessages(selectedId.value)
    scrollToEnd()
  } catch (e: any) {
    sendError.value = e.response?.data?.message || 'Gagal mengirim'
  } finally { sending.value = false }
}

function scrollToEnd() {
  setTimeout(() => messagesEnd.value?.scrollIntoView({ behavior: 'smooth' }), 100)
}

async function handleDisconnect() {
  if (!confirm('Putuskan koneksi WhatsApp? Semua orang di tim perlu scan QR lagi untuk connect ulang.')) return
  if (statusTimer) clearInterval(statusTimer)
  if (dataTimer) clearInterval(dataTimer)
  await wa.disconnect()
}

function fmtWaktu(d?: string | null) {
  if (!d) return '—'
  const date = new Date(d)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

onMounted(async () => {
  await wa.fetchStatus()
  if (wa.status === 'connected') {
    await wa.fetchChats()
    startDataPolling()
  } else if (wa.status === 'qr_pending' || wa.status === 'connecting') {
    await wa.fetchQr()
    await pollUntilResolved()
  }
})

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
  if (dataTimer) clearInterval(dataTimer)
})
</script>

<template>
  <div class="page">
    <!-- ─── BELUM CONNECT ─── -->
    <div v-if="!isConnected" class="connect-wrap">
      <div class="connect-card">
        <h2>💬 Hubungkan WhatsApp</h2>
        <p class="sub">Satu koneksi dipakai bersama seluruh tim — scan sekali pakai WhatsApp nomor perusahaan.</p>

        <div v-if="isWaitingQr && wa.qr" class="qr-box">
          <img :src="wa.qr" alt="QR WhatsApp" class="qr-img" />
          <p class="qr-hint">Buka WhatsApp di HP → Perangkat Tertaut → Tautkan Perangkat → scan QR ini</p>
        </div>
        <div v-else-if="isWaitingQr" class="qr-box">
          <p class="qr-hint">Menyiapkan QR...</p>
        </div>
        <button v-else class="btn-submit" @click="mulaiConnect" :disabled="connecting">
          {{ connecting ? 'Menyiapkan...' : 'Mulai Hubungkan' }}
        </button>
      </div>
    </div>

    <!-- ─── CHAT ─── -->
    <div v-else class="chat-layout">
      <div class="chat-header">
        <h2>💬 WhatsApp</h2>
        <button class="btn-secondary" @click="handleDisconnect">Putuskan</button>
      </div>

      <p v-if="wa.error" class="msg err">{{ wa.error }}</p>

      <div class="split">
        <div class="list-pane">
          <div v-if="wa.loadingChats && !wa.chats.length" class="loading">Memuat chat...</div>
          <div v-else-if="!wa.chats.length" class="empty">Belum ada chat masuk</div>
          <div v-else class="chat-list">
            <div v-for="c in wa.chats" :key="c.id_chat"
              :class="['chat-row', { unread: c.unread_count > 0, active: selectedId === c.id_chat }]"
              @click="bukaChat(c.id_chat)">
              <div class="chat-row-top">
                <span class="chat-name">{{ c.nama_kontak || c.jid.split('@')[0] }}</span>
                <span class="chat-time">{{ fmtWaktu(c.waktu_terakhir) }}</span>
              </div>
              <div class="chat-preview">
                {{ c.pesan_terakhir || '—' }}
                <span v-if="c.unread_count > 0" class="unread-badge">{{ c.unread_count }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-pane">
          <div v-if="!selectedId" class="empty">Pilih chat untuk mulai membaca</div>
          <template v-else>
            <div class="thread-header">
              <strong>{{ wa.current?.nama_kontak || wa.current?.jid.split('@')[0] }}</strong>
              <span class="text-gray text-sm">{{ wa.current?.jid.split('@')[0] }}</span>
            </div>
            <div class="thread-body">
              <div v-if="wa.loadingMessages" class="loading">Memuat pesan...</div>
              <template v-else>
                <div v-for="m in wa.messages" :key="m.id_pesan" :class="['bubble-row', { me: m.from_me }]">
                  <div class="bubble">
                    <div v-if="m.tipe !== 'text'" class="bubble-media">📎 [{{ m.tipe }}]</div>
                    <div class="bubble-text">{{ m.body || '(tanpa isi)' }}</div>
                    <div class="bubble-time">{{ fmtWaktu(m.waktu) }}</div>
                  </div>
                </div>
                <div ref="messagesEnd"></div>
              </template>
            </div>
            <div class="thread-input">
              <input v-model="messageText" @keyup.enter="kirimPesan" placeholder="Ketik pesan..." :disabled="sending" />
              <button class="btn-send" @click="kirimPesan" :disabled="sending || !messageText.trim()">
                {{ sending ? '...' : 'Kirim' }}
              </button>
            </div>
            <p v-if="sendError" class="msg err">{{ sendError }}</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 1300px; }
.loading, .empty { padding: 40px; text-align: center; color: #94a3b8; }

.connect-wrap { display: flex; justify-content: center; padding-top: 20px; }
.connect-card { background: #fff; border-radius: 14px; padding: 32px; width: 420px; max-width: 95vw; box-shadow: 0 1px 3px rgba(0,0,0,0.07); text-align: center; }
.connect-card h2 { margin: 0 0 8px; font-size: 20px; color: #0f172a; }
.sub { margin: 0 0 20px; font-size: 13px; color: #64748b; }
.qr-box { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.qr-img { width: 240px; height: 240px; border: 1px solid #e2e8f0; border-radius: 8px; }
.qr-hint { font-size: 12px; color: #64748b; text-align: center; }
.btn-submit { padding: 10px 24px; background: linear-gradient(135deg, #15803d, #22c55e); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.msg { font-size: 13px; margin: 8px 0; }
.msg.err { color: #dc2626; }

.chat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.chat-header h2 { margin: 0; font-size: 22px; color: #0f172a; }
.btn-secondary { padding: 8px 16px; background: #fff; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }

.split { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
.list-pane, .detail-pane { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; min-height: 500px; display: flex; flex-direction: column; }
.chat-list { max-height: 680px; overflow-y: auto; }
.chat-row { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
.chat-row:hover { background: #f8fafc; }
.chat-row.active { background: #eff6ff; }
.chat-row.unread .chat-name { font-weight: 700; }
.chat-row-top { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
.chat-name { font-weight: 600; color: #0f172a; font-size: 13px; }
.chat-preview { font-size: 12px; color: #64748b; margin-top: 3px; display: flex; justify-content: space-between; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.unread-badge { background: #22c55e; color: #fff; border-radius: 10px; padding: 1px 7px; font-size: 10px; font-weight: 700; flex-shrink: 0; margin-left: 6px; }

.thread-header { padding: 14px 20px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: baseline; gap: 8px; }
.text-gray { color: #94a3b8; }
.text-sm { font-size: 12px; }
.thread-body { flex: 1; padding: 16px 20px; overflow-y: auto; max-height: 560px; display: flex; flex-direction: column; gap: 8px; }
.bubble-row { display: flex; }
.bubble-row.me { justify-content: flex-end; }
.bubble { max-width: 70%; background: #f1f5f9; border-radius: 10px; padding: 8px 12px; }
.bubble-row.me .bubble { background: #dcfce7; }
.bubble-media { font-size: 11px; color: #64748b; margin-bottom: 2px; }
.bubble-text { font-size: 14px; color: #0f172a; white-space: pre-wrap; word-break: break-word; }
.bubble-time { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 3px; }
.thread-input { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #f1f5f9; }
.thread-input input { flex: 1; padding: 9px 14px; border: 1.5px solid #e2e8f0; border-radius: 20px; font-size: 14px; outline: none; }
.thread-input input:focus { border-color: #22c55e; }
.btn-send { padding: 9px 20px; background: #22c55e; color: #fff; border: none; border-radius: 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
