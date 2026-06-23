import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';

export class CreateTicketDto {
  @IsInt() id_site: number;
  @IsOptional() @IsInt() id_perangkat?: number;
  @IsOptional() @IsInt() id_teknisi_pic?: number;
  @IsOptional() @IsString() sumber_tiket?: string;
  @IsString() judul_tiket: string;
  @IsOptional() @IsString() deskripsi_masalah?: string;
  @IsOptional() @IsString() prioritas?: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsInt() id_teknisi_pic?: number;
  @IsOptional() @IsString() judul_tiket?: string;
  @IsOptional() @IsString() deskripsi_masalah?: string;
  @IsOptional() @IsString() prioritas?: string;
  @IsOptional() @IsString() status_tiket?: string;
}

export class AddLogDto {
  @IsInt() id_ticket: number;
  @IsOptional() @IsString() status_ke?: string;
  @IsOptional() @IsString() catatan?: string;
}
