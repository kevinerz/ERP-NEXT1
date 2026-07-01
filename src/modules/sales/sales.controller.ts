import {
  Controller, Get, Post, Patch, Delete, Body,
  Param, Query, ParseIntPipe,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';
import { CreateOpportunityDto, UpdateOpportunityDto } from './dto/opportunity.dto';
import { CreateQuotationDto, UpdateQuotationDto, ApproveQuotationDto } from './dto/quotation.dto';
import { CreateActivityDto, UpdateActivityDto } from './dto/activity.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // Pipeline
  @Get('pipeline') getPipeline() { return this.salesService.getPipeline(); }
  @Get('sales-list') getSalesList() { return this.salesService.getSalesList(); }

  // Lead
  @Get('lead') findAllLead(@Query() q: any) { return this.salesService.findAllLead(q); }
  @Get('lead/:id') findOneLead(@Param('id', ParseIntPipe) id: number) { return this.salesService.findOneLead(id); }
  @Post('lead') createLead(@Body() dto: CreateLeadDto) { return this.salesService.createLead(dto); }
  @Patch('lead/:id') updateLead(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeadDto) {
    return this.salesService.updateLead(id, dto);
  }

  // Opportunity
  @Get('opportunity') findAllOpportunity(@Query() q: any) { return this.salesService.findAllOpportunity(q); }
  @Get('opportunity/:id') findOneOpportunity(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findOneOpportunity(id);
  }
  @Post('opportunity') createOpportunity(@Body() dto: CreateOpportunityDto) {
    return this.salesService.createOpportunity(dto);
  }
  @Patch('opportunity/:id') updateOpportunity(
    @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOpportunityDto,
  ) { return this.salesService.updateOpportunity(id, dto); }

  // Quotation
  @Get('quotation') findAllQuotation(@Query() q: any) { return this.salesService.findAllQuotation(q); }
  @Get('quotation/:id') findOneQuotation(@Param('id', ParseIntPipe) id: number) { return this.salesService.findOneQuotation(id); }
  @Post('quotation') createQuotation(@Body() dto: CreateQuotationDto) {
    return this.salesService.createQuotation(dto);
  }
  @Patch('quotation/:id') updateQuotation(
    @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuotationDto,
  ) { return this.salesService.updateQuotation(id, dto); }
  @Patch('quotation/:id/approve') approveQuotation(
    @Param('id', ParseIntPipe) id: number, @Body() dto: ApproveQuotationDto,
  ) { return this.salesService.approveQuotation(id, dto); }

  // Activity
  @Post('activity') createActivity(@Body() dto: CreateActivityDto) {
    return this.salesService.createActivity(dto);
  }
  @Patch('activity/:id') updateActivity(
    @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateActivityDto,
  ) { return this.salesService.updateActivity(id, dto); }
  @Delete('activity/:id') removeActivity(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.removeActivity(id);
  }

  @Delete('lead/:id')
  removeLead(@Param('id', ParseIntPipe) id: number) { return this.salesService.removeLead(id); }

  @Delete('opportunity/:id')
  removeOpportunity(@Param('id', ParseIntPipe) id: number) { return this.salesService.removeOpportunity(id); }

  @Delete('quotation/:id')
  removeQuotation(@Param('id', ParseIntPipe) id: number) { return this.salesService.removeQuotation(id); }
}
