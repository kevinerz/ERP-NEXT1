import { Module } from '@nestjs/common';
import { PasangBaruController } from './pasang-baru.controller';
import { PasangBaruService } from './pasang-baru.service';
import { KurirApiService } from './kurir-api.service';
import { AssetsModule } from '../assets/assets.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

// Alur Pasang Baru: Survey → OPS → SPH → Director → order per site (OPS pasang vendor ISP → Network perangkat & BA → Selesai)
@Module({
  imports: [AssetsModule, WhatsappModule],
  controllers: [PasangBaruController],
  providers: [PasangBaruService, KurirApiService],
})
export class PasangBaruModule {}
