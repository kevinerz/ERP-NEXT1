import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHmac } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';
import { HrisService } from '../hris/hris.service';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

const ALLOWED_FOTO_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly hmacKey: string;

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
    private hris: HrisService,
    config: ConfigService,
  ) {
    this.hmacKey = config.getOrThrow<string>('JWT_SECRET');
  }

  private async getValidInvitation(token: string) {
    const inv = await this.prisma.hrisInvitation.findUnique({ where: { token } });
    if (!inv) throw new NotFoundException('Link undangan tidak valid');

    if (inv.status === 'Pending' && inv.expires_at < new Date()) {
      await this.prisma.hrisInvitation.update({
        where: { id_invitation: inv.id_invitation },
        data: { status: 'Expired' },
      });
      throw new BadRequestException('Link undangan sudah kedaluwarsa');
    }
    if (inv.status !== 'Pending') {
      throw new BadRequestException(
        inv.status === 'Used' ? 'Link undangan sudah pernah dipakai' : 'Link undangan tidak berlaku lagi',
      );
    }
    return inv;
  }

  getDepartemenList() {
    return { data: { departemen_list: this.hris.getDepartemenList() } };
  }

  // GET — untuk render form (info aman saja, bukan data sensitif)
  async checkInvitation(token: string) {
    const inv = await this.getValidInvitation(token);
    return {
      data: {
        departemen: inv.departemen,
        jabatan: inv.jabatan,
        departemen_list: this.hris.getDepartemenList(),
      },
    };
  }

  async submit(token: string, dto: SubmitOnboardingDto, foto?: { buffer: Buffer; mimetype: string }) {
    const inv = await this.getValidInvitation(token);
    const { karyawan, username, password } = await this.createKaryawanAndUser(dto, foto);

    await this.prisma.hrisInvitation.update({
      where: { id_invitation: inv.id_invitation },
      data: { status: 'Used', used_at: new Date(), id_karyawan: karyawan.id_karyawan },
    });

    const email_sent = await this.sendCredentialEmail(dto.email, dto.nama_lengkap, username, password);
    return this.buildSubmitResponse(username, password, email_sent);
  }

  // ─── PENDAFTARAN TERBUKA (tanpa undangan, lewat tombol "Daftar" di Login) ──

  getCaptchaChallenge() {
    const a = Math.floor(Math.random() * 8) + 1;
    const b = Math.floor(Math.random() * 8) + 1;
    const expires = Date.now() + CAPTCHA_TTL_MS;
    const payload = `${a}.${b}.${expires}`;
    const sig = createHmac('sha256', this.hmacKey).update(payload).digest('base64url');
    return {
      data: {
        question: `Berapa hasil dari ${a} + ${b}?`,
        captcha_token: Buffer.from(`${payload}.${sig}`).toString('base64url'),
      },
    };
  }

  private verifyCaptcha(captchaToken: string, answer: string) {
    let decoded: string;
    try {
      decoded = Buffer.from(captchaToken, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('Captcha tidak valid, muat ulang halaman');
    }
    const [a, b, expires, sig] = decoded.split('.');
    const payload = `${a}.${b}.${expires}`;
    const expectedSig = createHmac('sha256', this.hmacKey).update(payload).digest('base64url');
    if (sig !== expectedSig) throw new BadRequestException('Captcha tidak valid, muat ulang halaman');
    if (Date.now() > Number(expires)) throw new BadRequestException('Captcha kedaluwarsa, muat ulang halaman');
    if (Number(answer) !== Number(a) + Number(b)) throw new BadRequestException('Jawaban captcha salah');
  }

  async submitOpen(
    dto: SubmitOnboardingDto & { captcha_token: string; captcha_answer: string },
    foto?: { buffer: Buffer; mimetype: string },
  ) {
    this.verifyCaptcha(dto.captcha_token, dto.captcha_answer);

    const { username, password } = await this.createKaryawanAndUser(dto, foto);

    const email_sent = await this.sendCredentialEmail(dto.email, dto.nama_lengkap, username, password);

    return this.buildSubmitResponse(username, password, email_sent);
  }

  private buildSubmitResponse(username: string, password: string, email_sent: boolean) {
    return {
      data: { username, email_sent, password: email_sent ? undefined : password },
      message: email_sent
        ? 'Pendaftaran berhasil. Username & password telah dikirim ke email Anda.'
        : 'Pendaftaran berhasil, tapi email gagal terkirim — catat username & password di bawah ini sekarang.',
    };
  }

  private async createKaryawanAndUser(dto: SubmitOnboardingDto, foto?: { buffer: Buffer; mimetype: string }) {
    if (dto.no_ktp) {
      const ktpConflict = await this.prisma.hrisKaryawan.findUnique({ where: { no_ktp: dto.no_ktp } });
      if (ktpConflict) throw new BadRequestException(`No. KTP ${dto.no_ktp} sudah terdaftar`);
    }

    let foto_url: string | undefined;
    if (foto) {
      if (!ALLOWED_FOTO_MIME.includes(foto.mimetype))
        throw new BadRequestException('Format foto harus PNG, JPG, atau WebP');
      if (foto.buffer.length > 2 * 1024 * 1024)
        throw new BadRequestException('Ukuran foto maksimal 2MB');
      foto_url = `data:${foto.mimetype};base64,${foto.buffer.toString('base64')}`;
    }

    const nip = await this.generateNip();
    const username = await this.generateUsername(dto.nama_lengkap);
    const password = this.generatePassword();
    const password_hash = await bcrypt.hash(password, 12);

    const karyawan = await this.prisma.hrisKaryawan.create({
      data: {
        nip,
        nama_lengkap: dto.nama_lengkap,
        jabatan: dto.jabatan,
        departemen: dto.departemen,
        no_hp: dto.no_hp,
        email: dto.email,
        tgl_bergabung: new Date(),
        tempat_lahir: dto.tempat_lahir,
        tgl_lahir: dto.tgl_lahir ? new Date(dto.tgl_lahir) : undefined,
        jenis_kelamin: dto.jenis_kelamin,
        agama: dto.agama,
        status_pernikahan: dto.status_pernikahan,
        no_ktp: dto.no_ktp,
        alamat_ktp: dto.alamat_ktp,
        no_npwp: dto.no_npwp,
        pendidikan_terakhir: dto.pendidikan_terakhir,
        kontak_darurat_nama: dto.kontak_darurat_nama,
        kontak_darurat_hp: dto.kontak_darurat_hp,
        kontak_darurat_hubungan: dto.kontak_darurat_hubungan,
        bank_nama: dto.bank_nama,
        bank_no_rekening: dto.bank_no_rekening,
        bank_atas_nama: dto.bank_atas_nama,
        foto_url,
      },
    });

    await this.prisma.coreUser.create({
      data: {
        id_karyawan: karyawan.id_karyawan,
        username,
        password_hash,
        // Akses dibatasi total sampai admin review & buka modul yang sesuai
        // di menu User Management — 'pending' bukan modul asli manapun.
        modul_akses: JSON.stringify(['pending']),
      },
    });

    return { karyawan, username, password };
  }

  private async generateNip(): Promise<string> {
    const rows = await this.prisma.hrisKaryawan.findMany({
      where: { nip: { startsWith: 'N1-' } },
      select: { nip: true },
    });
    let max = 0;
    for (const r of rows) {
      const n = parseInt(r.nip.replace('N1-', ''), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return `N1-${String(max + 1).padStart(3, '0')}`;
  }

  private async generateUsername(namaLengkap: string): Promise<string> {
    const base = namaLengkap
      .toLowerCase()
      .split(' ')[0]
      .replace(/[^a-z0-9]/g, '') || 'user';

    let candidate = base;
    let suffix = 0;
    while (await this.prisma.coreUser.findUnique({ where: { username: candidate } })) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }

  private generatePassword(): string {
    return randomBytes(9).toString('base64url'); // ~12 karakter, aman & tanpa simbol ambigu
  }

  private async sendCredentialEmail(
    to: string,
    namaLengkap: string,
    username: string,
    password: string,
  ): Promise<boolean> {
    // Dikirim dari akun noreply sistem (MailerService), bukan lagi bergantung
    // pada EmailAccount admin. Header/footer brand ditambahkan otomatis.
    if (!this.mailer.isConfigured()) {
      this.logger.warn('Mailer noreply belum dikonfigurasi (MAIL_* di .env) — kredensial ditampilkan di layar sebagai fallback');
      return false;
    }
    try {
      await this.mailer.send({
        to,
        modul: 'onboarding',
        subject: 'Akun ERP Next1 Anda',
        html: `
          <p>Halo ${namaLengkap},</p>
          <p>Akun ERP Next1 Anda telah dibuat. Berikut detail login Anda:</p>
          <p><b>Username:</b> ${username}<br/><b>Password:</b> ${password}</p>
          <p>Segera login dan ganti password Anda melalui menu Profil.</p>
        `,
      });
      return true;
    } catch (e: any) {
      this.logger.error(`Gagal kirim email kredensial ke ${to}: ${e.message}`, e.stack);
      return false;
    }
  }
}
