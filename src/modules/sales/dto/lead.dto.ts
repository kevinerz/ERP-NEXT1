import { IsString, IsOptional, IsInt, IsEmail, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsString() @MaxLength(200) nama_prospek: string;
  @IsOptional() @IsString() @MaxLength(200) nama_perusahaan?: string;
  @IsOptional() @IsString() @MaxLength(20) no_kontak?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() sumber_lead?: string;
  @IsInt() id_sales_pic: number;
  @IsOptional() @IsString() catatan_awal?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MaxLength(200) nama_prospek?: string;
  @IsOptional() @IsString() @MaxLength(200) nama_perusahaan?: string;
  @IsOptional() @IsString() @MaxLength(20) no_kontak?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() sumber_lead?: string;
  @IsOptional() @IsString() status_lead?: string;
  @IsOptional() @IsInt() id_sales_pic?: number;
  @IsOptional() @IsString() catatan_awal?: string;
}
