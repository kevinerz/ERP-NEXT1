import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { ImapClientService } from './imap.client';
import { SmtpClientService } from './smtp.client';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';

@Module({
  controllers: [EmailController],
  providers: [EmailService, ImapClientService, SmtpClientService, SecretCryptoService],
})
export class EmailModule {}
