import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SiteSphDto {
  @IsOptional() @Type(() => Number) @IsInt() id_survey_site?: number;
  @IsString() @MinLength(2) @MaxLength(150) nama_site: string;
  @IsString() @MinLength(5) @MaxLength(2000) alamat: string;
  @IsOptional() @IsString() @MaxLength(100) lantai_unit?: string;
  @IsOptional() @IsString() @MaxLength(100) kota?: string;
  @Type(() => Number) @IsInt() id_layanan: number;
  @Type(() => Number) @IsNumber() @Min(0) biaya_bulanan: number;
  @Type(() => Number) @IsNumber() @Min(0) biaya_instalasi: number;
  @IsOptional() @IsDateString() tgl_rfs?: string;
  @IsOptional() @IsString() @MaxLength(150) pic_store_nama?: string;
  @IsOptional() @IsString() @MaxLength(30) pic_store_hp?: string;
}

/** Survey: tahap pertama — tanpa harga */
export class SiteSurveyDto {
  @IsOptional() @Type(() => Number) @IsInt() id_survey_site?: number;
  @IsString() @MinLength(2) @MaxLength(150) nama_site: string;
  @IsString() @MinLength(5) @MaxLength(2000) alamat: string;
  @IsOptional() @IsString() @MaxLength(100) lantai_unit?: string;
  @IsOptional() @IsString() @MaxLength(100) kota?: string;
  @Type(() => Number) @IsInt() id_layanan: number;
}

export class SurveyDto {
  // pelanggan lama (opsional); nama perusahaan selalu diisi
  @IsOptional() @Type(() => Number) @IsInt() id_pelanggan?: number | null;
  @IsString() @MinLength(2) @MaxLength(200) nama_perusahaan: string;
  @IsString() @MinLength(2) @MaxLength(150) nama_pic: string;
  @IsOptional() @IsString() @MaxLength(30) telp_pic?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_pic?: string;
  @IsOptional() @IsString() @MaxLength(5000) catatan?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SiteSurveyDto) site: SiteSurveyDto[];
}

export const DEPOSIT_JENIS = ['Kembali setelah pasang', 'Ditahan sampai berhenti'] as const;

export class SurveyVendorDto {
  @Type(() => Number) @IsInt() id_vendor_isp: number;
  @IsOptional() @IsIn(['Main', 'Backup']) peruntukan_link?: string;
  @IsOptional() @IsString() @MaxLength(30) bandwidth_mbps?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) biaya_mrc_vendor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) biaya_otc_vendor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit_nominal?: number;
  @IsOptional() @IsIn([...DEPOSIT_JENIS, '']) deposit_jenis?: string;
  @IsOptional() @IsString() @MaxLength(500) catatan?: string;
}

export class SurveyOpsSiteDto {
  @Type(() => Number) @IsInt() id_survey_site: number;
  @IsOptional() @IsIn(['Cover', 'Tidak cover', '']) cover?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ikg_nominal?: number;
  @IsOptional() @IsString() @MaxLength(150) ikg_pengelola?: string;
  @IsOptional() @IsString() @MaxLength(500) ikg_catatan?: string;
  @IsOptional() @IsString() @MaxLength(5000) catatan_ops?: string;
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SurveyVendorDto) vendor: SurveyVendorDto[];
}

/** OPS mengisi hasil survey: vendor ISP, IKG, deposit, cover/tidak cover per site */
export class SurveyOpsDto {
  @IsOptional() @IsString() @MaxLength(5000) catatan_ops?: string;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SurveyOpsSiteDto) site: SurveyOpsSiteDto[];
}

export class SurveyTeknisSiteDto {
  @Type(() => Number) @IsInt() id_survey_site: number;
  @IsOptional() @IsString() @MaxLength(5000) hasil_teknis?: string;
}

/** Hasil cek teknis (opsional, mis. M2M 5G cek sinyal) */
export class SurveyTeknisDto {
  @IsOptional() @IsString() @MaxLength(5000) catatan_teknis?: string;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SurveyTeknisSiteDto) site: SurveyTeknisSiteDto[];
}

export class SphDto {
  // SPH dibuat dari survey (opsional)
  @IsOptional() @Type(() => Number) @IsInt() id_survey?: number;
  // pilih pelanggan yang sudah ada, atau isi nama pelanggan baru
  @IsOptional() @Type(() => Number) @IsInt() id_pelanggan?: number;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) pelanggan_baru?: string;
  @IsString() @MinLength(2) @MaxLength(150) nama_pic: string;
  @IsOptional() @IsString() @MaxLength(30) telp_pic?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email_pic?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(120) durasi_bulan: number;
  @IsOptional() @IsString() @MaxLength(5000) catatan?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SiteSphDto) site: SiteSphDto[];
}

