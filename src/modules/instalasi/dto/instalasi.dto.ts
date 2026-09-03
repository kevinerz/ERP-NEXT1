import { IsInt, IsOptional, IsString, IsDateString, IsDecimal, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInstalasiDto {
  @IsInt()
  id_site: number;

  @IsOptional() @IsInt()
  id_layanan?: number;

  @IsOptional() @IsString()
  jenis_pelaksana?: string; // Internal | Vendor

  @IsOptional() @IsInt()
  id_teknisi_internal?: number;

  @IsOptional() @IsInt()
  id_kontak_teknisi?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  fee_vendor?: number;

  @IsOptional() @IsDateString()
  tgl_jadwal?: string;

  @IsOptional() @IsString()
  catatan?: string;
}

export class UpdateInstalasiDto {
  @IsOptional() @IsInt()
  id_layanan?: number;

  @IsOptional() @IsString()
  jenis_pelaksana?: string;

  @IsOptional() @IsInt()
  id_teknisi_internal?: number;

  @IsOptional() @IsInt()
  id_kontak_teknisi?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  fee_vendor?: number;

  @IsOptional() @IsString()
  status_instalasi?: string;

  @IsOptional() @IsDateString()
  tgl_jadwal?: string;

  @IsOptional() @IsString()
  catatan?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  lokasi_lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  lokasi_lng?: number;
}

export class AddInstalasiLogDto {
  @IsInt()
  id_instalasi: number;

  @IsOptional() @IsString()
  status_ke?: string;

  @IsOptional() @IsString()
  catatan?: string;
}

export class SaveBASTDto {
  @IsOptional() @IsString()
  nama_penandatangan_pelanggan?: string;

  @IsOptional() @IsString()
  jabatan_penandatangan?: string;

  @IsOptional() @IsString()
  ttd_teknisi_path?: string;

  @IsOptional() @IsString()
  ttd_pelanggan_path?: string;
}

export class VendorLoginDto {
  @IsString()
  username: string;

  @IsString()
  pin: string;
}
