import { Controller } from '@nestjs/common';
import { PublicWoService } from './public-wo.service';

@Controller('public-wo')
export class PublicWoController {
  constructor(private readonly publicWoService: PublicWoService) {}

  // TODO: implementasi endpoint
}
