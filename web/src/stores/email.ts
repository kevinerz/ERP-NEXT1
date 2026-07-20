import { defineStore } from 'pinia'
import api from '@/services/api'

export interface EmailAccount {
  id_email_account: number
  id_user: number
  email_address: string
  imap_host: string
  imap_port: number
  smtp_host: string
  smtp_port: number
  is_aktif: boolean
  last_error?: string | null
  connected_at: string
}

export interface FolderInfo {
  key: string
  label: string
  path: string
}

export interface InboxMessage {
  uid: number
  subject: string
  from: { name?: string; address?: string } | null
  date: string | null
  seen: boolean
  hasAttachments: boolean
}

export interface MessageDetail {
  uid: number
  subject: string
  from?: string
  to?: string
  date?: string
  html: string | null
  text: string | null
  attachments: { partId: number; filename: string; size: number; contentType: string }[]
}

export const useEmailStore = defineStore('email', {
  state: () => ({
    account: null as EmailAccount | null,
    accountChecked: false,
    folders: [] as FolderInfo[],
    currentFolder: 'inbox',
    list: [] as InboxMessage[],
    meta: { total: 0, page: 1, limit: 25 },
    current: null as MessageDetail | null,
    loading: false,
    loadingMessage: false,
    error: '',
  }),
  actions: {
    async fetchAccount() {
      try {
        const r = await api.get('/email/account')
        this.account = r.data.data
      } catch { this.account = null }
      finally { this.accountChecked = true }
    },
    async connect(payload: Record<string, any>) {
      const r = await api.post('/email/account', payload)
      this.account = r.data.data
      return r.data
    },
    async disconnect() {
      await api.delete('/email/account')
      this.account = null
      this.folders = []
      this.currentFolder = 'inbox'
      this.list = []
      this.current = null
    },
    async fetchFolders() {
      try {
        const r = await api.get('/email/folders')
        this.folders = r.data.data
      } catch { this.folders = [] }
    },
    async switchFolder(key: string) {
      this.currentFolder = key
      this.current = null
      this.list = []
      await this.fetchMessages({ page: 1 })
    },
    async fetchMessages(params: Record<string, any> = {}) {
      this.loading = true; this.error = ''
      try {
        const r = await api.get('/email/messages', { params: { ...params, folder: this.currentFolder } })
        this.list = r.data.data
        this.meta = r.data.meta
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat email' }
      finally { this.loading = false }
    },
    async fetchMessage(uid: number) {
      this.loadingMessage = true; this.error = ''
      try {
        const r = await api.get(`/email/messages/${uid}`, { params: { folder: this.currentFolder } })
        this.current = r.data.data
        const row = this.list.find((m) => m.uid === uid)
        if (row) row.seen = true
      } catch (e: any) { this.error = e.response?.data?.message || 'Gagal memuat email' }
      finally { this.loadingMessage = false }
    },
    async setSeen(uid: number, seen: boolean) {
      try {
        await api.patch(`/email/messages/${uid}/read`, { seen }, { params: { folder: this.currentFolder } })
        const row = this.list.find((m) => m.uid === uid)
        if (row) row.seen = seen
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal memperbarui status email'
        throw e
      }
    },
    async deleteMessage(uid: number) {
      try {
        await api.delete(`/email/messages/${uid}`, { params: { folder: this.currentFolder } })
        this.list = this.list.filter((m) => m.uid !== uid)
        if (this.current?.uid === uid) this.current = null
      } catch (e: any) {
        this.error = e.response?.data?.message || 'Gagal menghapus email'
        throw e
      }
    },
    async sendMail(
      payload: { to: string; cc?: string; bcc?: string; subject: string; html: string; in_reply_to?: string },
      files?: File[],
      draftUid?: number | null,
    ) {
      const fd = new FormData()
      Object.entries(payload).forEach(([k, v]) => { if (v) fd.append(k, v as string) })
      if (draftUid) fd.append('draft_uid', String(draftUid))
      files?.forEach((f) => fd.append('files', f))
      await api.post('/email/send', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    async saveDraft(
      payload: { to?: string; cc?: string; bcc?: string; subject?: string; html?: string },
      files?: File[],
      replaceUid?: number | null,
    ) {
      const fd = new FormData()
      Object.entries(payload).forEach(([k, v]) => { if (v) fd.append(k, v as string) })
      if (replaceUid) fd.append('replace_uid', String(replaceUid))
      files?.forEach((f) => fd.append('files', f))
      const r = await api.post('/email/drafts', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      return (r.data.data?.uid ?? null) as number | null
    },
    async deleteDraft(uid: number) {
      await api.delete(`/email/drafts/${uid}`)
      this.list = this.list.filter((m) => m.uid !== uid)
      if (this.current?.uid === uid) this.current = null
    },
    async downloadAttachment(uid: number, partId: number, filename: string) {
      const r = await api.get(`/email/messages/${uid}/attachment/${partId}`, {
        params: { folder: this.currentFolder },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(r.data as Blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  },
})
