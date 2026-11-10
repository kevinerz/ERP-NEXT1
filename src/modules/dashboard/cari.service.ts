import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UserCari { id_karyawan?: number; modul_akses: string[]; roles?: string[] }
export interface HasilCari { jenis: string; ikon: string; judul: string; sub?: string; ke: string; lencana?: string }

const MAKS = 6;
const IP = /^\d{1,3}(\.\d{1,3}){1,3}\.?$/;

/**
 * Pencarian global dashboard: satu kata kunci dicari ke site, pelanggan, tiket, WO, aset (kode/SN),
 * karyawan, invoice, kontrak, lead, pasang baru, chat WA, dan IP router.
 * Tiap kelompok hanya dicari bila user punya akses modulnya (endpoint /dashboard tidak digate guard).
 */
@Injectable()
export class CariService {
  constructor(private prisma: PrismaService) {}

  async cari(u: UserCari, qMentah: string) {
    const q = (qMentah || '').trim().slice(0, 80);
    if (q.length < 2) return { data: { q, grup: [] } };
    const semua = !u.modul_akses?.length;
    const bisa = (...m: string[]) => semua || m.some((x) => u.modul_akses.includes(x));
    const c = { contains: q };
    const pakai = <T>(cond: boolean, f: () => Promise<T[]>) => (cond ? f().catch(() => [] as T[]) : Promise.resolve([] as T[]));
    const ip = IP.test(q);
    const digit = /^[+\d\s-]+$/.test(q) ? q.replace(/\D/g, '') : '';

    const [site, pelanggan, tiket, wo, aset, karyawan, invoice, kontrak, lead, pb, chat, router] = await Promise.all([
      pakai(bisa('master', 'operations', 'sales'), () => this.prisma.sitePelanggan.findMany({
        where: { OR: [{ nama_site: c }, { kode_site: c }, { kota: c }, { alamat_lengkap: c }, ...(ip ? [{ perangkat: { some: { ip_address: c } } }] : [])] },
        select: { id_site: true, nama_site: true, kode_site: true, kota: true, status_site: true, pelanggan: { select: { nama_pelanggan: true } } },
        take: MAKS, orderBy: { nama_site: 'asc' },
      })),
      pakai(bisa('master', 'sales', 'crm'), () => this.prisma.pelanggan.findMany({
        where: { OR: [{ nama_pelanggan: c }, { kode_pelanggan: c }, { nama_pic_utama: c }, { nama_pic_teknis: c }, { nama_pic_keuangan: c }] },
        select: { id_pelanggan: true, nama_pelanggan: true, kode_pelanggan: true, _count: { select: { sites: true } } },
        take: MAKS, orderBy: { nama_pelanggan: 'asc' },
      })),
      pakai(bisa('operations'), () => this.prisma.operationTicket.findMany({
        where: { OR: [{ nomor_tiket: c }, { judul_tiket: c }, { site: { nama_site: c } }] },
        select: { id_ticket: true, nomor_tiket: true, judul_tiket: true, status_tiket: true, site: { select: { nama_site: true } } },
        take: MAKS, orderBy: { tgl_open: 'desc' },
      })),
      pakai(bisa('public-wo', 'operations'), () => this.prisma.workOrder.findMany({
        where: { OR: [{ nomor_wo: c }, { deskripsi_tugas: c }, { site: { nama_site: c } }] },
        select: { id_wo: true, nomor_wo: true, status_wo: true, deskripsi_tugas: true, site: { select: { nama_site: true } } },
        take: MAKS, orderBy: { id_wo: 'desc' },
      })),
      pakai(bisa('assets'), () => this.prisma.gudangAset.findMany({
        where: { OR: [{ kode_aset: c }, { serial_number: c }, { nama_perangkat: c }] },
        select: { id_aset: true, kode_aset: true, nama_perangkat: true, serial_number: true, status_aset: true, site: { select: { nama_site: true } } },
        take: MAKS, orderBy: { id_aset: 'desc' },
      })),
      pakai(bisa('hris'), () => this.prisma.hrisKaryawan.findMany({
        where: { OR: [{ nama_lengkap: c }, { nip: c }, { email: c }, { no_hp: c }] },
        select: { id_karyawan: true, nama_lengkap: true, nip: true, jabatan: true, departemen: true },
        take: MAKS, orderBy: { nama_lengkap: 'asc' },
      })),
      pakai(bisa('finance'), () => this.prisma.invoice.findMany({
        where: { OR: [{ nomor_invoice: c }, { site: { nama_site: c } }] },
        select: { id_invoice: true, nomor_invoice: true, status: true, total: true, site: { select: { nama_site: true } } },
        take: MAKS, orderBy: { id_invoice: 'desc' },
      })),
      pakai(bisa('contracts'), () => this.prisma.kontrakLayanan.findMany({
        where: { OR: [{ nomor_kontrak: c }, { site: { nama_site: c } }] },
        select: { id_kontrak: true, nomor_kontrak: true, status_kontrak: true, site: { select: { nama_site: true } } },
        take: MAKS, orderBy: { id_kontrak: 'desc' },
      })),
      pakai(bisa('sales'), () => this.prisma.salesLead.findMany({
        where: { OR: [{ nama_prospek: c }, { nama_perusahaan: c }, { email: c }] },
        select: { id_lead: true, nama_prospek: true, nama_perusahaan: true, status_lead: true },
        take: MAKS, orderBy: { id_lead: 'desc' },
      })),
      pakai(bisa('sales', 'operations', 'instalasi', 'finance'), () => this.prisma.pbOrder.findMany({
        where: { OR: [{ nomor_pb: c }, { nama_site: c }, { sph: { nomor_sph: c } }] },
        select: { id_pb: true, nomor_pb: true, nama_site: true, tahap: true, sph: { select: { nomor_sph: true } } },
        take: MAKS, orderBy: { id_pb: 'desc' },
      })),
      pakai(bisa('whatsapp'), () => this.prisma.waChat.findMany({
        // Nomor WA hanya dicocokkan bila kata kunci memang berisi nomor (≥ 5 digit) — "0" di dalam SN tidak dihitung
        where: { OR: [{ nama: c }, ...(digit.length >= 5 ? [{ jid: { contains: digit.replace(/^0/, '62') } }] : [])] },
        select: { id_chat: true, nama: true, jid: true, is_grup: true, status: true },
        take: MAKS, orderBy: { id_chat: 'desc' },
      })),
      pakai(bisa('operations') && ip, () => this.prisma.nocaasRouter.findMany({
        where: { OR: [{ ns_ip: c }, { un_ip: c }, { public_ip: c }] },
        select: { site_key: true, nama_utama: true, status: true, ns_ip: true, un_ip: true, public_ip: true, id_site: true, site: { select: { nama_site: true } } },
        take: MAKS,
      })),
    ]);

    const g = (judul: string, items: HasilCari[]) => ({ judul, items });
    const grup = [
      g('Site', site.map((s) => ({ jenis: 'site', ikon: '📍', judul: s.nama_site, sub: [s.kode_site, s.pelanggan?.nama_pelanggan, s.kota].filter(Boolean).join(' · '), ke: `/master/site/${s.id_site}`, lencana: s.status_site }))),
      g('Pelanggan', pelanggan.map((p) => ({ jenis: 'pelanggan', ikon: '🏢', judul: p.nama_pelanggan, sub: `${p.kode_pelanggan} · ${p._count.sites} site`, ke: `/master/site?pelanggan=${p.id_pelanggan}` }))),
      g('Tiket gangguan', tiket.map((t) => ({ jenis: 'tiket', ikon: '🎫', judul: t.judul_tiket, sub: [t.nomor_tiket, t.site?.nama_site].filter(Boolean).join(' · '), ke: `/operations/${t.id_ticket}`, lencana: t.status_tiket.replace(/_/g, ' ') }))),
      g('Work order', wo.map((w) => ({ jenis: 'wo', ikon: '🗂️', judul: w.nomor_wo, sub: [w.site?.nama_site, w.deskripsi_tugas?.slice(0, 60)].filter(Boolean).join(' · '), ke: `/public-wo/${w.id_wo}`, lencana: w.status_wo }))),
      g('Pasang baru', pb.map((o) => ({ jenis: 'pb', ikon: '🆕', judul: o.nama_site, sub: [o.nomor_pb, o.sph?.nomor_sph].filter(Boolean).join(' · '), ke: `/pasang-baru/order/${o.id_pb}`, lencana: o.tahap }))),
      g('Router (IP)', router.map((r) => ({ jenis: 'router', ikon: '📡', judul: r.site?.nama_site ?? r.nama_utama ?? r.site_key, sub: [r.ns_ip && `NS ${r.ns_ip}`, r.un_ip && `UN ${r.un_ip}`, r.public_ip && `publik ${r.public_ip}`].filter(Boolean).join(' · '), ke: r.id_site ? `/master/site/${r.id_site}` : '/nocaas', lencana: r.status }))),
      g('Aset', aset.map((a) => ({ jenis: 'aset', ikon: '📦', judul: `${a.kode_aset} · ${a.nama_perangkat}`, sub: [a.serial_number && `SN ${a.serial_number}`, a.site?.nama_site].filter(Boolean).join(' · '), ke: `/assets/${a.id_aset}`, lencana: a.status_aset.replace(/_/g, ' ') }))),
      g('Kontrak', kontrak.map((k) => ({ jenis: 'kontrak', ikon: '📄', judul: k.nomor_kontrak, sub: k.site?.nama_site, ke: `/contracts/${k.id_kontrak}`, lencana: k.status_kontrak }))),
      g('Invoice', invoice.map((i) => ({ jenis: 'invoice', ikon: '💰', judul: i.nomor_invoice, sub: [i.site?.nama_site, `Rp ${Number(i.total).toLocaleString('id-ID')}`].filter(Boolean).join(' · '), ke: `/finance/invoice/${i.id_invoice}`, lencana: i.status.replace(/_/g, ' ') }))),
      g('Lead sales', lead.map((l) => ({ jenis: 'lead', ikon: '🌱', judul: l.nama_perusahaan || l.nama_prospek, sub: l.nama_perusahaan ? l.nama_prospek : undefined, ke: `/sales/lead/${l.id_lead}`, lencana: l.status_lead }))),
      g('Karyawan', karyawan.map((k) => ({ jenis: 'karyawan', ikon: '👤', judul: k.nama_lengkap, sub: [k.jabatan, k.departemen, k.nip].filter(Boolean).join(' · '), ke: `/hris/karyawan/${k.id_karyawan}` }))),
      g('Chat WhatsApp', chat.map((w) => ({ jenis: 'wa', ikon: w.is_grup ? '👥' : '💬', judul: w.nama || w.jid.split('@')[0], sub: w.is_grup ? 'Grup' : `+${w.jid.split('@')[0]}`, ke: `/whatsapp?chat=${w.id_chat}`, lencana: w.status }))),
    ].filter((x) => x.items.length);
    return { data: { q, grup, total: grup.reduce((s, x) => s + x.items.length, 0) } };
  }
}
