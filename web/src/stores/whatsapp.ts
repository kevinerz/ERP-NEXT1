import { defineStore } from 'pinia'
import api from '@/services/api'

export type WaStatus = 'disconnected' | 'connecting' | 'qr_pending' | 'connected'

export interface WaChat {
  id_chat: number
  jid: string
  nama_kontak?: string | null
  pesan_terakhir?: string | null
  waktu_terakhir?: string | null
  unread_count: number
}

export interface WaMessage {
  id_pesan: number
  id_chat: number
  message_id: string
  from_me: boolean
  body?: string | null
  tipe: string
  waktu: string
  user?: { karyawan?: { nama_lengkap: string } } | null
}

export const useWhatsappStore = defineStore('whatsapp', {
  state: () => ({
    status: 'disconnected' as WaStatus,
    qr: null as string | null,
    chats: [] as WaChat[],
    current: null as WaChat | null,
    messages: [] as WaMessage[],
    loadingChats: false,
    loadingMessages: false,
    error: '',
  }),
  actions: {
    async fetchStatus() {
      try {
        const r = await api.get('/socialchat/status')
        this.status = r.data.data.status
      } catch { /* silent */ }
    },
    async fetchQr() {
      try {
        const r = await api.get('/socialchat/qr')
        this.qr = r.data.data.qr
        this.status = r.data.data.status
      } catch { /* silent */ }
    },
    async connect() {
      await api.post('/socialchat/connect')
    },
    async disconnect() {
      await api.post('/socialchat/disconnect')
      this.status = 'disconnected'
      this.qr = null
      this.chats = []
      this.current = null
      this.messages = []
    },
    async fetchChats() {
      this.loadingChats = true; this.error = ''
      try {
        const r = await api.get('/socialchat/chats')
        this.chats = r.data.data
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat chat' }
      finally { this.loadingChats = false }
    },
    async fetchMessages(idChat: number) {
      this.loadingMessages = true; this.error = ''
      try {
        const r = await api.get(`/socialchat/chats/${idChat}/messages`)
        this.messages = r.data.data
        this.current = r.data.chat
        const row = this.chats.find((c) => c.id_chat === idChat)
        if (row) row.unread_count = 0
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat pesan' }
      finally { this.loadingMessages = false }
    },
    async kirim(idChat: number, text: string) {
      await api.post('/socialchat/send', { id_chat: idChat, text })
    },
  },
})
