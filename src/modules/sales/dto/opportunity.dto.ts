import { IsString, IsOptional, IsInt, IsNumber, IsDateString, MaxLength } from 'class-validator';

export class CreateOpportunityDto {
  @IsInt() id_lead: number;
  @IsOptional() @IsInt() id_layanan?: number;
  @IsString() @MaxLength(200) nama_opportunity: string;
  @IsInt() id_sales_pic: number;
  @IsOptional() @IsNumber() estimasi_nilai?: number;
  @IsOptional() @IsString() tahapan?: string;
  @IsOptional() @IsDateString() tgl_target_close?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateOpportunityDto {
  @IsOptional() @IsInt() id_layanan?: number;
  @IsOptional() @IsString() @MaxLength(200) nama_opportunity?: string;
  @IsOptional() @IsInt() id_sales_pic?: number;
  @IsOptional() @IsNumber() estimasi_nilai?: number;
  @IsOptional() @IsString() tahapan?: string;
  @IsOptional() @IsString() alasan_lost?: string;
  @IsOptional() @IsDateString() tgl_target_close?: string;
  @IsOptional() @IsString() catatan?: string;
}
