import { Controller } from '@nestjs/common';
import { PrtgService } from './prtg.service';

@Controller('prtg')
export class PrtgController {
  constructor(private readonly prtgService: PrtgService) {}

  // TODO: implementasi endpoint
}
