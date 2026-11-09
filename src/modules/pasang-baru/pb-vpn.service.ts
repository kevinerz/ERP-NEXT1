import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { NocaasClient } from '../integrations/nocaas/nocaas.client';
import { PrtgClient } from '../integrations/prtg/prtg.client';
import { PrtgService } from '../integrations/prtg/prtg.service';
import type { Pengguna } from './pasang-baru.service';

// Pemegang tahap Network (sama dengan PEMEGANG.Network + Admin/Director)
const PEMEGANG = ['Admin', 'Director', 'Helpdesk', 'Manager_Ops'];
const KEY_TEMPLATE = 'prtg_template_device';
type Jalur = 'ns' | 'un';
const JALUR: Jalur[] = ['ns', 'un'];

interface HasilSecret { name: string; password: string; remote_ip: string; local_ip?: string }

/** Nama site → bagian nama akun VPN NOCaaS (huruf besar, A-Z 0-9 - _) */
export function namaVpn(s: string) {
  return s.toUpperCase().trim().replace(/[\s.\/]+/g, '-').replace(/[^A-Z0-9\-_]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/**
 * Tahap Network pasang baru: buat akun VPN NOCaaS (NS-<nama> & UN-<nama>) lalu device PRTG per jalur
 * dengan menyalin device template ke grup pelanggan. Dipicu tombol oleh tim Network.
 */
@Injectable()
export class PbVpnService {
  private readonly logger = new Logger('PbVpn');

  constructor(
    private prisma: PrismaService,
    private crypto: SecretCryptoService,
    private nocaas: NocaasClient,
    private prtgClient: PrtgClient,
    private prtg: PrtgService,
  ) {}

  private wajib(u: Pengguna) {
    if (!u.roles.some((r) => PEMEGANG.includes(r))) throw new ForbiddenException('VPN & PRTG diatur oleh Network (Helpdesk / Manager Ops)');
  }

  private async order(id_pb: number) {
    const o = await this.prisma.pbOrder.findUnique({
      where: { id_pb },
      include: { site: { select: { id_site: true, nama_site: true, pelanggan: { select: { nama_pelanggan: true } } } } },
    });
    if (!o) throw new NotFoundException('Order tidak ditemukan');
    return o;
  }

  private sandi(o: { vpn_password: string | null }): Partial<Record<Jalur, string>> {
    if (!o.vpn_password) return {};
    try { return JSON.parse(this.crypto.decrypt(o.vpn_password)); } catch { return {}; }
  }

  private script(nama: string, pw: Partial<Record<Jalur, string>>) {
    const baris = (j: Jalur) => `add name="l2tp-${j.toUpperCase()}-${nama}" connect-to=vpn${j}.nextone.id user="${j.toUpperCase()}-${nama}" password="${pw[j]}" profile=default disabled=no`;
    return pw.ns && pw.un ? `/interface l2tp-client\n${baris('ns')}\n${baris('un')}\n` : null;
  }

  private async template() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY_TEMPLATE } });
    const id = Number(row?.value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /** Status VPN & PRTG order + saran (nama akun, IP berikutnya, grup PRTG) */
  async status(u: Pengguna, id_pb: number) {
    const o = await this.order(id_pb);
    const pw = this.sandi(o);
    const bolehUbah = u.roles.some((r) => PEMEGANG.includes(r));
    const nama = o.vpn_nama ?? namaVpn(o.nama_site);
    const idTemplate = await this.template();
    const [pair, template] = await Promise.all([
      !o.vpn_at && o.tahap === 'Network' ? this.nocaas.ambil('/api/provision/next-ip-pair', 20_000).catch((e) => ({ error: e.message })) : null,
      idTemplate ? this.prtgClient.getObject(idTemplate).catch(() => null) : null,
    ]);
    return {
      nama,
      vpn: o.vpn_at ? {
        at: o.vpn_at,
        ns: o.vpn_ns_ip ? { user: `NS-${o.vpn_nama}`, ip: o.vpn_ns_ip } : null,
        un: o.vpn_un_ip ? { user: `UN-${o.vpn_nama}`, ip: o.vpn_un_ip } : null,
        // Password & script hanya untuk pemegang tahap Network
        script: bolehUbah ? this.script(o.vpn_nama!, pw) : null,
        password: bolehUbah ? pw : null,
      } : null,
      prtg: { ns: o.prtg_ns_objid, un: o.prtg_un_objid },
      ip_berikut: pair,
      template: idTemplate ? { objid: idTemplate, ...(template ?? {}), ada: !!template } : null,
      pelanggan: o.site?.pelanggan?.nama_pelanggan ?? null,
    };
  }

  /** Buat akun VPN NS & UN di NOCaaS (jalur yang sudah ada dilewati) */
  async buatVpn(u: Pengguna, id_pb: number, dto: { nama?: string }) {
    this.wajib(u);
    const o = await this.order(id_pb);
    if (o.tahap !== 'Network') throw new BadRequestException(`Order di tahap ${o.tahap}`);
    const nama = o.vpn_nama ?? namaVpn(dto.nama?.trim() || o.nama_site);
    if (nama.length < 3) throw new BadRequestException('Nama akun VPN terlalu pendek');
    const pw = this.sandi(o);
    const kurang = JALUR.filter((j) => !(j === 'ns' ? o.vpn_ns_ip : o.vpn_un_ip));
    if (!kurang.length) throw new BadRequestException('Akun VPN NS & UN sudah dibuat');

    // Cegah menimpa akun lain dengan nama sama di NOCaaS
    if (!o.vpn_nama) {
      const ada = await this.nocaas.ambil<{ items: { name: string }[] }>(`/api/provision/secrets?search=${encodeURIComponent(nama)}&limit=50`);
      const bentrok = (ada.items ?? []).filter((s) => s.name === `NS-${nama}` || s.name === `UN-${nama}`).map((s) => s.name);
      if (bentrok.length) throw new BadRequestException(`Akun ${bentrok.join(' & ')} sudah ada di NOCaaS — ganti nama akun`);
    }

    const pair = await this.nocaas.ambil<Record<Jalur, { remote_ip: string }>>('/api/provision/next-ip-pair', 20_000);
    const sandiBaru = pw.ns ?? pw.un ?? randomBytes(9).toString('base64url');
    const hasil: Partial<Record<Jalur, HasilSecret>> = {};
    const gagal: string[] = [];
    for (const j of kurang) {
      try {
        if (!pair?.[j]?.remote_ip) throw new Error('IP tunnel berikutnya tidak tersedia');
        hasil[j] = await this.nocaas.kirimJson<HasilSecret>('/api/provision/create', {
          name: `${j.toUpperCase()}-${nama}`, isp: j, remote_ip: pair[j].remote_ip, profile: 'default', password: sandiBaru,
        });
      } catch (e: any) {
        this.logger.warn(`Buat VPN ${j.toUpperCase()}-${nama} gagal: ${e.message}`);
        gagal.push(`${j.toUpperCase()}: ${e.message.replace(/^NOCaaS \d+ \S+ — /, '')}`);
      }
    }
    const sandiSimpan = { ...pw };
    for (const j of JALUR) if (hasil[j]) sandiSimpan[j] = hasil[j]!.password || sandiBaru;
    if (hasil.ns || hasil.un) {
      await this.prisma.pbOrder.update({
        where: { id_pb },
        data: {
          vpn_nama: nama, vpn_at: o.vpn_at ?? new Date(),
          ...(hasil.ns ? { vpn_ns_ip: hasil.ns.remote_ip || pair.ns.remote_ip } : {}),
          ...(hasil.un ? { vpn_un_ip: hasil.un.remote_ip || pair.un.remote_ip } : {}),
          vpn_password: this.crypto.encrypt(JSON.stringify(sandiSimpan)),
        },
      });
      const dibuat = JALUR.filter((j) => hasil[j]).map((j) => `${j.toUpperCase()}-${nama} (${hasil[j]!.remote_ip || pair[j].remote_ip})`).join(', ');
      await this.prisma.pbRiwayat.create({ data: { id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'vpn', catatan: `Akun VPN NOCaaS dibuat: ${dibuat}` } });
    }
    if (!hasil.ns && !hasil.un) throw new BadRequestException(`Gagal membuat akun VPN — ${gagal.join(' · ')}`);
    return { message: gagal.length ? `Sebagian gagal: ${gagal.join(' · ')} — klik lagi untuk mencoba jalur yang gagal` : 'Akun VPN NS & UN dibuat', data: await this.status(u, id_pb) };
  }

  /** Grup PRTG, diurutkan dari yang paling mirip nama pelanggan */
  async grupPrtg(id_pb: number) {
    const o = await this.order(id_pb);
    const grup = await this.prtgClient.getGroups();
    const kata = (s: string) => s.toUpperCase().replace(/\b(PT|TBK|CV)\b\.?/g, ' ').split(/[^A-Z0-9]+/).filter((x) => x.length > 2);
    const target = new Set([...kata(o.site?.pelanggan?.nama_pelanggan ?? ''), ...kata(o.nama_site).slice(0, 1)]);
    const skor = (g: { name: string }) => kata(g.name).filter((k) => target.has(k)).length;
    return grup
      .filter((g) => !/^(Root|Local Probe|Probe Device)$/i.test(g.name))
      .map((g) => ({ ...g, skor: skor(g) }))
      .sort((a, b) => b.skor - a.skor || a.name.localeCompare(b.name));
  }

  /** Simpan device PRTG yang dipakai sebagai template sensor */
  async setTemplate(u: Pengguna, objid: number) {
    this.wajib(u);
    const d = await this.prtgClient.getObject(objid);
    if (!d) throw new BadRequestException(`Device PRTG ${objid} tidak ditemukan`);
    await this.prisma.appSetting.upsert({ where: { key: KEY_TEMPLATE }, create: { key: KEY_TEMPLATE, value: String(objid) }, update: { value: String(objid) } });
    return { message: `Template PRTG: ${d.name} (${d.sensors} sensor)`, data: d };
  }

  /** Salin device template ke grup pelanggan untuk tiap jalur VPN yang belum punya device PRTG */
  async buatPrtg(u: Pengguna, id_pb: number, dto: { id_grup: number }) {
    this.wajib(u);
    const o = await this.order(id_pb);
    if (o.tahap !== 'Network') throw new BadRequestException(`Order di tahap ${o.tahap}`);
    if (!o.id_site) throw new BadRequestException('Order belum punya site');
    const idTemplate = await this.template();
    if (!idTemplate) throw new BadRequestException('Device template PRTG belum diatur');
    const ip: Record<Jalur, string | null> = { ns: o.vpn_ns_ip, un: o.vpn_un_ip };
    const kurang = JALUR.filter((j) => ip[j] && !(j === 'ns' ? o.prtg_ns_objid : o.prtg_un_objid));
    if (!kurang.length) throw new BadRequestException(o.vpn_at ? 'Device PRTG sudah dibuat' : 'Buat akun VPN dulu');

    const hasil: Partial<Record<Jalur, number>> = {};
    const gagal: string[] = [];
    for (const j of kurang) {
      const nama = `${o.nama_site} (${j.toUpperCase()})`;
      try {
        hasil[j] = await this.prtgClient.duplicateDevice(idTemplate, nama, ip[j]!, dto.id_grup);
        await this.prisma.pbOrder.update({ where: { id_pb }, data: j === 'ns' ? { prtg_ns_objid: hasil[j] } : { prtg_un_objid: hasil[j] } });
        // Mapping nama device → site supaya alert PRTG langsung jadi tiket site ini
        await this.prtg.createMapping({ device_name: nama, id_site: o.id_site }).catch((e) => this.logger.warn(`Mapping PRTG ${nama}: ${e.message}`));
      } catch (e: any) {
        this.logger.warn(`Buat device PRTG ${nama} gagal: ${e.message}`);
        gagal.push(`${j.toUpperCase()}: ${e.message}`);
      }
    }
    const dibuat = JALUR.filter((j) => hasil[j]).map((j) => `${j.toUpperCase()} #${hasil[j]} (${ip[j]})`);
    if (dibuat.length) await this.prisma.pbRiwayat.create({ data: { id_sph: o.id_sph, id_pb, id_karyawan: u.id_karyawan, aksi: 'prtg', catatan: `Device PRTG dibuat: ${dibuat.join(', ')}` } });
    if (!dibuat.length) throw new BadRequestException(`Gagal membuat device PRTG — ${gagal.join(' · ')}`);
    return { message: gagal.length ? `Sebagian gagal: ${gagal.join(' · ')}` : `Device PRTG dibuat: ${dibuat.join(', ')}`, data: await this.status(u, id_pb) };
  }
}
