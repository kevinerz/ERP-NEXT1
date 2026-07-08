import { IsString, IsOptional, IsInt, IsDateString, MaxLength, MinLength } from 'class-validator';

export class CreateSiteDto {
  @IsInt() id_pelanggan: number;
  @IsInt() id_layanan: number;
  @IsString() @MaxLength(50) kode_site: string;
  @IsString() @MaxLength(150) nama_site: string;
  @IsString() @MaxLength(255) alamat_lengkap: string;
  // Wajib — dipakai NOC board & laporan per wilayah
  @IsString() @MinLength(2) @MaxLength(50) kota: string;
  @IsString() @MinLength(2) @MaxLength(50) provinsi: string;
  @IsOptional() @IsString() @MaxLength(100) koordinat_gps?: string;
  @IsOptional() @IsString() @MaxLength(20) status_site?: string;
  @IsOptional() @IsDateString() tgl_aktif?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateSiteDto {
  @IsOptional() @IsInt() id_layanan?: number;
  @IsOptional() @IsString() @MaxLength(150) nama_site?: string;
  @IsOptional() @IsString() @MaxLength(255) alamat_lengkap?: string;
  @IsOptional() @IsString() @MaxLength(50) kota?: string;
  @IsOptional() @IsString() @MaxLength(50) provinsi?: string;
  @IsOptional() @IsString() @MaxLength(100) koordinat_gps?: string;
  @IsOptional() @IsString() @MaxLength(20) status_site?: string;
  @IsOptional() @IsDateString() tgl_aktif?: string;
  @IsOptional() @IsDateString() tgl_terminasi?: string;
  @IsOptional() @IsString() @MaxLength(255) catatan?: string;
}
