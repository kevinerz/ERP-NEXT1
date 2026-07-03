import {
  Controller, Get, Patch, Post,
  Body, UploadedFile, UseInterceptors, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SettingsService, SettingKey } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll() {
    return this.settingsService.getAll();
  }

  @Patch()
  @UsePipes(new ValidationPipe({ whitelist: false }))
  updateMany(@Body() dto: Partial<Record<SettingKey, string>>) {
    return this.settingsService.updateMany(dto);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadLogo(@UploadedFile() file: { buffer: Buffer; mimetype: string }) {
    return this.settingsService.uploadLogo(file.buffer, file.mimetype);
  }
}
