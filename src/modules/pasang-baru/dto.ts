import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SiteSphDto {
  @IsString() @MinLength(2) @MaxLength(150) nama_site: string;
  @IsString() @MinLength(5) @MaxLength(2000) alamat: string;
  @IsOptional() @IsString() @MaxLength(100) lantai_unit?: string;
  @IsOptional() @IsString() @MaxLength(100) kota?: string;
  @Type(() => Number) @IsInt() id_layanan: number;
  @Type(() => Number) @IsNumber() @Min(0) biaya_bulanan: number;
  @Type(() => Number) @IsNumber() @Min(0) biaya_instalasi: number;
  @IsOptional() @IsDateString() tgl_rfs?: string;
  @IsOptional() @IsString() @MaxLength(150) pic_store_nama?: string;
  @IsOptional() @IsString() @MaxLength(30) pic_store_hp?: string;
}

export class SphDto {
  // pilih pelanggan yang sudah ada, atau isi nama pelanggan baru
  @IsOptional() @Type(() => Number) @IsInt() id_pelanggan?: number;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) pelanggan_baru?: string;
  @IsString() @MinLength(2) @MaxLength(150) nama_pic: string;
  @IsOptional() @IsString() @MaxLength(30) telp_pic?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_pic?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(120) durasi_bulan: number;
  @IsOptional() @IsString() @MaxLength(5000) catatan?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SiteSphDto) site: SiteSphDto[];
}

export class PutusanDto {
  @IsBoolean() setuju: boolean;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}

export class CatatanDto {
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}

/** Tab Sales setelah SPH disetujui — harga tidak bisa diubah (sudah disetujui Director) */
export class OrderSalesDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) nama_site?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(2000) alamat?: string;
  @IsOptional() @IsString() @MaxLength(100) lantai_unit?: string;
  @IsOptional() @IsString() @MaxLength(100) kota?: string;
  @IsOptional() @IsDateString() tgl_rfs?: string | null;
  @IsOptional() @IsString() @MaxLength(150) pic_store_nama?: string;
  @IsOptional() @IsString() @MaxLength(30) pic_store_hp?: string;
}

export class OrderOpsDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ikg_nominal?: number;
  @IsOptional() @IsString() @MaxLength(150) ikg_pengelola?: string;
  @IsOptional() @IsString() @MaxLength(500) ikg_catatan?: string;
}

export class LinkDto {
  @Type(() => Number) @IsInt() id_vendor_isp: number;
  @IsOptional() @IsIn(['Main', 'Backup']) peruntukan_link?: string;
  @IsOptional() @IsString() @MaxLength(100) nomor_pelanggan_isp?: string;
  @IsOptional() @IsString() @MaxLength(30) bandwidth_mbps?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) biaya_mrc_vendor?: number;
  @IsOptional() @IsDateString() tgl_mulai?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) durasi_bulan?: number | null;
  @IsOptional() @IsString() @MaxLength(100) sn_modem?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit_nominal?: number;
  @IsOptional() @IsDateString() deposit_tgl?: string | null;
  @IsOptional() @IsIn(['Ditahan', 'Dikembalikan']) deposit_status?: string;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}

export const JENIS_DOKUMEN = ['FAB', 'BA', 'TOPOLOGI', 'LAIN'] as const;
export class DokumenDto {
  @IsIn(JENIS_DOKUMEN as unknown as string[]) jenis: string;
  @IsOptional() @IsString() @MaxLength(500) keterangan?: string;
}
