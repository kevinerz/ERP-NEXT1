import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../../modules/settings/settings.module';
import { SmtpClientService } from '../../modules/email/smtp.client';
import { MailBrandingService } from './mail-branding.service';
import { MailerService } from './mailer.service';
import { MailerController } from './mailer.controller';

/**
 * MailerModule — @Global. Sekali diimpor di AppModule, MailerService &
 * MailBrandingService tersedia di seluruh aplikasi tanpa perlu import ulang.
 */
@Global()
@Module({
  imports: [SettingsModule],
  controllers: [MailerController],
  providers: [MailerService, MailBrandingService, SmtpClientService],
  exports: [MailerService, MailBrandingService],
})
export class MailerModule {}
