import { Controller } from '@nestjs/common';
import { MekariService } from './mekari.service';

@Controller('mekari')
export class MekariController {
  constructor(private readonly mekariService: MekariService) {}

  // TODO: implementasi endpoint
}
