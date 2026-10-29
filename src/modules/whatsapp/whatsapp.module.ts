import { Module } from '@nestjs/common';
import { WaController } from './wa.controller';
import { WaWebhookController } from './wa-webhook.controller';
import { WaGatewayClient } from './wa-gateway.client';
import { WaRealtimeService } from './wa-realtime.service';
import { WaService } from './wa.service';

// Inbox WhatsApp helpdesk lewat gateway Baileys (VM whatsapp-Gateway)
@Module({
  // Webhook didaftarkan lebih dulu supaya rute statis wa/webhook tidak tertangkap rute lain
  controllers: [WaWebhookController, WaController],
  providers: [WaService, WaGatewayClient, WaRealtimeService],
  exports: [WaService],
})
export class WhatsappModule {}
