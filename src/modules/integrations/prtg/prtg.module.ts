import { Module } from '@nestjs/common';
import { PrtgController } from './prtg.controller';
import { PrtgService } from './prtg.service';

@Module({
  controllers: [PrtgController],
  providers: [PrtgService],
  exports: [PrtgService],
})
export class PrtgModule {}
