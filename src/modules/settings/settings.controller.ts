import {
  Controller, Get, Patch, Post,
  Body, UploadedFile, UseInterceptors,
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
  updateMany(@Body() dto: Partial<Record<SettingKey, string>>) {
    return this.settingsService.updateMany(dto);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@UploadedFile() file: { buffer: Buffer; originalname: string }) {
    return this.settingsService.uploadLogo(file.buffer, file.originalname);
  }
}
