import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CheckinService } from './checkin.service.js';
import { BatchSyncCheckInDto } from './dto/index.js';
import { JwtAuthGuard, RolesGuard } from '../../common/guards/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';

@Controller('checkins')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  // ──────────────────────────────────────────────────────────
  // POST /checkins/sync — Offline batch sync (CHECKIN_STAFF)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CHECKIN_STAFF)
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncOfflineCheckins(
    @Body() dto: BatchSyncCheckInDto,
    @Request() req: { user: { userId: string } },
  ) {
    const result = await this.checkinService.syncOfflineCheckins(
      dto.checkins,
      req.user.userId,
    );

    return {
      success: true,
      data: {
        synced: result.synced,
        failed: result.failed,
        results: result.results,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /checkins?workshopId=uuid — Check-in list (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Get()
  async getWorkshopCheckins(
    @Query('workshopId', ParseUUIDPipe) workshopId: string,
  ) {
    const result = await this.checkinService.getWorkshopCheckins(workshopId);
    return {
      success: true,
      data: result.data,
      meta: { ...result.meta, timestamp: new Date().toISOString() },
    };
  }
}
