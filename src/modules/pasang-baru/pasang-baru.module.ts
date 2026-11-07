import { Module } from '@nestjs/common';
import { PasangBaruController } from './pasang-baru.controller';
import { PasangBaruService } from './pasang-baru.service';
import { AssetsModule } from '../assets/assets.module';

// Alur Pasang Baru: Survey → OPS → SPH → Director → order per site (OPS pasang vendor ISP → Network perangkat & BA → Selesai)
@Module({
  imports: [AssetsModule],
  controllers: [PasangBaruController],
  providers: [PasangBaruService],
})
export class PasangBaruModule {}