export class PutusanDto {
  @IsBoolean() setuju: boolean;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}

export class CatatanDto {
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}

/** Tab Sales setelah SPH disetujui — harga tidak bisa diubah (sudah disetujui Director) */
export class OrderSalesDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) nama_site?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(2000) alamat?: string;
  @IsOptional() @IsString() @MaxLength(100) lantai_unit?: string;
  @IsOptional() @IsString() @MaxLength(100) kota?: string;
  @IsOptional() @IsDateString() tgl_rfs?: string | null;
  @IsOptional() @IsString() @MaxLength(150) pic_store_nama?: string;
  @IsOptional() @IsString() @MaxLength(30) pic_store_hp?: string;
}

export class OrderOpsDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ikg_nominal?: number;
  @IsOptional() @IsString() @MaxLength(150) ikg_pengelola?: string;
  @IsOptional() @IsString() @MaxLength(500) ikg_catatan?: string;
}

export class LinkDto {
  @Type(() => Number) @IsInt() id_vendor_isp: number;
  @IsOptional() @IsIn(['Main', 'Backup']) peruntukan_link?: string;
  @IsOptional() @IsString() @MaxLength(100) nomor_pelanggan_isp?: string;
  @IsOptional() @IsString() @MaxLength(30) bandwidth_mbps?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) biaya_mrc_vendor?: number;
  @IsOptional() @IsDateString() tgl_mulai?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) durasi_bulan?: number | null;
  @IsOptional() @IsString() @MaxLength(100) sn_modem?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit_nominal?: number;
  @IsOptional() @IsDateString() deposit_tgl?: string | null;
  @IsOptional() @IsIn(['Ditahan', 'Dikembalikan']) deposit_status?: string;
  @IsOptional() @IsIn([...DEPOSIT_JENIS, '']) deposit_jenis?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) speedtest_down?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) speedtest_up?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) speedtest_ping?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}

export class FotoLinkDto {
  @IsIn(['modem', 'speedtest']) jenis: string;
}

// ── Tahap Network ──
export class PerangkatDto {
  @Type(() => Number) @IsInt() id_aset: number;
}
export class RequestPerangkatDto {
  @IsString() @MinLength(2) @MaxLength(150) nama_item: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) jumlah?: number;
  @IsOptional() @IsString() @MaxLength(2000) alasan?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimasi_harga?: number;
  @IsOptional() @IsString() @MaxLength(500) link_marketplace?: string;
}
export class KontakTeknisiBaruDto {
  @IsString() @MinLength(2) @MaxLength(150) nama: string;
  @IsString() @MinLength(8) @MaxLength(20) no_hp: string;
  @IsOptional() @IsString() @MaxLength(150) asal_vendor?: string;
}
export class NetworkDto {
  @IsIn(['Kirim_Vendor', 'Visit_Internal']) metode: string;
  @IsOptional() @Type(() => Number) @IsInt() id_kontak_teknisi?: number | null;
  // teknisi belum ada di kontak → dibuat sekalian
  @IsOptional() @ValidateNested() @Type(() => KontakTeknisiBaruDto) kontak_baru?: KontakTeknisiBaruDto;
  @IsOptional() @IsBoolean() kirim_wa?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() id_vendor_ketiga?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fee_vendor?: number;
  @IsOptional() @IsDateString() tgl_jadwal?: string | null;
  @IsOptional() @IsString() @MaxLength(100) nama_ekspedisi?: string;
  @IsOptional() @IsString() @MaxLength(100) nomor_resi?: string;
  @IsOptional() @IsDateString() tgl_kirim?: string | null;
  @IsOptional() @IsIn(['Packing', 'Dikirim', 'Diterima']) status_pengiriman?: string;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
}
export class BaDto {
  @IsString() @MinLength(2) @MaxLength(150) nama: string;
  @IsOptional() @IsString() @MaxLength(100) jabatan?: string;
  @IsString() @MaxLength(700_000) ttd: string; // data:image/png;base64,...
  @IsOptional() @IsString() @MaxLength(150) nama_next1?: string;
}

export const JENIS_DOKUMEN = ['FAB', 'BA', 'TOPOLOGI', 'LAIN'] as const;
export class DokumenDto {
  @IsIn(JENIS_DOKUMEN as unknown as string[]) jenis: string;
  @IsOptional() @IsString() @MaxLength(500) keterangan?: string;
}
