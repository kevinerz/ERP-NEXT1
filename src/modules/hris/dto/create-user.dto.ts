import { IsString, IsArray, MinLength, MaxLength, ArrayNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsArray()
  @ArrayNotEmpty()
  role_ids: number[];
}
