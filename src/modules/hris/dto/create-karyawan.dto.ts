import { IsString, IsOptional, IsEmail, IsBoolean, IsDateString, IsIn, MaxLength } from 'class-validator';

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
  @MaxLength(100)
  tempat_lahir?: string;

  @IsOptional()
  @IsDateString()
  tgl_lahir?: string;

  @IsOptional()
  @IsIn(['L', 'P'])
  jenis_kelamin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  agama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status_pernikahan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  no_ktp?: string;

  @IsOptional()
  @IsString()
  alamat_ktp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  no_npwp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pendidikan_terakhir?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  kontak_darurat_nama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  kontak_darurat_hp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  kontak_darurat_hubungan?: string;

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
}
