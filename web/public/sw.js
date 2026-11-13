/* Service worker NEXT1 ERP — khusus Web Push obrolan (tanpa cache offline). */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = {} }
  e.waitUntil((async () => {
    const jendela = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // ERP sedang tampil di depan → lencana di aplikasi sudah cukup, tidak perlu notifikasi sistem
    if (jendela.some((c) => c.visibilityState === 'visible' && c.focused)) return
    await self.registration.showNotification(d.judul || 'NEXT1 ERP', {
      body: d.isi || '',
      tag: d.tag || 'chat',
      renotify: true,
      icon: '/logo-nextone.png',
      data: { url: d.url || '/chat' },
    })
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/chat'
  e.waitUntil((async () => {
    const jendela = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of jendela) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url) } catch { /* beda origin */ } } return }
    }
    await self.clients.openWindow(url)
  })())
})
