import { Module } from '@nestjs/common';
import { PrtgController } from './prtg.controller';
import { PrtgService } from './prtg.service';
import { PrtgClient } from './prtg.client';

@Module({
  controllers: [PrtgController],
  providers: [PrtgService, PrtgClient],
  exports: [PrtgService],
})
export class PrtgModule {}
