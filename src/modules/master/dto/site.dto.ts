import { IsString, IsOptional, IsInt, IsDateString, MaxLength, MinLength } from 'class-validator';

export class CreateSiteDto {
  @IsInt() id_pelanggan: number;
  @IsInt() id_layanan: number;
  
  @IsString()
  @MaxLength(20)
  @MinLength(2)
  kode_site: string;
  
  @IsString()
  @MaxLength(150)
  @MinLength(3)
  nama_site: string;
  
  @IsString()
  @MaxLength(255)
  @MinLength(5)
  alamat_lengkap: string;
  
  @IsString()
  @MaxLength(50)
  @MinLength(3)
  kota: string; // REQUIRED — critical for operations
  
  @IsString()
  @MaxLength(50)
  @MinLength(3)
  provinsi: string; // REQUIRED — critical for reporting
  
  @IsOptional()
  @IsString()
  @MaxLength(100)
  koordinat_gps?: string;
  
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status_site?: string;
  
  @IsOptional()
  @IsDateString()
  tgl_aktif?: string;
  
  @IsOptional()
  @IsString()
  @MaxLength(255)
  catatan?: string;
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
