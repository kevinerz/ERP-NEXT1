// Aturan "ikuti tindakan helpdesk" untuk otomatisasi tiket (NOCaaS, PRTG, Uptime Kuma):
//  - Tiket yang sudah DIPEGANG helpdesk (ada PIC, atau ada log dari pengguna) tidak diubah statusnya
//    oleh sistem — perangkat pulih cukup dicatat di log, helpdesk yang menutup.
//  - Tiket yang DITUTUP helpdesk tidak pernah dibuka ulang otomatis (flapping) — cukup dicatat.
import type { PrismaService } from '../../prisma/prisma.service';

/** Tiket dipegang helpdesk: punya PIC internal / vendor, atau ada log yang dibuat pengguna (bukan sistem) */
export async function dipegangHelpdesk(prisma: PrismaService, id_ticket: number): Promise<boolean> {
  const t = await prisma.operationTicket.findUnique({ where: { id_ticket }, select: { id_teknisi_pic: true, id_kontak_teknisi: true } });
  if (!t) return false;
  if (t.id_teknisi_pic || t.id_kontak_teknisi) return true;
  return (await prisma.operationTicketLog.count({ where: { id_ticket, id_user: { not: null } } })) > 0;
}

/** Ditutup helpdesk: perubahan terakhir ke Resolved / Closed dilakukan pengguna (bukan auto-resolve sistem) */
export async function ditutupHelpdesk(prisma: PrismaService, id_ticket: number): Promise<boolean> {
  const log = await prisma.operationTicketLog.findFirst({
    where: { id_ticket, status_ke: { in: ['Resolved', 'Closed'] }, NOT: { status_dari: { in: ['Resolved', 'Closed'] } } },
    orderBy: { created_at: 'desc' },
    select: { id_user: true },
  });
  return !!log?.id_user;
}

/** Tulis log sistem sekali saja: dilewati bila sudah ada log berawalan `kunci` sejak `sejak` (bawaan 6 jam terakhir) */
export async function catatSekali(prisma: PrismaService, id_ticket: number, status_ke: string, kunci: string, catatan: string, sejak?: Date) {
  const batas = sejak ?? new Date(Date.now() - 6 * 3600_000);
  const ada = await prisma.operationTicketLog.count({ where: { id_ticket, catatan: { startsWith: kunci }, created_at: { gte: batas } } });
  if (ada) return false;
  await prisma.operationTicketLog.create({ data: { id_ticket, status_ke, catatan: catatan.startsWith(kunci) ? catatan : `${kunci} ${catatan}` } });
  return true;
}
