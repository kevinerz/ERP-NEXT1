import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';

export class CreateSiteDto {
  @IsInt() id_pelanggan: number;
  @IsInt() id_layanan: number;
  @IsString() kode_site: string;
  @IsString() nama_site: string;
  @IsString() alamat_lengkap: string;
  @IsOptional() @IsString() kota?: string;
  @IsOptional() @IsString() provinsi?: string;
  @IsOptional() @IsString() koordinat_gps?: string;
  @IsOptional() @IsString() status_site?: string;
  @IsOptional() @IsDateString() tgl_aktif?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateSiteDto {
  @IsOptional() @IsInt() id_layanan?: number;
  @IsOptional() @IsString() nama_site?: string;
  @IsOptional() @IsString() alamat_lengkap?: string;
  @IsOptional() @IsString() kota?: string;
  @IsOptional() @IsString() provinsi?: string;
  @IsOptional() @IsString() koordinat_gps?: string;
  @IsOptional() @IsString() status_site?: string;
  @IsOptional() @IsDateString() tgl_aktif?: string;
  @IsOptional() @IsDateString() tgl_terminasi?: string;
  @IsOptional() @IsString() catatan?: string;
}
