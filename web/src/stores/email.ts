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
  /** true = dilayani Hostinger Mail API (HTTPS), bukan IMAP/SMTP */
  via_api?: boolean
  fitur?: { bintang: boolean; massal: boolean; kuota: boolean; draf: boolean; hitung_folder: boolean }
}

export interface FolderInfo {
  key: string
  label: string
  path: string
  total?: number | null
  unread?: number | null
}

export interface InboxMessage {
  uid: number
  subject: string
  from: { name?: string; address?: string } | null
  date: string | null
  seen: boolean
  flagged?: boolean
  answered?: boolean
  to?: string
  hasAttachments: boolean
}

export interface MessageDetail {
  uid: number
  subject: string
  from?: string
  to?: string
  cc?: string
  bcc?: string
  date?: string
  html: string | null
  text: string | null
  flagged?: boolean
  from_address?: string
  to_list?: string[]
  cc_list?: string[]
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
    kuota: null as { totalUsage: number; totalLimit: number; totalPercentage: number } | null,
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
    async fetchMessages(params: Record<string, any> = {}, diam = false) {
      if (!diam) this.loading = true
      this.error = ''
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
    async setFlagged(uid: number, flagged: boolean) {
      const row = this.list.find((m) => m.uid === uid)
      const lama = row?.flagged
      if (row) row.flagged = flagged // optimistis — dikembalikan bila gagal
      if (this.current?.uid === uid) this.current.flagged = flagged
      try {
        await api.patch(`/email/messages/${uid}/flag`, { flagged }, { params: { folder: this.currentFolder } })
      } catch (e: any) {
        if (row) row.flagged = lama
        if (this.current?.uid === uid) this.current.flagged = lama
        throw e
      }
    },
    /** Aksi untuk banyak email sekaligus */
    async massal(uids: number[], aksi: string) {
      const r = await api.post('/email/messages/bulk', { folder: this.currentFolder, uids, aksi })
      if (['sampah', 'hapus', 'spam', 'inbox'].includes(aksi)) {
        this.list = this.list.filter((m) => !uids.includes(m.uid))
        if (this.current && uids.includes(this.current.uid)) this.current = null
      } else {
        for (const m of this.list) if (uids.includes(m.uid)) {
          if (aksi === 'baca') m.seen = true
          if (aksi === 'belum') m.seen = false
          if (aksi === 'bintang') m.flagged = true
          if (aksi === 'lepas_bintang') m.flagged = false
        }
      }
      return r.data.message as string
    },
    async fetchKuota() {
      try { this.kuota = (await api.get('/email/quota')).data.data } catch { this.kuota = null }
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
      payload: { to: string; cc?: string; bcc?: string; subject: string; html: string; in_reply_to?: string; ref_jenis?: string; ref_uid?: string; ref_folder?: string },
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
