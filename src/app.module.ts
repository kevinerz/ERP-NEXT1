import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

// Prisma
import { PrismaModule } from './prisma/prisma.module';

// Common
import { UploadModule } from './common/upload/upload.module';
import { DocumentNumberModule } from './common/document-number/document-number.module';
import { AuditModule } from './common/audit/audit.module';

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

    // Serve Vue SPA dari public/
    // Semua route yang tidak cocok dengan /api akan serve index.html
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api*', '/webhook*'],
    }),

    // Prisma
    PrismaModule,

    // Common
    UploadModule,
    DocumentNumberModule,
    AuditModule,

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
    PublicWoModule,
    ReportsModule,

    // Integrations
    PrtgModule,
    RcmsModule,
    RuijieModule,
    MekariModule,
    SocialchatModule,
  ],
})
export class AppModule {}
