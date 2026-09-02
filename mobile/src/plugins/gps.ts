import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'

let gpsInterval: ReturnType<typeof setInterval> | null = null

export function setupGps() {
  if (!Capacitor.isNativePlatform()) return
  if (gpsInterval) clearInterval(gpsInterval)

  gpsInterval = setInterval(async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
      await api.post('/mobile/lokasi', {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        akurasi: pos.coords.accuracy,
      })
    } catch { /* silent on GPS error */ }
  }, 30000) // every 30 seconds
}

export function stopGps() {
  if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null }
}
