import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

// Chat internal karyawan (Tahap 1: pribadi, grup, umum, divisi)
@Module({
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
