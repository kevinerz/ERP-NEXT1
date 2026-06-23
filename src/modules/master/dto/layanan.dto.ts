import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class CreateLayananDto {
  @IsString()
  @MaxLength(20)
  kode_layanan: string;

  @IsString()
  @MaxLength(100)
  nama_layanan: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsBoolean()
  is_managed?: boolean;

  @IsOptional()
  @IsBoolean()
  is_aktif?: boolean;
}

export class UpdateLayananDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nama_layanan?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsBoolean()
  is_managed?: boolean;

  @IsOptional()
  @IsBoolean()
  is_aktif?: boolean;
}
