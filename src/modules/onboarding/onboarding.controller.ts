import { Controller, Get, Post, Param, Body, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { OnboardingService } from './onboarding.service';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // GET /api/onboarding/:token — validasi link, ambil hint departemen/jabatan
  @Public()
  @Get(':token')
  check(@Param('token') token: string) {
    return this.onboardingService.checkInvitation(token);
  }

  // POST /api/onboarding/:token — submit data karyawan baru (foto opsional)
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post(':token')
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: 2 * 1024 * 1024 } }))
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitOnboardingDto,
    @UploadedFile() foto?: { buffer: Buffer; mimetype: string },
  ) {
    return this.onboardingService.submit(token, dto, foto);
  }
}
