import {
  Controller, Get, Patch, Param, Query, Req, ParseIntPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifService: NotificationsService) {}

  @Get()
  findAll(@Req() req: any, @Query('page') page?: string) {
    return this.notifService.findForUser(req.user.id_user, Number(page) || 1);
  }

  @Get('unread-count')
  countUnread(@Req() req: any) {
    return this.notifService.countUnread(req.user.id_user);
  }

  @Patch('read-all')
  markAllRead(@Req() req: any) {
    return this.notifService.markAllRead(req.user.id_user);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.notifService.markRead(id, req.user.id_user);
  }
}
