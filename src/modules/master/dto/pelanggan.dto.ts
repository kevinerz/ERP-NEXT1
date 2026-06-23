import { IsString, IsOptional, IsBoolean, IsEmail, MaxLength } from 'class-validator';

export class CreatePelangganDto {
  @IsString() kode_pelanggan: string;
  @IsString() nama_pelanggan: string;
  @IsOptional() @IsString() npwp?: string;
  @IsOptional() @IsString() alamat_kantor?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_billing?: string;
  @IsOptional() @IsString() no_telp?: string;
  @IsOptional() @IsString() nama_pic_utama?: string;
  @IsOptional() @IsString() no_hp_pic_utama?: string;
}

export class UpdatePelangganDto {
  @IsOptional() @IsString() nama_pelanggan?: string;
  @IsOptional() @IsString() npwp?: string;
  @IsOptional() @IsString() alamat_kantor?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_billing?: string;
  @IsOptional() @IsString() no_telp?: string;
  @IsOptional() @IsString() nama_pic_utama?: string;
  @IsOptional() @IsString() no_hp_pic_utama?: string;
}
