import { IsString, IsOptional, IsInt, IsDateString, MaxLength } from 'class-validator';

export class CreatePresalesSurveyDto {
  @IsOptional() @IsInt() id_opportunity?: number;
  @IsOptional() @IsString() @MaxLength(200) nama_prospek?: string;
  @IsOptional() @IsString() alamat_survey?: string;
  @IsOptional() @IsString() @MaxLength(100) kota?: string;
  @IsOptional() @IsString() @MaxLength(50) koordinat_gps?: string;
  @IsOptional() @IsDateString() tanggal_survey?: string;
  @IsOptional() @IsString() @MaxLength(100) nama_odp?: string;
  @IsOptional() @IsString() @MaxLength(30) status_odp?: string;
  @IsOptional() @IsInt() id_layanan?: number;
  @IsOptional() @IsString() @MaxLength(50) vendor?: string;
  @IsOptional() @IsString() @MaxLength(100) nomor_order_vendor?: string;
  @IsOptional() @IsString() @MaxLength(100) sn_modem?: string;
  @IsOptional() @IsString() @MaxLength(30) status_order?: string;
  @IsOptional() @IsDateString() tgl_order?: string;
  @IsOptional() @IsDateString() tgl_estimasi_selesai?: string;
  @IsOptional() @IsDateString() tgl_selesai?: string;
  @IsOptional() @IsString() catatan?: string;
  @IsOptional() @IsInt() id_presales_pic?: number;
  @IsOptional() @IsString() @MaxLength(30) status_presales?: string;
}

export class UpdatePresalesSurveyDto extends CreatePresalesSurveyDto {}
