import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Panjang mengikuti kolom DB site_pelanggan / prtg_rekonsiliasi
export class SimpanRekonDto {
  // Nama device PRTG saat ini — dipakai saat baris rekon pertama kali dibuat
  @IsOptional() @IsString() @MaxLength(150) device_name?: string;
  @IsOptional() @IsString() @MaxLength(150) nama_baru?: string;
  @IsOptional() @IsInt() id_site?: number | null;
  @IsOptional() @IsString() @MaxLength(100) kota?: string;
  @IsOptional() @IsString() @MaxLength(100) provinsi?: string;
  @IsOptional() @IsString() @MaxLength(2000) alamat_lengkap?: string;
  @IsOptional() @IsString() @MaxLength(50) koordinat_gps?: string;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}

export class ToggleDoneDto {
  @IsBoolean() done: boolean;
  @IsOptional() @IsString() @MaxLength(150) device_name?: string;
}

export class TerapkanNamaDto {
  @IsInt() @Min(1) id_site: number;
  @IsString() @MaxLength(150) nama: string;
}
