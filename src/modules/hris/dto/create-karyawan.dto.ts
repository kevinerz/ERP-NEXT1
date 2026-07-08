import { IsString, IsOptional, IsEmail, IsBoolean, IsDateString, MaxLength, MinLength } from 'class-validator';

export class CreateKaryawanDto {
  @IsString()
  @MaxLength(20)
  nip: string;

  @IsString()
  @MaxLength(150)
  nama_lengkap: string;

  @IsString()
  @MaxLength(100)
  jabatan: string;

  @IsString()
  @MaxLength(50)
  departemen: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  no_hp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsDateString()
  tgl_bergabung?: string;

  @IsOptional()
  @IsBoolean()
  status_aktif?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
