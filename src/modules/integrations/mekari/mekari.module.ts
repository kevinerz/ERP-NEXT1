import { Module } from '@nestjs/common';
import { MekariController } from './mekari.controller';
import { MekariService } from './mekari.service';

@Module({
  controllers: [MekariController],
  providers: [MekariService],
  exports: [MekariService],
})
export class MekariModule {}
