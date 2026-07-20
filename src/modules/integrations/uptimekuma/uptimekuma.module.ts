import { Module } from '@nestjs/common';
import { UptimeKumaController } from './uptimekuma.controller';
import { UptimeKumaWebhookController } from './uptimekuma-webhook.controller';
import { UptimeKumaService } from './uptimekuma.service';

@Module({
  controllers: [UptimeKumaController, UptimeKumaWebhookController],
  providers: [UptimeKumaService],
  exports: [UptimeKumaService],
})
export class UptimeKumaModule {}
