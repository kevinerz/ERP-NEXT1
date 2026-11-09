import { Module } from '@nestjs/common';
import { PasangBaruController } from './pasang-baru.controller';
import { PasangBaruService } from './pasang-baru.service';
import { KurirApiService } from './kurir-api.service';
import { AssetsModule } from '../assets/assets.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PrtgModule } from '../integrations/prtg/prtg.module';
import { NocaasModule } from '../integrations/nocaas/nocaas.module';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { PbVpnService } from './pb-vpn.service';

// Alur Pasang Baru: Survey → OPS → SPH → Director → order per site (OPS pasang vendor ISP → Network perangkat & BA → Selesai)
@Module({
  imports: [AssetsModule, WhatsappModule, PrtgModule, NocaasModule],
  controllers: [PasangBaruController],
  providers: [PasangBaruService, KurirApiService, PbVpnService, SecretCryptoService],
})
export class PasangBaruModule {}
