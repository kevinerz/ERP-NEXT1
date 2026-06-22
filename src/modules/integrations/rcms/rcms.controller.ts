import { Controller } from '@nestjs/common';
import { RcmsService } from './rcms.service';

@Controller('rcms')
export class RcmsController {
  constructor(private readonly rcmsService: RcmsService) {}

  // TODO: implementasi endpoint
}
