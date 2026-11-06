import { Module } from '@nestjs/common';
import { QcController } from './qc.controller';
import { QcService } from './qc.service';

// QC / evaluasi ERP: daftar modul + catatan revisi, bug, upgrade (halaman /qc, ekspor Excel & PDF di web)
@Module({ controllers: [QcController], providers: [QcService] })
export class QcModule {}
