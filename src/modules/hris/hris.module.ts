import { Module } from '@nestjs/common';
import { HrisController } from './hris.controller';
import { HrisService } from './hris.service';

@Module({
  controllers: [HrisController],
  providers: [HrisService],
  exports: [HrisService],
})
export class HrisModule {}
