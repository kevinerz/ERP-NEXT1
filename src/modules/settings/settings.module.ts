import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UploadModule } from '../../common/upload/upload.module';

@Module({
  imports: [
    UploadModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
