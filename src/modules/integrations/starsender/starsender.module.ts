import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { StarsenderClient } from './starsender.client';
import { StarsenderService } from './starsender.service';
import { StarsenderController } from './starsender.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [StarsenderClient, StarsenderService],
  controllers: [StarsenderController],
  exports: [StarsenderService],
})
export class StarsenderModule {}
