import { Module } from '@nestjs/common';
import { PrtgModule } from '../prtg/prtg.module';
import { NocaasController } from './nocaas.controller';
import { NocaasService } from './nocaas.service';

@Module({
  imports: [PrtgModule],
  controllers: [NocaasController],
  providers: [NocaasService],
})
export class NocaasModule {}
