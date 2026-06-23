import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';

export class CreateBastDto {
  @IsInt() id_project: number;
  @IsOptional() @IsString() nama_penandatangan_pelanggan?: string;
  @IsOptional() @IsString() jabatan_penandatangan_pelanggan?: string;
  @IsOptional() @IsDateString() tgl_ditandatangani?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateBastDto {
  @IsOptional() @IsString() nama_penandatangan_pelanggan?: string;
  @IsOptional() @IsString() jabatan_penandatangan_pelanggan?: string;
  @IsOptional() @IsDateString() tgl_ditandatangani?: string;
  @IsOptional() @IsString() status_sinkronisasi_finance?: string;
  @IsOptional() @IsString() catatan?: string;
}
