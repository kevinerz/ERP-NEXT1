import { Module } from '@nestjs/common';
import { MobileModule } from '../mobile/mobile.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

// Chat internal karyawan (pribadi, grup, umum, divisi, diskusi, kanal, kudos; push lewat FCM milik MobileModule)
@Module({
  imports: [MobileModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
