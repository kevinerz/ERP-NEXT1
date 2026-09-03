import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseInterceptors, UploadedFile, Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { InstalasiService } from './instalasi.service';
import {
  CreateInstalasiDto,
  UpdateInstalasiDto,
  AddInstalasiLogDto,
  SaveBASTDto,
  VendorLoginDto,
} from './dto/instalasi.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('instalasi')
export class InstalasiController {
  constructor(private readonly instalasiService: InstalasiService) {}

  // POST /api/instalasi/vendor-login — login vendor dengan username + PIN
  @SkipThrottle()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @Post('vendor-login')
  vendorLogin(@Body() dto: VendorLoginDto) {
    return this.instalasiService.vendorLogin(dto);
  }

  // GET /api/instalasi — list semua order (admin/internal)
  @Get()
  findAll(@Query() q: any) {
    return this.instalasiService.findAll(q);
  }

  // GET /api/instalasi/vendor/tugas — tugas milik vendor yang login
  @Get('vendor/tugas')
  getMyTasks(@Req() req: any) {
    // id_kontak dari JWT vendor (type: vendor_teknisi)
    const idKontak = req.user?.id_kontak ?? req.user?.sub;
    return this.instalasiService.findByVendor(Number(idKontak));
  }

  // GET /api/instalasi/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.instalasiService.findOne(id);
  }

  // POST /api/instalasi
  @Post()
  create(@Body() dto: CreateInstalasiDto) {
    return this.instalasiService.create(dto);
  }

  // PATCH /api/instalasi/:id
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInstalasiDto) {
    return this.instalasiService.update(id, dto);
  }

  // POST /api/instalasi/log
  @Post('log')
  addLog(@Body() dto: AddInstalasiLogDto) {
    return this.instalasiService.addLog(dto);
  }

  // POST /api/instalasi/:id/bast
  @Post(':id/bast')
  saveBAST(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveBASTDto) {
    return this.instalasiService.saveBAST(id, dto);
  }

  // POST /api/instalasi/:id/foto
  @Post(':id/foto')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  addPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { buffer: Buffer; mimetype: string },
    @Body('stage') stage: string,
    @Body('caption') caption?: string,
  ) {
    return this.instalasiService.addPhoto(id, file, stage, caption);
  }

  // DELETE /api/instalasi/foto/:id_foto
  @Delete('foto/:id_foto')
  deletePhoto(@Param('id_foto', ParseIntPipe) id_foto: number) {
    return this.instalasiService.deletePhoto(id_foto);
  }

  // PATCH /api/instalasi/vendor/:id/set-pin — set PIN login vendor (Admin)
  @Roles('Admin')
  @Patch('vendor/:id/set-pin')
  setVendorPin(
    @Param('id', ParseIntPipe) id: number,
    @Body('pin') pin: string,
  ) {
    return this.instalasiService.setVendorPin(id, pin);
  }

  // DELETE /api/instalasi/:id
  @Roles('Admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.instalasiService.remove(id);
  }
}
