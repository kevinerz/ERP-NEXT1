import { Module } from '@nestjs/common';
import { PrtgModule } from '../prtg/prtg.module';
import { StarsenderModule } from '../starsender/starsender.module';
import { NocaasController } from './nocaas.controller';
import { NocaasService } from './nocaas.service';

@Module({
  imports: [PrtgModule, StarsenderModule],
  controllers: [NocaasController],
  providers: [NocaasService],
})
export class NocaasModule {}
