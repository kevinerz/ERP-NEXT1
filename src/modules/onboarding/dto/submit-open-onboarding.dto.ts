import { IsString } from 'class-validator';
import { SubmitOnboardingDto } from './submit-onboarding.dto';

export class SubmitOpenOnboardingDto extends SubmitOnboardingDto {
  @IsString()
  captcha_token: string;

  @IsString()
  captcha_answer: string;
}
