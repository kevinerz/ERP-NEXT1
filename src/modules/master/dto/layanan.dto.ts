import { IsString, IsBoolean, IsOptional, IsNumber, MaxLength, Min, Max } from 'class-validator';

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
  @IsNumber()
  @Min(0)
  @Max(100)
  sla_target_pct?: number;

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
  @IsNumber()
  @Min(0)
  @Max(100)
  sla_target_pct?: number;

  @IsOptional()
  @IsBoolean()
  is_managed?: boolean;

  @IsOptional()
  @IsBoolean()
  is_aktif?: boolean;
}
