import { IsString, IsInt } from 'class-validator';

export class KirimPesanDto {
  @IsInt() id_chat: number;
  @IsString() text: string;
}
