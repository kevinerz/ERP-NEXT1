import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, IsArray, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export const JENIS_VISIT = ['Perbaikan', 'Instalasi', 'Maintenance', 'Survey', 'Relokasi', 'Upgrade', 'Tarik Perangkat', 'Troubleshoot', 'Lainnya'];
export const PRIORITAS_VISIT = ['Rendah', 'Normal', 'Tinggi', 'Darurat'];
export const STATUS_VISIT = ['Open', 'In_Progress', 'Completed', 'Cancelled'];

export class BuatVisitDto {
  @Type(() => Number) @IsInt() id_site: number;
  @IsOptional() @Type(() => Number) @IsInt() id_ticket?: number;
  @IsString() @IsIn(JENIS_VISIT) jenis_wo: string;
  @IsOptional() @IsString() @IsIn(PRIORITAS_VISIT) prioritas?: string;
  @IsString() @MinLength(3) @MaxLength(3000) deskripsi_tugas: string;
  @IsOptional() @IsDateString() tgl?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) jam?: string;
  @IsOptional() @Type(() => Number) @IsInt() id_teknisi?: number;
}

export class UbahVisitDto {
  @IsOptional() @IsString() @IsIn(JENIS_VISIT) jenis_wo?: string;
  @IsOptional() @IsString() @IsIn(PRIORITAS_VISIT) prioritas?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3000) deskripsi_tugas?: string;
}

/** tgl/id_teknisi null = kembalikan ke antrean */
export class JadwalDto {
  @IsOptional() @IsDateString() tgl?: string | null;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) jam?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() id_teknisi?: number | null;
}

export class StatusVisitDto {
  @IsString() @IsIn(STATUS_VISIT) status: string;
  @IsOptional() @IsString() @MaxLength(3000) catatan?: string;
}

export class KirimWaDto {
  @IsString() @IsIn(['teknisi', 'pic']) ke: string;
  @IsString() @MinLength(8) @MaxLength(30) nomor: string;
  @IsString() @MinLength(3) @MaxLength(4000) teks: string;
}

export class WaHarianDto {
  @IsDateString() tgl: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @Type(() => Number) @IsInt({ each: true }) id_teknisi?: number[];
}

// ── Link lapangan teknisi (tanpa login) ─────────────────────────────────────
export class CheckinDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsOptional() @Type(() => Number) @IsNumber() akurasi?: number;
}

export class FotoLapanganDto {
  @IsString() @IsIn(['Sebelum', 'Sesudah', 'Lainnya']) jenis: string;
}

export class SelesaiLapanganDto {
  @IsString() @MinLength(3) @MaxLength(3000) catatan: string;
  @IsOptional() @IsString() @MaxLength(700_000) ttd?: string; // data:image/png;base64,...
  @IsOptional() @IsString() @MaxLength(150) ttd_nama?: string;
  @IsOptional() @IsString() @MaxLength(500) tanpa_ttd_alasan?: string;
}

export class GagalLapanganDto {
  @IsString() @MinLength(3) @MaxLength(100) alasan: string;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}
