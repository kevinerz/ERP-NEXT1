import { Module } from '@nestjs/common';
import { PrtgModule } from '../prtg/prtg.module';
import { StarsenderModule } from '../starsender/starsender.module';
import { WhatsappModule } from '../../whatsapp/whatsapp.module';
import { NocaasController } from './nocaas.controller';
import { NocaasService } from './nocaas.service';
import { NocaasLaporanService } from './nocaas-laporan.service';
import { NocaasClient } from './nocaas.client';
import { NocaasSiteService } from './nocaas-site.service';

@Module({
  imports: [PrtgModule, StarsenderModule, WhatsappModule],
  controllers: [NocaasController],
  providers: [NocaasClient, NocaasService, NocaasLaporanService, NocaasSiteService],
  exports: [NocaasClient],
})
export class NocaasModule {}
