import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password_lama: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password_baru: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  konfirmasi: string;
}
