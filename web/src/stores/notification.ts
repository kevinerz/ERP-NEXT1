import { defineStore } from 'pinia'
import api from '@/services/api'

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    count: 0,
    notifications: [] as any[],
    meta: { total: 0, unread: 0, page: 1, total_pages: 0, limit: 25 },
    loading: false,
    toasts: [] as { id: number; judul: string; deskripsi: string; url?: string }[],
    _pollInterval: null as ReturnType<typeof setInterval> | null,
    _lastSeenId: 0,
  }),

  actions: {
    async fetchCount() {
      try {
        const r = await api.get('/notifications/unread-count')
        const newCount: number = r.data.data.count
        // Jika count naik → ada notif baru, fetch terbaru untuk toast
        if (newCount > this.count && this.count >= 0) {
          await this.checkNewToasts()
        }
        this.count = newCount
      } catch {}
    },

    async checkNewToasts() {
      try {
        const r = await api.get('/notifications', { params: { page: 1 } })
        const items: any[] = r.data.data || []
        const newest = items.filter(n => !n.is_read && n.id_notif > this._lastSeenId)
        newest.slice(0, 3).forEach(n => this.showToast(n))
        if (items.length) this._lastSeenId = items[0].id_notif
        // Sync ke panel kalau sudah terbuka
        if (this.notifications.length) {
          this.notifications = items
          this.meta = r.data.meta
        }
        this.count = r.data.meta.unread
      } catch {}
    },

    async fetchNotifications(page = 1) {
      this.loading = true
      try {
        const r = await api.get('/notifications', { params: { page } })
        this.notifications = r.data.data
        this.meta = r.data.meta
        this.count = r.data.meta.unread
        if (r.data.data.length) this._lastSeenId = r.data.data[0].id_notif
      } catch {}
      finally { this.loading = false }
    },

    async markRead(id: number) {
      try {
        await api.patch(`/notifications/${id}/read`)
        const n = this.notifications.find(n => n.id_notif === id)
        if (n && !n.is_read) {
          n.is_read = true
          this.count = Math.max(0, this.count - 1)
          this.meta.unread = Math.max(0, this.meta.unread - 1)
        }
      } catch {}
    },

    async markAllRead() {
      try {
        await api.patch('/notifications/read-all')
        this.notifications.forEach(n => { n.is_read = true })
        this.count = 0
        this.meta.unread = 0
      } catch {}
    },

    showToast(notif: any) {
      const toast = { id: notif.id_notif, judul: notif.judul, deskripsi: notif.deskripsi, url: notif.url }
      this.toasts.push(toast)
      setTimeout(() => this.dismissToast(toast.id), 5000)
    },

    dismissToast(id: number) {
      this.toasts = this.toasts.filter(t => t.id !== id)
    },

    startPolling() {
      this.fetchCount()
      if (!this._pollInterval) {
        this._pollInterval = setInterval(() => this.fetchCount(), 30000)
      }
    },

    stopPolling() {
      if (this._pollInterval) {
        clearInterval(this._pollInterval)
        this._pollInterval = null
      }
    },
  },
})
