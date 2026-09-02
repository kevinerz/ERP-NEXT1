import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'

let gpsInterval: ReturnType<typeof setInterval> | null = null
let onSuccessCallback: (() => void) | null = null
let permissionGranted = false

async function requestGpsPermission(): Promise<boolean> {
  try {
    const status = await Geolocation.requestPermissions()
    permissionGranted = status.location === 'granted' || status.coarseLocation === 'granted'
    return permissionGranted
  } catch {
    return false
  }
}

async function postLocation(onSuccess?: () => void): Promise<boolean> {
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 12000,
    })
    await api.post('/mobile/lokasi', {
      latitude:  pos.coords.latitude,
      longitude: pos.coords.longitude,
      akurasi:   Math.round(pos.coords.accuracy),
    })
    onSuccess?.()
    onSuccessCallback?.()
    return true
  } catch {
    return false
  }
}

export async function setupGps(onSuccess?: () => void) {
  if (!Capacitor.isNativePlatform()) return
  if (onSuccess) onSuccessCallback = onSuccess
  if (gpsInterval) clearInterval(gpsInterval)

  // Minta permission sebelum mulai
  if (!permissionGranted) {
    const granted = await requestGpsPermission()
    if (!granted) return
  }

  // Kirim langsung pertama kali
  postLocation(onSuccess)

  gpsInterval = setInterval(() => postLocation(), 10000)
}

export function stopGps() {
  if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null }
  onSuccessCallback = null
}

export async function sendLocationNow(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  return postLocation()
}
