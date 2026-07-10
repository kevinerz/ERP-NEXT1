import { IsString, IsOptional, IsInt, IsEmail, Min, Max } from 'class-validator';

export class ConnectEmailDto {
  @IsEmail() email_address: string;
  @IsString() password: string;
  @IsString() imap_host: string;
  @IsInt() @Min(1) @Max(65535) imap_port: number;
  @IsString() smtp_host: string;
  @IsInt() @Min(1) @Max(65535) smtp_port: number;
}

export class SendEmailDto {
  @IsString() to: string;
  @IsOptional() @IsString() cc?: string;
  @IsOptional() @IsString() bcc?: string;
  @IsString() subject: string;
  @IsString() html: string;
  @IsOptional() @IsString() in_reply_to?: string;
}
