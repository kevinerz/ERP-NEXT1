import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class BuatRapatDto {
  @IsString() @MinLength(2) @MaxLength(200) judul: string;
  @IsOptional() @IsString() @MaxLength(5000) deskripsi?: string;
  // kosong = rapat dadakan (langsung mulai)
  @IsOptional() @IsDateString() jadwal_at?: string;
  @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) peserta: number[];
}

export class UbahRapatDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) judul?: string;
  @IsOptional() @IsString() @MaxLength(5000) deskripsi?: string;
  @IsOptional() @IsDateString() jadwal_at?: string | null;
}

export class PesertaDto {
  @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) id_karyawan: number[];
}

export class KelolaDto {
  @IsIn(['keluarkan', 'bisukan', 'akhiri']) aksi: string;
  @IsOptional() @IsString() @MaxLength(100) identity?: string;
  @IsOptional() @IsString() @MaxLength(100) track_sid?: string;
}
