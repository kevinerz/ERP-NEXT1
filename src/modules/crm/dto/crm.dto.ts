import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertPicDto {
  @IsOptional() @IsInt() id_pic?: number;
  @IsInt() id_site: number;
  @IsString() nama_pic: string;
  @IsOptional() @IsString() jabatan?: string;
  @IsOptional() @IsString() no_kontak?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() is_utama?: boolean;
  @IsOptional() @IsString() tempat_lahir?: string;
  @IsOptional() @IsDateString() tgl_lahir?: string;
  @IsOptional() @IsString() media_komunikasi?: string;
  @IsOptional() @IsString() rencana_tambah_layanan?: string;
  @IsOptional() @IsString() catatan_update?: string;
}

export class ImportPicRowDto {
  @IsString() nama_perusahaan: string;
  @IsString() nama_pic: string;
  @IsOptional() @IsString() jabatan?: string;
  @IsOptional() @IsString() no_kontak?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() tempat_lahir?: string;
  @IsOptional() @IsString() tgl_lahir?: string;
  @IsOptional() @IsString() media_komunikasi?: string;
  @IsOptional() @IsString() rencana_tambah_layanan?: string;
  @IsOptional() @IsString() catatan_update?: string;
}

export class ImportPicDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportPicRowDto)
  rows: ImportPicRowDto[];
}
