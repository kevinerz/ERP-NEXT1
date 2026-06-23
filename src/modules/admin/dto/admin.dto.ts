import {
  IsInt, IsString, IsOptional, IsArray, MinLength, MaxLength, IsIn,
} from 'class-validator';

const ALL_MODULS = ['hris', 'master', 'sales', 'projects', 'operations', 'assets', 'contracts', 'reports'];

export class CreateAdminUserDto {
  @IsInt()
  id_karyawan: number;

  @IsString()
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_MODULS, { each: true })
  modul_akses?: string[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
