import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class CreateKontakTeknisiDto {
  @IsString()
  @MaxLength(150)
  nama: string;

  @IsString()
  @MaxLength(20)
  no_hp: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  asal_vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  keahlian?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank_nama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank_no_rekening?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bank_atas_nama?: string;

  @IsOptional()
  @IsString()
  catatan?: string;
}

export class UpdateKontakTeknisiDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  no_hp?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  asal_vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  keahlian?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank_nama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank_no_rekening?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bank_atas_nama?: string;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsBoolean()
  is_aktif?: boolean;
}
