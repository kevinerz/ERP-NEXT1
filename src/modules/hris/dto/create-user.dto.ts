import { IsString, IsArray, MinLength, MaxLength, ArrayNotEmpty, IsInt, ArrayMaxSize } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  role_ids: number[];
}
