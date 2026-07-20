import { IsArray, ArrayNotEmpty, ArrayMaxSize, IsInt } from 'class-validator';

export class UpdateRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  role_ids: number[];
}
