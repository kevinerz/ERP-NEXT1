import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface LogData {
  id_user?: number;
  username: string;
  nama?: string;
  aksi: 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE';
  modul?: string;
  entitas?: string;
  deskripsi?: string;
  ip_address?: string;
}

@Injectable()
export class LogService {
  constructor(private prisma: PrismaService) {}

  async log(data: LogData): Promise<void> {
    try {
      await this.prisma.activityLog.create({ data });
    } catch {
      // Log failure tidak boleh crash app
    }
  }
}
