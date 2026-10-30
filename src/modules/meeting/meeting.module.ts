import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingWebhookController } from './meeting-webhook.controller';
import { MeetingService } from './meeting.service';

// Rapat internal lewat LiveKit (VM Meeting-Livekit, meet.nextone.id)
@Module({
  // Webhook didaftarkan lebih dulu supaya rute statis meeting/webhook tidak tertangkap meeting/:id
  controllers: [MeetingWebhookController, MeetingController],
  providers: [MeetingService],
})
export class MeetingModule {}
