import { Module } from '@nestjs/common';
import { PasangBaruController } from './pasang-baru.controller';
import { PasangBaruService } from './pasang-baru.service';

// Alur Pasang Baru: SPH multi-site → approval Director → order per site (Sales → OPS → Instalasi → NOC → Finance)
@Module({
  controllers: [PasangBaruController],
  providers: [PasangBaruService],
})
export class PasangBaruModule {}
