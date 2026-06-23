import { IsString, IsOptional, IsInt, IsNumber, IsDateString } from 'class-validator';

export class CreateKontrakDto {
  @IsInt() id_site: number;
  @IsInt() id_layanan: number;
  @IsOptional() @IsInt() id_quotation?: number;
  @IsDateString() tgl_mulai: string;
  @IsOptional() @IsDateString() tgl_berakhir?: string;
  @IsOptional() @IsInt() durasi_bulan?: number;
  @IsNumber() harga_mrc: number;
  @IsOptional() @IsNumber() harga_otc?: number;
}

export class UpdateKontrakDto {
  @IsOptional() @IsDateString() tgl_berakhir?: string;
  @IsOptional() @IsInt() durasi_bulan?: number;
  @IsOptional() @IsNumber() harga_mrc?: number;
  @IsOptional() @IsNumber() harga_otc?: number;
  @IsOptional() @IsString() status_kontrak?: string;
}

export class TerminasiDto {
  @IsDateString() tanggal_terminasi: string;
  @IsOptional() @IsString() alasan_terminasi?: string;
}
