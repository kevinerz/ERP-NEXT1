import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingOpenController } from './onboarding-open.controller';
import { OnboardingService } from './onboarding.service';
import { SmtpClientService } from '../email/smtp.client';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { HrisModule } from '../hris/hris.module';

@Module({
  imports: [HrisModule],
  controllers: [OnboardingController, OnboardingOpenController],
  providers: [OnboardingService, SmtpClientService, SecretCryptoService],
})
export class OnboardingModule {}
