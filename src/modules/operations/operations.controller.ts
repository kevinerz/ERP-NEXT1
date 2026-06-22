import { Controller } from '@nestjs/common';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  // TODO: implementasi endpoint
}
