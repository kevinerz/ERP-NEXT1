import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';

export class CreateActivityDto {
  @IsOptional() @IsInt() id_lead?: number;
  @IsOptional() @IsInt() id_opportunity?: number;
  @IsInt() id_sales_pic: number;
  @IsString() jenis_aktivitas: string;
  @IsDateString() tanggal_aktivitas: string;
  @IsString() ringkasan: string;
  @IsOptional() @IsString() hasil?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsInt() id_sales_pic?: number;
  @IsOptional() @IsString() jenis_aktivitas?: string;
  @IsOptional() @IsDateString() tanggal_aktivitas?: string;
  @IsOptional() @IsString() ringkasan?: string;
  @IsOptional() @IsString() hasil?: string;
}
