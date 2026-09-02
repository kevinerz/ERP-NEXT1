import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'

export async function setupPushNotifications() {
  if (!Capacitor.isNativePlatform()) return

  const permResult = await PushNotifications.requestPermissions()
  if (permResult.receive !== 'granted') return

  await PushNotifications.register()

  PushNotifications.addListener('registration', async (token) => {
    try {
      await api.post('/mobile/auth/fcm-token', { fcm_token: token.value })
    } catch { /* silent */ }
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received:', notification)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const ticketId = action.notification.data?.ticket_id
    if (ticketId) {
      // navigate to ticket — handled by router globally
      window.dispatchEvent(new CustomEvent('open-ticket', { detail: ticketId }))
    }
  })
}
