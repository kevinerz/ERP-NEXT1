import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res,
  ParseIntPipe, UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { EmailService } from './email.service';
import { ConnectEmailDto, SendEmailDto } from './dto/email.dto';

@Controller('email')
export class EmailController {
  constructor(private readonly svc: EmailService) {}

  // ─── AKUN (self-service, selalu punya sendiri) ──────────────────

  @Get('account')
  getAccount(@Req() req: any) { return this.svc.getAccount(req.user.id_user); }

  @Post('account')
  connectAccount(@Body() dto: ConnectEmailDto, @Req() req: any) {
    return this.svc.connectAccount(req.user.id_user, dto);
  }

  @Delete('account')
  disconnectAccount(@Req() req: any) { return this.svc.disconnectAccount(req.user.id_user); }

  // ─── INBOX ────────────────────────────────────────────────────

  @Get('inbox')
  listInbox(@Query() q: any, @Req() req: any) { return this.svc.listInbox(req.user.id_user, q); }

  @Get('inbox/:uid')
  getMessage(@Param('uid', ParseIntPipe) uid: number, @Req() req: any) {
    return this.svc.getMessage(req.user.id_user, uid);
  }

  @Get('inbox/:uid/attachment/:partId')
  async getAttachment(
    @Param('uid', ParseIntPipe) uid: number,
    @Param('partId', ParseIntPipe) partId: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const att = await this.svc.getAttachment(req.user.id_user, uid, partId);
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.filename)}"`);
    res.send(att.content);
  }

  @Patch('inbox/:uid/read')
  setSeen(@Param('uid', ParseIntPipe) uid: number, @Body('seen') seen: boolean, @Req() req: any) {
    return this.svc.setSeen(req.user.id_user, uid, seen !== false);
  }

  @Delete('inbox/:uid')
  deleteMessage(@Param('uid', ParseIntPipe) uid: number, @Req() req: any) {
    return this.svc.deleteMessage(req.user.id_user, uid);
  }

  // ─── KIRIM ────────────────────────────────────────────────────

  @Post('send')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 15 * 1024 * 1024 } }))
  sendMail(@Body() dto: SendEmailDto, @UploadedFiles() files: any[], @Req() req: any) {
    return this.svc.sendMail(req.user.id_user, dto, files);
  }
}
