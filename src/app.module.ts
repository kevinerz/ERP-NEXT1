import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join } from 'path';

// Prisma
import { PrismaModule } from './prisma/prisma.module';

// Common
import { UploadModule } from './common/upload/upload.module';
import { DocumentNumberModule } from './common/document-number/document-number.module';
import { AuditModule } from './common/audit/audit.module';
import { LogModule } from './common/log/log.module';
import { SchedulerModule } from './common/scheduler/scheduler.module';
import { LogInterceptor } from './common/log/log.interceptor';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { HrisModule } from './modules/hris/hris.module';
import { MasterModule } from './modules/master/master.module';
import { SalesModule } from './modules/sales/sales.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { OperationsModule } from './modules/operations/operations.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PublicWoModule } from './modules/public-wo/public-wo.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { FinanceModule } from './modules/finance/finance.module';
import { EmailModule } from './modules/email/email.module';

// Integrations
import { PrtgModule } from './modules/integrations/prtg/prtg.module';
import { RcmsModule } from './modules/integrations/rcms/rcms.module';
import { RuijieModule } from './modules/integrations/ruijie/ruijie.module';
import { MekariModule } from './modules/integrations/mekari/mekari.module';
import { SocialchatModule } from './modules/integrations/socialchat/socialchat.module';

@Module({
  imports: [
    // Config — baca .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting — default 100 req/menit per IP; login dikunci lebih ketat via @Throttle
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Serve Vue SPA dari public/
    // path-to-regexp v7+ (ikut naik lewat @nestjs/serve-static 5) tidak lagi
    // terima wildcard polos '/api*' — wajib named wildcard '/api/*splat'.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*splat}', '/webhook/{*splat}'],
    }),

    // Prisma
    PrismaModule,

    // Common
    UploadModule,
    DocumentNumberModule,
    AuditModule,
    LogModule,
    SchedulerModule,

    // Business modules
    AuthModule,
    HrisModule,
    MasterModule,
    SalesModule,
    ProjectsModule,
    OperationsModule,
    AssetsModule,
    ContractsModule,
    NotificationsModule,
    EmailModule,
    PublicWoModule,
    ReportsModule,
    AdminModule,
    SettingsModule,
    FinanceModule,

    // Integrations
    PrtgModule,
    RcmsModule,
    RuijieModule,
    MekariModule,
    SocialchatModule,
  ],
  providers: [
    // Global rate-limit guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global interceptor — log semua POST/PATCH/DELETE
    {
      provide: APP_INTERCEPTOR,
      useClass: LogInterceptor,
    },
  ],
})
export class AppModule {}
