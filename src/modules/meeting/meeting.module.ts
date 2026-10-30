import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingWebhookController } from './meeting-webhook.controller';
import { MeetingTamuController } from './meeting-tamu.controller';
import { MeetingService } from './meeting.service';

// Rapat internal lewat LiveKit (VM Meeting-Livekit, meet.nextone.id)
@Module({
  // Webhook & tamu didaftarkan lebih dulu supaya rute statis tidak tertangkap meeting/:id
  controllers: [MeetingWebhookController, MeetingTamuController, MeetingController],
  providers: [MeetingService],
})
export class MeetingModule {}
