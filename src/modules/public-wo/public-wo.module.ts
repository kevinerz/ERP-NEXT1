import { Module } from '@nestjs/common';
import { PublicWoController } from './public-wo.controller';
import { PublicWoService } from './public-wo.service';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [AssetsModule],
  controllers: [PublicWoController],
  providers: [PublicWoService],
  exports: [PublicWoService],
})
export class PublicWoModule {}
