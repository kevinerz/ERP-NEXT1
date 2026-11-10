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

  // Hubungkan mailbox lewat Hostinger Mail API (tanpa password) — dibatasi di service
  @Get('api-mailboxes')
  apiMailboxes(@Req() req: any) { return this.svc.apiMailboxes(req.user.id_user); }

  @Post('account/api')
  connectApi(@Body() body: { email_address: string }, @Req() req: any) {
    return this.svc.connectApi(req.user.id_user, String(body?.email_address || ''));
  }

  @Delete('account')
  disconnectAccount(@Req() req: any) { return this.svc.disconnectAccount(req.user.id_user); }

  // ─── FOLDER ───────────────────────────────────────────────────

  @Get('folders')
  listFolders(@Req() req: any) { return this.svc.listFolders(req.user.id_user); }

  // Daftar kontak (karyawan) untuk dropdown penerima
  @Get('contacts')
  listContacts() { return this.svc.listContacts(); }

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

  @Patch('messages/:uid/flag')
  setFlagged(@Param('uid', ParseIntPipe) uid: number, @Query('folder') folder: string, @Body('flagged') flagged: boolean, @Req() req: any) {
    return this.svc.setFlagged(req.user.id_user, folder, uid, flagged !== false);
  }

  @Post('messages/bulk')
  massal(@Body() body: { folder?: string; uids?: number[]; aksi?: string }, @Req() req: any) {
    return this.svc.massal(req.user.id_user, body);
  }

  @Get('quota')
  quota(@Req() req: any) { return this.svc.quota(req.user.id_user); }

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
