import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HrisService {
  constructor(private prisma: PrismaService) {}

  // TODO: implementasi
}
