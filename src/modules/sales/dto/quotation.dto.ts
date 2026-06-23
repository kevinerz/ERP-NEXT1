import { IsString, IsOptional, IsInt, IsNumber, IsDateString, MaxLength } from 'class-validator';

export class CreateQuotationDto {
  @IsInt() id_opportunity: number;
  @IsInt() id_sales_pic: number;
  @IsDateString() tgl_quotation: string;
  @IsOptional() @IsDateString() tgl_berlaku_sampai?: string;
  @IsOptional() @IsNumber() harga_mrc?: number;
  @IsOptional() @IsNumber() harga_otc?: number;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateQuotationDto {
  @IsOptional() @IsDateString() tgl_quotation?: string;
  @IsOptional() @IsDateString() tgl_berlaku_sampai?: string;
  @IsOptional() @IsNumber() harga_mrc?: number;
  @IsOptional() @IsNumber() harga_otc?: number;
  @IsOptional() @IsString() catatan?: string;
}

export class ApproveQuotationDto {
  @IsString() status_approval: string; // Approved | Rejected
  @IsInt() id_approver: number;
  @IsOptional() @IsString() catatan_approval?: string;
}
