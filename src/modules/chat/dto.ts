import { IsIn } from 'class-validator';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class PribadiDto {
  @Type(() => Number) @IsInt() id_karyawan: number;
}

export class GrupDto {
  @IsString() @MinLength(2) @MaxLength(100) nama: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) anggota: number[];
}

export class UbahGrupDto {
  @IsString() @MinLength(2) @MaxLength(100) nama: string;
}

export class TambahAnggotaDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) anggota: number[];
}

export class KirimDto {
  @IsString() @MaxLength(4000) isi: string;
  @IsOptional() @Type(() => Number) @IsInt() id_balas?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @Type(() => Number) @IsInt({ each: true }) mention?: number[];
}

export class UbahPesanDto {
  @IsString() @MaxLength(4000) isi: string;
}

export class BacaDto {
  @Type(() => Number) @IsInt() id_pesan: number;
}

export class BisuDto {
  @IsBoolean() bisu: boolean;
}

export class DiskusiDto {
  @IsIn(['tiket', 'site']) jenis: 'tiket' | 'site';
  @Type(() => Number) @IsInt() id: number;
}

export class RujukanDto {
  @IsString() @MaxLength(200) q: string;
}

export class ReaksiDto {
  @IsString() @MaxLength(16) emoji: string;
}

export class KanalDto {
  @IsString() @MinLength(2) @MaxLength(40) nama: string;
}
