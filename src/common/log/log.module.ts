import { Module, Global } from '@nestjs/common';
import { LogService } from './log.service';
import { LogInterceptor } from './log.interceptor';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [LogService, LogInterceptor],
  exports: [LogService, LogInterceptor],
})
export class LogModule {}
