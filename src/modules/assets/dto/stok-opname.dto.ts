import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateStokOpnameDto {
  @IsInt() id_gudang: number;
  @IsOptional() @IsString() catatan?: string;
}

export class ScanStokOpnameDto {
  @IsString() kode_aset: string;
  @IsOptional() @IsString() catatan?: string;
}
