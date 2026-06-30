import { IsString, IsOptional, IsInt, IsDateString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsInt() id_opportunity: number;
  @IsInt() id_site: number;
  @IsInt() id_pm: number;
  @IsOptional() @IsInt() id_kontrak?: number;
  @IsOptional() @IsDateString() tgl_mulai?: string;
  @IsOptional() @IsDateString() tgl_target_selesai?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsInt() id_pm?: number;
  @IsOptional() @IsInt() id_kontrak?: number;
  @IsOptional() @IsDateString() tgl_mulai?: string;
  @IsOptional() @IsDateString() tgl_target_selesai?: string;
  @IsOptional() @IsDateString() tgl_actual_selesai?: string;
  @IsOptional() @IsString() status_project?: string;
  @IsOptional() @IsString() catatan?: string;
}
