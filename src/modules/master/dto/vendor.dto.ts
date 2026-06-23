import { IsString, IsBoolean, IsOptional, IsEmail, MaxLength } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  @MaxLength(150)
  nama_vendor: string;

  @IsString()
  @MaxLength(30)
  tipe_vendor: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kontak_pic?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email_pic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  no_telp?: string;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsBoolean()
  is_aktif?: boolean;
}

export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nama_vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tipe_vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kontak_pic?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email_pic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  no_telp?: string;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsBoolean()
  is_aktif?: boolean;
}
