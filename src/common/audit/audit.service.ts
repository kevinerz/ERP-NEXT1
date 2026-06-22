import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Catat perubahan data penting
  // Dipanggil dari service lain setelah create/update/delete
  async log(params: {
    id_user: number;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entity: string;    // nama tabel, contoh: 'work_orders'
    entity_id: number;
    changes?: object;  // data sebelum/sesudah (opsional)
  }) {
    // TODO: simpan ke tabel audit_logs setelah tabel dibuat di Prisma schema
    console.log('[AUDIT]', params);
  }
}
