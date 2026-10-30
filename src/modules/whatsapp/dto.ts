import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class KirimPesanDto {
  @IsOptional() @IsString() @MaxLength(4096) teks?: string;
  // id_pesan (ERP) yang dibalas/dikutip
  @IsOptional() @Type(() => Number) @IsInt() kutip_id?: number;
  // 'true' = kirim audio sebagai voice note
  @IsOptional() @IsString() ptt?: string;
  // 'false' = tanpa tanda tangan *nama helpdesk* di awal pesan (default: pakai)
  @IsOptional() @IsIn(['true', 'false']) ttd?: string;
}

export class AlihkanDto {
  // null/0 = lepas (belum ditangani)
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) id_karyawan?: number | null;
}

export class ReaksiDto {
  @IsString() @MaxLength(16) emoji: string;
}

export class TemplateDto {
  @IsString() @MaxLength(100) judul: string;
  @IsString() @MaxLength(4096) isi: string;
  @IsOptional() @Type(() => Number) @IsInt() urutan?: number;
}

export class DaftarChatQuery {
  @IsOptional() @IsString() akun?: string;
  @IsOptional() @IsIn(['saya', 'belum', 'semua', 'grup', 'selesai']) filter?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) halaman?: number;
}

export class ChatBaruDto {
  @IsString() @MaxLength(30) nomor: string;
  @IsOptional() @IsString() @MaxLength(150) nama?: string;
  @IsOptional() @IsString() @MaxLength(30) akun?: string;
}

export class NamaKontakDto {
  // kosong = hapus nama kustom
  @IsOptional() @IsString() @MaxLength(150) nama?: string;
}

export class SimpanTeknisiDto {
  @IsString() @MaxLength(150) nama: string;
  @IsOptional() @IsString() @MaxLength(150) asal_vendor?: string;
  @IsOptional() @IsString() @MaxLength(150) keahlian?: string;
}

export class SimpanKaryawanDto {
  @Type(() => Number) @IsInt() @Min(1) id_karyawan: number;
}

export class SimpanPicDto {
  @Type(() => Number) @IsInt() @Min(1) id_site: number;
  @IsString() @MaxLength(150) nama_pic: string;
  @IsOptional() @IsString() @MaxLength(100) jabatan?: string;
}
