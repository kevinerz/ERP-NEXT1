import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StarsenderModule } from '../integrations/starsender/starsender.module';

@Module({
  imports: [NotificationsModule, StarsenderModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
