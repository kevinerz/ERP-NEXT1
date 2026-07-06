import {
  IsString, IsInt, IsOptional, IsDateString, IsNumber,
  Min, MaxLength, IsIn, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWoDto {
  @IsString() @MaxLength(30)
  @IsIn(['Instalasi', 'Maintenance', 'Perbaikan', 'Relokasi', 'Upgrade', 'Lainnya'])
  jenis_wo: string;

  @IsInt()
  id_site: number;

  @IsOptional() @IsInt()
  id_ticket?: number;

  @IsOptional() @IsInt()
  id_project?: number;

  @IsString() @MaxLength(30)
  @IsIn(['Internal_NEXT1', 'Vendor_Ketiga'])
  tipe_eksekutor: string;

  @IsOptional() @IsInt()
  id_teknisi_internal?: number;

  @IsOptional() @IsInt()
  id_vendor_ketiga?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  fee_vendor?: number;

  @IsDateString()
  tgl_jadwal: string;

  @IsString()
  deskripsi_tugas: string;
}

export class UpdateWoDto {
  @IsOptional() @IsString() @MaxLength(30)
  @IsIn(['Open', 'In_Progress', 'Completed', 'Cancelled'])
  status_wo?: string;

  @IsOptional() @IsDateString()
  tgl_jadwal?: string;

  @IsOptional() @IsString()
  deskripsi_tugas?: string;

  @IsOptional() @IsString()
  catatan_teknisi?: string;

  @IsOptional() @IsString() @MaxLength(100)
  koordinat_checkin?: string;

  @IsOptional() @IsInt()
  id_teknisi_internal?: number;

  @IsOptional() @IsInt()
  id_vendor_ketiga?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  fee_vendor?: number;

  @IsOptional() @IsString()
  @IsIn(['Belum_Dibayar', 'Sudah_Dibayar'])
  status_pembayaran_fee?: string;
}

export class BaMaterialItemDto {
  // Dari gudang (stok ikut terpotong) — atau kosongkan & isi nama_item manual
  @IsOptional() @IsInt()
  id_aset?: number;

  @IsOptional() @IsString() @MaxLength(150)
  nama_item?: string;

  @IsOptional() @IsInt() @Min(1)
  jumlah?: number;

  @IsOptional() @IsString() @MaxLength(30)
  keterangan?: string; // Penyerahan / Terpakai / Penarikan
}

export class CreateBeritaAcaraDto {
  @IsString() @MaxLength(30)
  @IsIn(['Instalasi', 'Maintenance', 'Serah_Terima', 'Penarikan', 'Lainnya'])
  jenis_ba: string;

  @IsOptional() @IsString() @MaxLength(150)
  nama_penandatangan_next1?: string;

  @IsOptional() @IsString() @MaxLength(150)
  nama_penandatangan_pelanggan?: string;

  @IsOptional() @IsString() @MaxLength(100)
  jabatan_penandatangan_pelanggan?: string;

  @IsOptional() @IsString()
  catatan?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BaMaterialItemDto)
  material?: BaMaterialItemDto[];
}
