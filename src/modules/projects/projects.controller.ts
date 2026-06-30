import {
  Controller, Get, Post, Patch, Delete, Body,
  Param, Query, ParseIntPipe,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { CreateWoDto, UpdateWoDto } from './dto/wo.dto';
import { CreateBastDto, UpdateBastDto } from './dto/bast.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // Helpers
  @Get('pm-list')    getPmList()                              { return this.projectsService.getPmList(); }
  @Get('teknisi-list') getTeknisiList()                      { return this.projectsService.getTeknisiList(); }
  @Get('site-list')  getSiteList(@Query('search') s?: string){ return this.projectsService.getSiteList(s); }
  @Get('summary')    getSummary()                            { return this.projectsService.getStatusSummary(); }

  // Project
  @Get()    findAll(@Query() q: any)                         { return this.projectsService.findAll(q); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.projectsService.findOne(id); }
  @Post()   create(@Body() dto: CreateProjectDto)            { return this.projectsService.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  // Work Order
  @Get('wo/list') findAllWo(@Query() q: any)                 { return this.projectsService.findAllWo(q); }
  @Post('wo')     createWo(@Body() dto: CreateWoDto)         { return this.projectsService.createWo(dto); }
  @Patch('wo/:id') updateWo(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWoDto) {
    return this.projectsService.updateWo(id, dto);
  }

  // BAST
  @Post('bast')     createBast(@Body() dto: CreateBastDto)   { return this.projectsService.createBast(dto); }
  @Patch('bast/:id') updateBast(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBastDto) {
    return this.projectsService.updateBast(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.projectsService.remove(id); }
}
