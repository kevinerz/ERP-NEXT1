import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { StarsenderClient } from './starsender.client';
import { StarsenderService } from './starsender.service';
import { StarsenderController } from './starsender.controller';

@Module({
  imports: [PrismaModule],
  providers: [StarsenderClient, StarsenderService],
  controllers: [StarsenderController],
  exports: [StarsenderService],
})
export class StarsenderModule {}
