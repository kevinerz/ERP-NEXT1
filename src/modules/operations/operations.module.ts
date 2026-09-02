import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { StarsenderModule } from '../integrations/starsender/starsender.module';
import { MobileModule } from '../mobile/mobile.module';

@Module({
  imports: [StarsenderModule, MobileModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
