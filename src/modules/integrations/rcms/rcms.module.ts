import { Module } from '@nestjs/common';
import { RcmsController } from './rcms.controller';
import { RcmsService } from './rcms.service';

@Module({
  controllers: [RcmsController],
  providers: [RcmsService],
  exports: [RcmsService],
})
export class RcmsModule {}
