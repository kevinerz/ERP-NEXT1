import { IsString, IsOptional, IsInt, IsNumber, IsDateString } from 'class-validator';

export class CreateInvoiceDto {
  @IsInt() id_site: number;
  @IsOptional() @IsInt() id_kontrak?: number;
  @IsString() periode: string;             // "2026-07"
  @IsDateString() tgl_invoice: string;
  @IsDateString() tgl_jatuh_tempo: string;
  @IsNumber() subtotal: number;
  @IsOptional() @IsNumber() ppn_persen?: number;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsDateString() tgl_invoice?: string;
  @IsOptional() @IsDateString() tgl_jatuh_tempo?: string;
  @IsOptional() @IsNumber() subtotal?: number;
  @IsOptional() @IsNumber() ppn_persen?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class CreatePembayaranDto {
  @IsDateString() tgl_bayar: string;
  @IsNumber() jumlah: number;
  @IsString() metode: string;
  @IsOptional() @IsString() referensi?: string;
  @IsOptional() @IsString() catatan?: string;
}

// Generate invoice massal dari semua kontrak aktif untuk 1 periode
export class GenerateBulkDto {
  @IsString() periode: string;             // "2026-07"
  @IsDateString() tgl_invoice: string;
  @IsDateString() tgl_jatuh_tempo: string;
  @IsOptional() @IsNumber() ppn_persen?: number;
}
