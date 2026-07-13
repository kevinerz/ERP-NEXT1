import { Module } from '@nestjs/common';
import { SocialchatController } from './socialchat.controller';
import { SocialchatService } from './socialchat.service';

@Module({
  controllers: [SocialchatController],
  providers: [SocialchatService],
  exports: [SocialchatService],
})
export class SocialchatModule {}
