import { Module } from '@nestjs/common';
import { MekariController } from './mekari.controller';
import { MekariService } from './mekari.service';
import { MekariClient } from './mekari.client';

@Module({
  controllers: [MekariController],
  providers: [MekariService, MekariClient],
  exports: [MekariService],
})
export class MekariModule {}
