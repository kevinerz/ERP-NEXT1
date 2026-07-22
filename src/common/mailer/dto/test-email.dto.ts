import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class TestEmailDto {
  @IsEmail({}, { message: 'Alamat email tujuan tidak valid' })
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
