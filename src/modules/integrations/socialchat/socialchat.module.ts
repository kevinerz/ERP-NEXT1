import { Module } from '@nestjs/common';
import { SocialchatController } from './socialchat.controller';
import { SocialchatService } from './socialchat.service';
import { WhatsappClientService } from './whatsapp-client.service';

@Module({
  controllers: [SocialchatController],
  providers: [SocialchatService, WhatsappClientService],
  exports: [SocialchatService],
})
export class SocialchatModule {}
