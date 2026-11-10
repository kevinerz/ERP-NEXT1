import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { CariService } from './cari.service';

// Dashboard per akun/divisi (Helpdesk, NOC, Teknisi, Sales, OPS, Finance)
@Module({
  imports: [WhatsappModule],
  controllers: [DashboardController],
  providers: [DashboardService, CariService],
})
export class DashboardModule {}
