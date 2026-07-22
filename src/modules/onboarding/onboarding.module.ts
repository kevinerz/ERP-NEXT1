import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingOpenController } from './onboarding-open.controller';
import { OnboardingService } from './onboarding.service';
import { HrisModule } from '../hris/hris.module';

@Module({
  imports: [HrisModule],
  controllers: [OnboardingController, OnboardingOpenController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
