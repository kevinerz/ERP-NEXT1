import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { VisitController } from './visit.controller';
import { VisitService } from './visit.service';

// Jadwal Visit teknis: antrean → papan mingguan per teknisi → notifikasi WA ke teknisi & PIC store.
// Data memakai tabel work_orders (WO tanpa tgl_jadwal = antrean).
@Module({
  imports: [WhatsappModule],
  controllers: [VisitController],
  providers: [VisitService],
})
export class VisitModule {}
