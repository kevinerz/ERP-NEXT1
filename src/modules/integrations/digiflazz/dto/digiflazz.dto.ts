import { IsString, IsOptional, IsInt } from 'class-validator';

export class ConnectDigiflazzDto {
  @IsString() username: string;
  @IsString() api_key: string;
}

export class BeliDigiflazzDto {
  @IsInt() id_sumber: number;
  @IsString() buyer_sku_code: string;
  @IsOptional() @IsString() keterangan?: string;
}
