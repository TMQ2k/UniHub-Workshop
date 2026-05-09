import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('me')
  @Roles(UserRole.STUDENT)
  async getMyNotifications(@Request() req: { user: { userId: string } }) {
    const result = await this.notificationService.getMyNotifications(
      req.user.userId,
    );
    return {
      success: true,
      data: result.notifications,
      meta: { unreadCount: result.unreadCount },
    };
  }

  @Patch(':id/read')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    const data = await this.notificationService.markAsRead(id, req.user.userId);
    return {
      success: true,
      data,
    };
  }
}
