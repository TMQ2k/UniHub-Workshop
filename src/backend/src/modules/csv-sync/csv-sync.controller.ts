import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CsvSyncService } from './csv-sync.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';

@Controller('csv-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CsvSyncController {
  constructor(private readonly csvSyncService: CsvSyncService) {}

  @Post('trigger')
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerImport() {
    const data = await this.csvSyncService.triggerManualImport();
    return {
      success: true,
      data,
    };
  }

  @Get('logs')
  @Roles(UserRole.ORGANIZER)
  async getLogs() {
    const data = await this.csvSyncService.getLogs();
    return {
      success: true,
      data,
    };
  }

  @Get('logs/:id')
  @Roles(UserRole.ORGANIZER)
  async getLogById(@Param('id') id: string) {
    const data = await this.csvSyncService.getLogById(id);
    return {
      success: true,
      data,
    };
  }
}
