import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const PERUNTUKAN = ['Infrastruktur', 'Server', 'Pelanggan', 'Cadangan'] as const;

export class BlokDto {
  @IsString() @MaxLength(43) prefix: string;
  @IsOptional() @IsString() @MaxLength(20) asn?: string;
  @IsString() @MaxLength(100) nama: string;
  @IsOptional() @IsString() catatan?: string;
}

export class ZonaDto {
  @IsString() @MaxLength(43) prefix: string;
  @IsString() @MaxLength(100) nama: string;
  @IsIn(PERUNTUKAN) peruntukan: string;
  @IsOptional() @IsString() catatan?: string;
}

export class AlokasiDto {
  @Type(() => Number) @IsInt() id_blok: number;
  @IsString() @MaxLength(43) prefix: string;
  @IsIn(['Dipakai', 'Dicadangkan']) status: string;
  @IsIn(PERUNTUKAN) peruntukan: string;
  @IsOptional() @Type(() => Number) @IsInt() id_site?: number | null;
  @IsOptional() @IsString() @MaxLength(45) gateway?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4094) vlan?: number | null;
  @IsOptional() @IsString() @MaxLength(150) perangkat?: string;
  @IsOptional() @IsString() keterangan?: string;
}

export class UbahAlokasiDto {
  @IsOptional() @IsIn(['Dipakai', 'Dicadangkan']) status?: string;
  @IsOptional() @IsIn(PERUNTUKAN) peruntukan?: string;
  // null = lepas tautan site
  @IsOptional() @Type(() => Number) @IsInt() id_site?: number | null;
  @IsOptional() @IsString() @MaxLength(45) gateway?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4094) vlan?: number | null;
  @IsOptional() @IsString() @MaxLength(150) perangkat?: string;
  @IsOptional() @IsString() keterangan?: string;
}

export class LepasDto {
  // true = langsung tersedia lagi (tanpa karantina)
  @IsOptional() @IsBoolean() langsung?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) hari?: number;
  @IsOptional() @IsString() alasan?: string;
}
