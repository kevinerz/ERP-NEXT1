import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { MasukTamuDto } from './dto';
import { MeetingService } from './meeting.service';

// Tamu rapat (di luar HRIS) lewat link — tanpa login ERP, hanya ke rapat pemilik kode
@Controller('meeting/tamu')
export class MeetingTamuController {
  constructor(private meeting: MeetingService) {}

  @Public()
  @Get(':kode')
  info(@Param('kode') kode: string) { return this.meeting.infoTamu(kode); }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':kode/masuk')
  masuk(@Param('kode') kode: string, @Body() dto: MasukTamuDto) { return this.meeting.tokenTamu(kode, dto); }
}
