import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PublicWoService {
  constructor(private prisma: PrismaService) {}

  // TODO: implementasi
}
