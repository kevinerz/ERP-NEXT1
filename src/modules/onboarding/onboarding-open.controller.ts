import { Controller, Get, Post, Body, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { OnboardingService } from './onboarding.service';
import { SubmitOpenOnboardingDto } from './dto/submit-open-onboarding.dto';
import { Public } from '../../common/decorators/public.decorator';

// Pendaftaran terbuka (tanpa link undangan admin) — diakses lewat tombol
// "Daftar Akun Baru" di halaman Login. Diproteksi captcha sederhana +
// rate-limit ketat karena tidak ada gate token/undangan sama sekali.
@Controller('onboarding-open')
export class OnboardingOpenController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // GET /api/onboarding-open/captcha
  @Public()
  @Get('captcha')
  captcha() {
    return this.onboardingService.getCaptchaChallenge();
  }

  // GET /api/onboarding-open/departemen
  @Public()
  @Get('departemen')
  departemen() {
    return this.onboardingService.getDepartemenList();
  }

  // POST /api/onboarding-open
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post()
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: 2 * 1024 * 1024 } }))
  submit(
    @Body() dto: SubmitOpenOnboardingDto,
    @UploadedFile() foto?: { buffer: Buffer; mimetype: string },
  ) {
    return this.onboardingService.submitOpen(dto, foto);
  }
}
