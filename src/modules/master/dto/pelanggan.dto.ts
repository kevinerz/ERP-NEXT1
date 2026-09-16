import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';

export class CreatePelangganDto {
  @IsString() kode_pelanggan: string;
  @IsString() nama_pelanggan: string;
  @IsOptional() @IsString() npwp?: string;
  @IsOptional() @IsString() alamat_kantor?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_billing?: string;
  @IsOptional() @IsString() no_telp?: string;
  @IsOptional() @IsString() nama_pic_utama?: string;
  @IsOptional() @IsString() no_hp_pic_utama?: string;

  // Informasi Perusahaan
  @IsOptional() @IsString() jenis_usaha?: string;
  @IsOptional() @IsString() kota?: string;
  @IsOptional() @IsString() nama_pemilik?: string;
  @IsOptional() @IsString() jabatan_pemilik?: string;
  @IsOptional() @IsString() no_ktp_pemilik?: string;
  @IsOptional() @IsString() no_ponsel_pemilik?: string;

  // Penanggung Jawab Teknis
  @IsOptional() @IsString() nama_pic_teknis?: string;
  @IsOptional() @IsString() jabatan_pic_teknis?: string;
  @IsOptional() @IsString() no_telp_pic_teknis?: string;
  @IsOptional() @IsString() no_ponsel_pic_teknis?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_pic_teknis?: string;

  // Penanggung Jawab Keuangan
  @IsOptional() @IsString() nama_pic_keuangan?: string;
  @IsOptional() @IsString() jabatan_pic_keuangan?: string;
  @IsOptional() @IsString() no_telp_pic_keuangan?: string;
  @IsOptional() @IsString() no_ponsel_pic_keuangan?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_pic_keuangan?: string;
  @IsOptional() @IsString() alamat_penagihan?: string;
}

export class UpdatePelangganDto {
  @IsOptional() @IsString() nama_pelanggan?: string;
  @IsOptional() @IsString() npwp?: string;
  @IsOptional() @IsString() alamat_kantor?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_billing?: string;
  @IsOptional() @IsString() no_telp?: string;
  @IsOptional() @IsString() nama_pic_utama?: string;
  @IsOptional() @IsString() no_hp_pic_utama?: string;

  // Informasi Perusahaan
  @IsOptional() @IsString() jenis_usaha?: string;
  @IsOptional() @IsString() kota?: string;
  @IsOptional() @IsString() nama_pemilik?: string;
  @IsOptional() @IsString() jabatan_pemilik?: string;
  @IsOptional() @IsString() no_ktp_pemilik?: string;
  @IsOptional() @IsString() no_ponsel_pemilik?: string;

  // Penanggung Jawab Teknis
  @IsOptional() @IsString() nama_pic_teknis?: string;
  @IsOptional() @IsString() jabatan_pic_teknis?: string;
  @IsOptional() @IsString() no_telp_pic_teknis?: string;
  @IsOptional() @IsString() no_ponsel_pic_teknis?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_pic_teknis?: string;

  // Penanggung Jawab Keuangan
  @IsOptional() @IsString() nama_pic_keuangan?: string;
  @IsOptional() @IsString() jabatan_pic_keuangan?: string;
  @IsOptional() @IsString() no_telp_pic_keuangan?: string;
  @IsOptional() @IsString() no_ponsel_pic_keuangan?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_pic_keuangan?: string;
  @IsOptional() @IsString() alamat_penagihan?: string;
}
