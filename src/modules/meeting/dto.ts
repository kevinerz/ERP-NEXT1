import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class BuatRapatDto {
  @IsString() @MinLength(2) @MaxLength(200) judul: string;
  @IsOptional() @IsString() @MaxLength(5000) deskripsi?: string;
  // kosong = rapat dadakan (langsung mulai)
  @IsOptional() @IsDateString() jadwal_at?: string;
  @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) peserta: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(720) durasi_menit?: number;
  @IsOptional() @IsString() @MaxLength(30) kategori?: string;
  @IsOptional() @IsString() @MaxLength(200) lokasi?: string;
  // peserta yang langsung dijadikan moderator
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) moderator?: number[];
}

export class UbahRapatDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) judul?: string;
  @IsOptional() @IsString() @MaxLength(5000) deskripsi?: string;
  @IsOptional() @IsDateString() jadwal_at?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(720) durasi_menit?: number | null;
  @IsOptional() @IsString() @MaxLength(30) kategori?: string | null;
  @IsOptional() @IsString() @MaxLength(200) lokasi?: string | null;
}

export class DuplikatDto {
  @IsOptional() @IsDateString() jadwal_at?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) judul?: string;
}

export class ResponDto {
  @IsIn(['hadir', 'mungkin', 'tidak']) respon: string;
}

export class NotulenDto {
  @IsString() @MaxLength(200000) notulen: string;
}

export class TindakDto {
  @IsString() @MinLength(2) @MaxLength(300) judul: string;
  @IsOptional() @Type(() => Number) @IsInt() id_pic?: number | null;
  @IsOptional() @IsDateString() tenggat?: string | null;
}

export class UbahTindakDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(300) judul?: string;
  @IsOptional() @Type(() => Number) @IsInt() id_pic?: number | null;
  @IsOptional() @IsDateString() tenggat?: string | null;
  @IsOptional() @IsBoolean() selesai?: boolean;
}

export class PesertaDto {
  @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) id_karyawan: number[];
}

export class KelolaDto {
  @IsIn(['keluarkan', 'bisukan', 'akhiri']) aksi: string;
  @IsOptional() @IsString() @MaxLength(100) identity?: string;
  @IsOptional() @IsString() @MaxLength(100) track_sid?: string;
}

export class LinkTamuDto {
  @IsBoolean() aktif: boolean;
  // true = buat kode baru (link lama tidak berlaku lagi)
  @IsOptional() @IsBoolean() baru?: boolean;
  // masa berlaku dalam jam dari sekarang (kosong = 24 jam setelah jadwal)
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720) jam?: number;
}

export class MasukTamuDto {
  @IsString() @MinLength(2) @MaxLength(100) nama: string;
  @IsOptional() @IsString() @MaxLength(100) instansi?: string;
}
