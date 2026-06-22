import { Module } from '@nestjs/common';
import { PublicWoController } from './public-wo.controller';
import { PublicWoService } from './public-wo.service';

@Module({
  controllers: [PublicWoController],
  providers: [PublicWoService],
  exports: [PublicWoService],
})
export class PublicWoModule {}
