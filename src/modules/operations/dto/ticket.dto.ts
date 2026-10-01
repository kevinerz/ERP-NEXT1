import { IsString, IsOptional, IsInt, IsDateString, IsIn, IsNotEmpty, MaxLength, Allow, ValidateIf } from 'class-validator';

const STATUS_TIKET = ['Open', 'In_Progress', 'Pending_Customer', 'Resolved', 'Closed'] as const;
const PRIORITAS    = ['Critical', 'High', 'Medium', 'Low'] as const;
const SUMBER_TIKET = ['Internal', 'PRTG', 'UptimeKuma', 'Portal', 'WA'] as const;

export class CreateTicketDto {
  @IsInt() id_site: number;
  @IsOptional() @IsInt() id_perangkat?: number;
  @IsOptional() @IsInt() id_teknisi_pic?: number;
  @IsOptional() @IsIn(SUMBER_TIKET) sumber_tiket?: string;
  @IsNotEmpty() @IsString() @MaxLength(255) judul_tiket: string;
  @IsOptional() @IsString() deskripsi_masalah?: string;
  @IsOptional() @IsIn(PRIORITAS) prioritas?: string;
}

export class UpdateTicketDto {
  // null diperbolehkan untuk un-assign teknisi
  @IsOptional() @ValidateIf((o) => o.id_teknisi_pic !== null) @IsInt() id_teknisi_pic?: number | null;
  @IsOptional() @ValidateIf((o) => o.id_kontak_teknisi !== null) @IsInt() id_kontak_teknisi?: number | null;
  @IsOptional() @IsNotEmpty() @IsString() @MaxLength(255) judul_tiket?: string;
  @IsOptional() @IsString() deskripsi_masalah?: string;
  @IsOptional() @IsIn(PRIORITAS) prioritas?: string;
  @IsOptional() @IsIn(STATUS_TIKET) status_tiket?: string;
  @IsOptional() @IsDateString() tgl_berangkat?: string;
  @IsOptional() @IsDateString() tgl_sampai?: string;
}

export class AddLogDto {
  @IsInt() id_ticket: number;
  @IsOptional() @IsIn(STATUS_TIKET) status_ke?: string;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}
