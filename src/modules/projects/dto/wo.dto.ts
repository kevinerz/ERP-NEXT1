import { IsString, IsOptional, IsInt, IsNumber, IsDateString, Min } from 'class-validator';

export class CreateWoDto {
  @IsString() jenis_wo: string;
  @IsOptional() @IsInt() id_project?: number;
  @IsOptional() @IsInt() id_ticket?: number;
  @IsInt() id_site: number;
  @IsString() tipe_eksekutor: string;
  @IsOptional() @IsInt() id_teknisi_internal?: number;
  @IsOptional() @IsInt() id_vendor_ketiga?: number;
  @IsOptional() @IsNumber() @Min(0) fee_vendor?: number;
  @IsDateString() tgl_jadwal: string;
  @IsString() deskripsi_tugas: string;
}

export class UpdateWoDto {
  @IsOptional() @IsInt() id_teknisi_internal?: number;
  @IsOptional() @IsInt() id_vendor_ketiga?: number;
  @IsOptional() @IsNumber() @Min(0) fee_vendor?: number;
  @IsOptional() @IsDateString() tgl_jadwal?: string;
  @IsOptional() @IsString() deskripsi_tugas?: string;
  @IsOptional() @IsString() status_wo?: string;
  @IsOptional() @IsString() catatan_teknisi?: string;
  @IsOptional() @IsString() status_pembayaran_fee?: string;
}
