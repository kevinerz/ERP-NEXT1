import { IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsDateString, Min } from 'class-validator';

export class CreateSimTopupDto {
  @IsInt()
  id_sumber: number;

  @IsString()
  jenis_topup: string;

  @IsNumber()
  @Min(0)
  nominal: number;

  @IsDateString()
  tgl_topup: string;

  @IsOptional()
  @IsString()
  keterangan?: string;
}

export class CreateAsetDto {
  @IsString() nama_perangkat: string;
  @IsOptional() @IsString() merk?: string;
  @IsOptional() @IsString() tipe_model?: string;
  @IsOptional() @IsString() serial_number?: string;
  @IsOptional() @IsBoolean() is_serialized?: boolean;
  @IsOptional() @IsInt() stok_jumlah?: number;
  @IsString() kategori: string;
  @IsOptional() @IsString() kondisi?: string;
  @IsOptional() @IsInt() id_site?: number;
  @IsOptional() @IsDateString() tgl_perolehan?: string;
  @IsOptional() @IsNumber() harga_perolehan?: number;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateAsetDto {
  @IsOptional() @IsString() nama_perangkat?: string;
  @IsOptional() @IsString() merk?: string;
  @IsOptional() @IsString() tipe_model?: string;
  @IsOptional() @IsString() kondisi?: string;
  @IsOptional() @IsString() status_aset?: string;
  @IsOptional() @IsInt() id_site?: number;
  @IsOptional() @IsString() catatan?: string;
}

export class CreateMutasiDto {
  @IsInt() id_aset: number;
  @IsString() jenis_mutasi: string;
  @IsOptional() @IsInt() jumlah?: number;
  @IsOptional() @IsInt() id_project?: number;
  @IsOptional() @IsInt() id_wo?: number;
  @IsOptional() @IsInt() id_site_asal?: number;
  @IsOptional() @IsInt() id_site_tujuan?: number;
  @IsOptional() @IsString() keterangan?: string;
}
