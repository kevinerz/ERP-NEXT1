import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res,
  ParseIntPipe, UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { EmailService } from './email.service';
import { ConnectEmailDto, SendEmailDto, SaveDraftDto } from './dto/email.dto';

const ATTACHMENT_LIMITS = { limits: { fileSize: 15 * 1024 * 1024 } };

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

  // ─── FOLDER ───────────────────────────────────────────────────

  @Get('folders')
  listFolders(@Req() req: any) { return this.svc.listFolders(req.user.id_user); }

  // ─── PESAN (Kotak Masuk / Terkirim / Draf / Sampah / Spam) ────

  @Get('messages')
  listMessages(@Query() q: any, @Req() req: any) { return this.svc.listMessages(req.user.id_user, q.folder, q); }

  @Get('messages/:uid')
  getMessage(@Param('uid', ParseIntPipe) uid: number, @Query('folder') folder: string, @Req() req: any) {
    return this.svc.getMessage(req.user.id_user, folder, uid);
  }

  @Get('messages/:uid/attachment/:partId')
  async getAttachment(
    @Param('uid', ParseIntPipe) uid: number,
    @Param('partId', ParseIntPipe) partId: number,
    @Query('folder') folder: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const att = await this.svc.getAttachment(req.user.id_user, folder, uid, partId);
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.filename)}"`);
    res.send(att.content);
  }

  @Patch('messages/:uid/read')
  setSeen(@Param('uid', ParseIntPipe) uid: number, @Query('folder') folder: string, @Body('seen') seen: boolean, @Req() req: any) {
    return this.svc.setSeen(req.user.id_user, folder, uid, seen !== false);
  }

  @Delete('messages/:uid')
  deleteMessage(@Param('uid', ParseIntPipe) uid: number, @Query('folder') folder: string, @Req() req: any) {
    return this.svc.deleteMessage(req.user.id_user, folder, uid);
  }

  // ─── KIRIM ────────────────────────────────────────────────────

  @Post('send')
  @UseInterceptors(FilesInterceptor('files', 10, ATTACHMENT_LIMITS))
  sendMail(@Body() dto: SendEmailDto, @UploadedFiles() files: any[], @Req() req: any) {
    return this.svc.sendMail(req.user.id_user, dto, files);
  }

  // ─── DRAF ─────────────────────────────────────────────────────

  @Post('drafts')
  @UseInterceptors(FilesInterceptor('files', 10, ATTACHMENT_LIMITS))
  saveDraft(@Body() dto: SaveDraftDto, @UploadedFiles() files: any[], @Req() req: any) {
    return this.svc.saveDraft(req.user.id_user, dto, files);
  }

  @Delete('drafts/:uid')
  deleteDraft(@Param('uid', ParseIntPipe) uid: number, @Req() req: any) {
    return this.svc.deleteDraft(req.user.id_user, uid);
  }
}
