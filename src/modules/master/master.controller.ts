import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
} from '@nestjs/common';
import { MasterService } from './master.service';
import { CreateLayananDto, UpdateLayananDto } from './dto/layanan.dto';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';
import { CreatePelangganDto, UpdatePelangganDto } from './dto/pelanggan.dto';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import {
  CreateSumberInternetDto, UpdateSumberInternetDto,
  CreatePerangkatDto, UpdatePerangkatDto,
  CreatePicDto, UpdatePicDto,
} from './dto/site-detail.dto';

@Controller('master')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  // ─── LAYANAN ────────────────────────────────────────────────

  @Get('layanan')
  findAllLayanan(@Query() query: { search?: string; is_aktif?: string }) {
    return this.masterService.findAllLayanan(query);
  }

  @Get('layanan/:id')
  findOneLayanan(@Param('id', ParseIntPipe) id: number) {
    return this.masterService.findOneLayanan(id);
  }

  @Post('layanan')
  createLayanan(@Body() dto: CreateLayananDto) {
    return this.masterService.createLayanan(dto);
  }

  @Patch('layanan/:id')
  updateLayanan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLayananDto,
  ) {
    return this.masterService.updateLayanan(id, dto);
  }

  @Patch('layanan/:id/toggle')
  toggleLayanan(@Param('id', ParseIntPipe) id: number) {
    return this.masterService.toggleLayanan(id);
  }

  // ─── VENDOR ISP ─────────────────────────────────────────────

  @Get('vendor')
  findAllVendor(
    @Query()
    query: {
      search?: string;
      tipe_vendor?: string;
      is_aktif?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.masterService.findAllVendor(query);
  }

  @Get('vendor/tipe-list')
  getTipeVendorList() {
    return this.masterService.getTipeVendorList();
  }

  @Get('vendor/:id')
  findOneVendor(@Param('id', ParseIntPipe) id: number) {
    return this.masterService.findOneVendor(id);
  }

  @Post('vendor')
  createVendor(@Body() dto: CreateVendorDto) {
    return this.masterService.createVendor(dto);
  }

  @Patch('vendor/:id')
  updateVendor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.masterService.updateVendor(id, dto);
  }

  @Patch('vendor/:id/toggle')
  toggleVendor(@Param('id', ParseIntPipe) id: number) {
    return this.masterService.toggleVendor(id);
  }

  // ─── PELANGGAN ──────────────────────────────────────────────

  @Get('pelanggan')
  findAllPelanggan(@Query() q: { search?: string; page?: number; limit?: number }) {
    return this.masterService.findAllPelanggan(q);
  }

  @Get('pelanggan/dropdown')
  getPelangganDropdown() {
    return this.masterService.getPelangganDropdown();
  }

  @Post('pelanggan')
  createPelanggan(@Body() dto: CreatePelangganDto) {
    return this.masterService.createPelanggan(dto);
  }

  @Patch('pelanggan/:id')
  updatePelanggan(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePelangganDto) {
    return this.masterService.updatePelanggan(id, dto);
  }

  @Delete('pelanggan/:id')
  removePelanggan(@Param('id', ParseIntPipe) id: number) { return this.masterService.removePelanggan(id); }

  // ─── VENDOR DROPDOWN ─────────────────────────────────────────

  @Get('vendor-dropdown')
  getVendorDropdown() { return this.masterService.getVendorDropdown(); }

  // ─── SITE PELANGGAN ─────────────────────────────────────────

  @Get('site')
  findAllSite(@Query() q: any) { return this.masterService.findAllSite(q); }

  @Get('site/:id')
  findOneSite(@Param('id', ParseIntPipe) id: number) { return this.masterService.findOneSite(id); }

  @Post('site')
  createSite(@Body() dto: CreateSiteDto) { return this.masterService.createSite(dto); }

  @Patch('site/:id')
  updateSite(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSiteDto) {
    return this.masterService.updateSite(id, dto);
  }

  @Delete('site/:id')
  removeSite(@Param('id', ParseIntPipe) id: number) { return this.masterService.removeSite(id); }

  // ─── SUMBER INTERNET ─────────────────────────────────────────

  @Get('sumber-internet')
  findAllSumber(@Query() query: { id_site?: string; unlinked_only?: string }) {
    return this.masterService.findAllSumberInternet(query);
  }

  @Post('sumber-internet')
  createSumber(@Body() dto: CreateSumberInternetDto) { return this.masterService.createSumberInternet(dto); }

  @Patch('sumber-internet/:id')
  updateSumber(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSumberInternetDto) {
    return this.masterService.updateSumberInternet(id, dto);
  }

  @Delete('sumber-internet/:id')
  deleteSumber(@Param('id', ParseIntPipe) id: number) { return this.masterService.deleteSumberInternet(id); }

  // ─── PERANGKAT SITE ──────────────────────────────────────────

  @Post('perangkat')
  createPerangkat(@Body() dto: CreatePerangkatDto) { return this.masterService.createPerangkat(dto); }

  @Patch('perangkat/:id')
  updatePerangkat(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePerangkatDto) {
    return this.masterService.updatePerangkat(id, dto);
  }

  @Delete('perangkat/:id')
  deletePerangkat(@Param('id', ParseIntPipe) id: number) { return this.masterService.deletePerangkat(id); }

  // ─── PIC SITE ────────────────────────────────────────────────

  @Post('pic')
  createPic(@Body() dto: CreatePicDto) { return this.masterService.createPic(dto); }

  @Patch('pic/:id')
  updatePic(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePicDto) {
    return this.masterService.updatePic(id, dto);
  }

  @Delete('pic/:id')
  deletePic(@Param('id', ParseIntPipe) id: number) { return this.masterService.deletePic(id); }
}
