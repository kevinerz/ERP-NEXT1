import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  onModuleInit() {
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }

    // Load service account dari file (tidak masuk git)
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      || path.join(process.env.HOME || '/root', 'erp-next1', 'firebase-service-account.json');

    if (!fs.existsSync(saPath)) {
      this.logger.warn(`Firebase service account tidak ditemukan di ${saPath} — push notification dinonaktifkan`);
      return;
    }

    try {
      const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.initialized = true;
      this.logger.log('Firebase Admin SDK initialized');
    } catch (e) {
      this.logger.error('Gagal init Firebase Admin SDK:', e);
    }
  }

  async sendToToken(fcmToken: string, title: string, body: string, data?: Record<string, string>) {
    if (!this.initialized || !fcmToken) return;
    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'tiket_notif',
          },
        },
      });
    } catch (e) {
      this.logger.warn(`FCM send gagal untuk token ${fcmToken?.slice(0, 20)}...: ${e}`);
    }
  }

  async sendTicketAssigned(fcmToken: string, nomorTiket: string, judulTiket: string, prioritas: string, ticketId: number) {
    const priLabel = { Critical: '🔴 CRITICAL', High: '🟠 HIGH', Medium: '🔵 MEDIUM', Low: '⚪ LOW' }[prioritas] ?? prioritas;
    await this.sendToToken(
      fcmToken,
      `${priLabel} — Tiket Baru Ditugaskan`,
      `${nomorTiket}: ${judulTiket}`,
      { ticket_id: String(ticketId), type: 'ticket_assigned' },
    );
  }
}
