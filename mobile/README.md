# my-NEXTtech Mobile App

Aplikasi mobile untuk teknisi lapangan PT NEXT1 Indonesia.
Dibangun dengan Ionic + Capacitor + Vue 3 + TypeScript.

## Setup

1. Install dependencies:
   ```bash
   cd mobile && npm install
   ```

2. Copy dan isi environment:
   ```bash
   cp .env.example .env
   # Edit .env — set VITE_API_URL ke endpoint backend
   ```

3. Build web assets:
   ```bash
   npm run build
   ```

4. Tambah platform Android (pertama kali saja):
   ```bash
   npx cap add android
   ```
   Lalu letakkan file `google-services.json` dari Firebase Console
   ke dalam `android/app/`.

5. Sync ke native:
   ```bash
   npx cap sync android
   ```

6. Buka di Android Studio dan build APK:
   ```bash
   npx cap open android
   ```
   Di Android Studio: Build → Generate Signed Bundle/APK

## Fitur

- Login dengan akun CoreUser (NestJS backend)
- Terima & selesaikan trouble ticket
- GPS otomatis update setiap 30 detik (hanya saat app aktif)
- Firebase Push Notification saat tiket baru di-assign

## Catatan

- Semua API route prefix: `/mobile/` — terpisah dari admin web
- JWT mobile berlaku 30 hari
- FCM token di-register otomatis ke backend setelah login
