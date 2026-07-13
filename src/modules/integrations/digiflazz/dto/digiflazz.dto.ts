import { IsString, IsOptional, IsInt, IsIn } from 'class-validator';

export class ConnectDigiflazzDto {
  @IsString() username: string;
  @IsString() api_key: string;
  @IsIn(['production', 'development']) mode: 'production' | 'development';
}

export class BeliDigiflazzDto {
  @IsInt() id_sumber: number;
  @IsString() buyer_sku_code: string;
  @IsOptional() @IsString() keterangan?: string;
}
