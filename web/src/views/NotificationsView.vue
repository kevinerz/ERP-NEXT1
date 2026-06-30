<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '@/stores/notification'

const router = useRouter()
const notif = useNotificationStore()

onMounted(() => notif.fetchNotifications())

function goNotif(n: any) {
  notif.markRead(n.id_notif)
  if (n.url) router.push(n.url)
}

function loadMore() {
  if (notif.meta.page < notif.meta.total_pages) {
    notif.fetchNotifications(notif.meta.page + 1)
  }
}

const TIPE_ICON: Record<string, string> = {
  tiket_baru:         '🎫',
  tiket_update:       '🔄',
  quotation_approval: '📋',
}

function fmtTime(d: string) {
  const diffMin = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (diffMin < 1)  return 'baru saja'
  if (diffMin < 60) return `${diffMin} menit lalu`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `${diffH} jam lalu`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7)    return `${diffD} hari lalu`
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Notifikasi</h2>
        <p class="sub">Semua aktivitas & pembaruan sistem</p>
      </div>
      <button
        v-if="notif.count > 0"
        class="btn-read-all"
        @click="notif.markAllRead()"
      >
        Tandai semua dibaca
      </button>
    </div>

    <div class="notif-card">
      <div v-if="notif.loading && !notif.notifications.length" class="state">
        Memuat notifikasi...
      </div>

      <div v-else-if="!notif.notifications.length" class="state empty">
        <div class="empty-icon">🎉</div>
        <div>Tidak ada notifikasi</div>
      </div>

      <div v-else>
        <div
          v-for="n in notif.notifications"
          :key="n.id_notif"
          :class="['notif-item', { unread: !n.is_read, clickable: !!n.url }]"
          @click="goNotif(n)"
        >
          <div class="notif-ico">{{ TIPE_ICON[n.tipe] || '🔔' }}</div>
          <div class="notif-body">
            <div class="notif-judul">{{ n.judul }}</div>
            <div v-if="n.deskripsi" class="notif-desc">{{ n.deskripsi }}</div>
            <div class="notif-time">{{ fmtTime(n.created_at) }}</div>
          </div>
          <div class="notif-right">
            <span v-if="!n.is_read" class="unread-dot"></span>
            <span v-else class="read-label">Dibaca</span>
          </div>
        </div>

        <!-- Load more -->
        <div v-if="notif.meta.page < notif.meta.total_pages" class="load-more">
          <button class="btn-load-more" @click="loadMore" :disabled="notif.loading">
            {{ notif.loading ? 'Memuat...' : 'Muat lebih banyak' }}
          </button>
        </div>
      </div>

      <!-- Footer info -->
      <div v-if="notif.notifications.length" class="footer-info">
        Menampilkan {{ notif.notifications.length }} dari {{ notif.meta.total }} notifikasi
        <span v-if="notif.meta.unread > 0"> · <strong>{{ notif.meta.unread }} belum dibaca</strong></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 800px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0; font-size: 13px; color: #64748b; }
.btn-read-all { padding: 8px 16px; background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-read-all:hover { background: #dbeafe; }

.notif-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; }

.state { padding: 60px 20px; text-align: center; color: #94a3b8; font-size: 14px; }
.state.empty .empty-icon { font-size: 40px; margin-bottom: 12px; }

.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.12s;
}
.notif-item:last-child { border-bottom: none; }
.notif-item.unread { background: #f0f7ff; }
.notif-item.clickable { cursor: pointer; }
.notif-item.clickable:hover { background: #e8f0fe; }
.notif-item.unread.clickable:hover { background: #dbeafe; }

.notif-ico { font-size: 24px; flex-shrink: 0; margin-top: 2px; }

.notif-body { flex: 1; min-width: 0; }
.notif-judul { font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.4; }
.notif-desc { font-size: 13px; color: #64748b; margin-top: 3px; }
.notif-time { font-size: 12px; color: #94a3b8; margin-top: 5px; }

.notif-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.unread-dot { width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; margin-top: 6px; display: block; }
.read-label { font-size: 11px; color: #cbd5e1; margin-top: 6px; }

.load-more { padding: 14px 20px; text-align: center; border-top: 1px solid #f1f5f9; }
.btn-load-more { padding: 8px 24px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; }
.btn-load-more:hover:not(:disabled) { background: #f1f5f9; }
.btn-load-more:disabled { opacity: 0.5; cursor: not-allowed; }

.footer-info { padding: 10px 20px; background: #f8fafc; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center; }
.footer-info strong { color: #1d4ed8; }
</style>
