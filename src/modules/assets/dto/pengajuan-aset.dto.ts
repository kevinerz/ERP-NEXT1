import { IsString, IsOptional, IsInt, IsNumber, IsDateString, Min } from 'class-validator';

export class CreatePengajuanAsetDto {
  @IsString() nama_item: string;
  @IsString() kategori: string;
  @IsOptional() @IsInt() @Min(1) jumlah?: number;
  @IsString() alasan: string;
  @IsOptional() @IsNumber() @Min(0) estimasi_harga?: number;
  @IsOptional() @IsInt() id_gudang_tujuan?: number;
}

export class ApprovePengajuanAsetDto {
  @IsString() status_approval: string; // Disetujui | Ditolak
  @IsOptional() @IsString() catatan_approval?: string;
}

export class SelesaikanPengajuanAsetDto {
  @IsOptional() @IsString() serial_number?: string;
  @IsOptional() @IsNumber() @Min(0) harga_aktual?: number;
  @IsOptional() @IsInt() id_gudang?: number;
  @IsOptional() @IsDateString() tgl_terima?: string;
}
