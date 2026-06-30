import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, Req,
} from '@nestjs/common';
import { OperationsService } from './operations.service';
import { CreateTicketDto, UpdateTicketDto, AddLogDto } from './dto/ticket.dto';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('summary')     getSummary()                            { return this.operationsService.getStatusSummary(); }
  @Get('teknisi-list') getTeknisiList()                      { return this.operationsService.getTeknisiList(); }

  @Get()    findAll(@Query() q: any)                         { return this.operationsService.findAll(q); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.operationsService.findOne(id); }

  @Post()   create(@Body() dto: CreateTicketDto, @Req() req: any) {
    return this.operationsService.create(dto, req.user?.id_user);
  }

  @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketDto,
    @Req() req: any,
  ) {
    return this.operationsService.update(id, dto, req.user?.id_user);
  }

  @Post('log') addLog(@Body() dto: AddLogDto, @Req() req: any) {
    return this.operationsService.addLog(dto, req.user?.id_user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.operationsService.remove(id); }
}
