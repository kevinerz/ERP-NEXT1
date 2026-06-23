import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { MasterService } from './master.service';
import { CreateLayananDto, UpdateLayananDto } from './dto/layanan.dto';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';
import { CreatePelangganDto, UpdatePelangganDto } from './dto/pelanggan.dto';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';

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

  // ─── SITE PELANGGAN ─────────────────────────────────────────

  @Get('site')
  findAllSite(@Query() q: { search?: string; id_pelanggan?: string; page?: number; limit?: number }) {
    return this.masterService.findAllSite(q);
  }

  @Post('site')
  createSite(@Body() dto: CreateSiteDto) {
    return this.masterService.createSite(dto);
  }

  @Patch('site/:id')
  updateSite(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSiteDto) {
    return this.masterService.updateSite(id, dto);
  }
}
