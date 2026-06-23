import { IsString, IsOptional, IsInt, IsNumber, IsDateString, IsBoolean } from 'class-validator';

export class CreateSumberInternetDto {
  @IsInt() id_site: number;
  @IsInt() id_vendor_isp: number;
  @IsOptional() @IsString() nomor_pelanggan_isp?: string;
  @IsOptional() @IsString() peruntukan_link?: string;
  @IsOptional() @IsString() bandwidth_mbps?: string;
  @IsOptional() @IsNumber() biaya_mrc_vendor?: number;
  @IsOptional() @IsInt() id_aset_sim?: number;
  @IsOptional() @IsDateString() tgl_mulai?: string;
  @IsOptional() @IsDateString() tgl_berakhir?: string;
  @IsOptional() @IsString() status_link?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdateSumberInternetDto {
  @IsOptional() @IsInt() id_vendor_isp?: number;
  @IsOptional() @IsString() nomor_pelanggan_isp?: string;
  @IsOptional() @IsString() peruntukan_link?: string;
  @IsOptional() @IsString() bandwidth_mbps?: string;
  @IsOptional() @IsNumber() biaya_mrc_vendor?: number;
  @IsOptional() @IsInt() id_aset_sim?: number;
  @IsOptional() @IsDateString() tgl_mulai?: string;
  @IsOptional() @IsDateString() tgl_berakhir?: string;
  @IsOptional() @IsString() status_link?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class CreatePerangkatDto {
  @IsInt() id_site: number;
  @IsString() jenis_perangkat: string;
  @IsOptional() @IsInt() id_aset?: number;
  @IsOptional() @IsString() merk?: string;
  @IsOptional() @IsString() tipe_model?: string;
  @IsOptional() @IsString() serial_number?: string;
  @IsOptional() @IsString() ip_address?: string;
  @IsOptional() @IsString() mac_address?: string;
  @IsOptional() @IsDateString() tgl_pasang?: string;
  @IsOptional() @IsString() status_perangkat?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class UpdatePerangkatDto {
  @IsOptional() @IsString() jenis_perangkat?: string;
  @IsOptional() @IsInt() id_aset?: number;
  @IsOptional() @IsString() merk?: string;
  @IsOptional() @IsString() tipe_model?: string;
  @IsOptional() @IsString() serial_number?: string;
  @IsOptional() @IsString() ip_address?: string;
  @IsOptional() @IsString() mac_address?: string;
  @IsOptional() @IsDateString() tgl_pasang?: string;
  @IsOptional() @IsString() status_perangkat?: string;
  @IsOptional() @IsString() catatan?: string;
}

export class CreatePicDto {
  @IsInt() id_site: number;
  @IsString() nama_pic: string;
  @IsOptional() @IsString() jabatan?: string;
  @IsOptional() @IsString() no_kontak?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() is_utama?: boolean;
}

export class UpdatePicDto {
  @IsOptional() @IsString() nama_pic?: string;
  @IsOptional() @IsString() jabatan?: string;
  @IsOptional() @IsString() no_kontak?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() is_utama?: boolean;
}
