import { Controller } from '@nestjs/common';
import { RuijieService } from './ruijie.service';

@Controller('ruijie')
export class RuijieController {
  constructor(private readonly ruijieService: RuijieService) {}

  // TODO: implementasi endpoint
}
