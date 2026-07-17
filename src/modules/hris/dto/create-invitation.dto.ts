import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  departemen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jabatan?: string;
}
