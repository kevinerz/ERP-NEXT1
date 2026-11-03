import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { LapanganController } from './lapangan.controller';
import { VisitController } from './visit.controller';
import { VisitPmService } from './visit-pm.service';
import { VisitStatistikService } from './visit-statistik.service';
import { VisitService } from './visit.service';

// Jadwal Visit teknis: antrean → papan mingguan per teknisi → notifikasi WA ke teknisi & PIC store.
// Data memakai tabel work_orders (WO tanpa tgl_jadwal = antrean).
@Module({
  imports: [WhatsappModule],
  controllers: [VisitController, LapanganController],
  providers: [VisitService, VisitPmService, VisitStatistikService],
})
export class VisitModule {}
