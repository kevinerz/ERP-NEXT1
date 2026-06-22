import { Controller } from '@nestjs/common';
import { HrisService } from './hris.service';

@Controller('hris')
export class HrisController {
  constructor(private readonly hrisService: HrisService) {}

  // TODO: implementasi endpoint
}
