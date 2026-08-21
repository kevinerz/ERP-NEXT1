import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { CrmService } from './crm.service';
import { UpsertPicDto, ImportPicDto } from './dto/crm.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('pic')
  listPic(@Query() query: any) { return this.crm.listPic(query); }

  @Get('pic/stats')
  getStats() { return this.crm.getStats(); }

  @Get('pic/:id')
  getPic(@Param('id', ParseIntPipe) id: number) { return this.crm.getPic(id); }

  @Post('pic')
  upsertPic(@Body() dto: UpsertPicDto) { return this.crm.upsertPic(dto); }

  @Put('pic/:id')
  updatePic(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertPicDto) {
    return this.crm.upsertPic({ ...dto, id_pic: id });
  }

  @Delete('pic/:id')
  @Roles('Admin', 'Manager_Ops', 'Director')
  deletePic(@Param('id', ParseIntPipe) id: number) { return this.crm.deletePic(id); }

  @Post('pic/import')
  importPic(@Body() dto: ImportPicDto) { return this.crm.importPic(dto.rows); }
}
