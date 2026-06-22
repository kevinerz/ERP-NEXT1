import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // PrismaService bisa di-inject tanpa import PrismaModule di tiap modul
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
