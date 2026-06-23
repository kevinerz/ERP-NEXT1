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
}
