import { Controller, Get, Post, Body, Param, Query, Req, ParseIntPipe } from '@nestjs/common';
import { SocialchatService } from './socialchat.service';
import { KirimPesanDto } from './dto/whatsapp.dto';

@Controller('socialchat')
export class SocialchatController {
  constructor(private readonly socialchatService: SocialchatService) {}

  @Get('status')
  getStatus() { return this.socialchatService.getStatus(); }

  @Get('qr')
  getQr() { return this.socialchatService.getQr(); }

  @Post('connect')
  connect() { return this.socialchatService.connect(); }

  @Post('disconnect')
  disconnect() { return this.socialchatService.disconnect(); }

  @Get('chats')
  listChats() { return this.socialchatService.listChats(); }

  @Get('chats/:id/messages')
  getMessages(@Param('id', ParseIntPipe) id: number, @Query() q: any) {
    return this.socialchatService.getMessages(id, q);
  }

  @Post('send')
  kirim(@Body() dto: KirimPesanDto, @Req() req: any) {
    return this.socialchatService.kirim(dto, req.user?.id_user);
  }
}
