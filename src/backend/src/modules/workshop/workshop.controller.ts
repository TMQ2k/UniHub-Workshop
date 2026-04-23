import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { WorkshopService } from './workshop.service.js';
import { CreateWorkshopDto, UpdateWorkshopDto, QueryWorkshopDto } from './dto/index.js';
import { JwtAuthGuard, RolesGuard, RateLimitGuard } from '../../common/guards/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';

const RATE_LIMIT_GET_WORKSHOPS = { maxTokens: 100, windowSeconds: 60 };

@Controller('workshops')
export class WorkshopController {
  constructor(private readonly workshopService: WorkshopService) {}

  // ──────────────────────────────────────────────────────────
  // POST /workshops — Create workshop (ORGANIZER only)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateWorkshopDto,
    @Request() req: { user: { userId: string } },
  ) {
    const data = await this.workshopService.create(dto, req.user.userId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /workshops — List workshops (ALL, rate-limited)
  // ──────────────────────────────────────────────────────────

  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_GET_WORKSHOPS)
  @Get()
  async findAll(@Query() query: QueryWorkshopDto) {
    const result = await this.workshopService.findAll(query);
    return {
      success: true,
      data: result.data,
      meta: {
        ...result.meta,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /workshops/:id — Get workshop detail (ALL)
  // ──────────────────────────────────────────────────────────

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.workshopService.findOne(id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // PATCH /workshops/:id — Update workshop (ORGANIZER only)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkshopDto,
  ) {
    const data = await this.workshopService.update(id, dto);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // PATCH /workshops/:id/publish — Publish workshop (ORGANIZER only)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Patch(':id/publish')
  async publish(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.workshopService.publish(id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // DELETE /workshops/:id — Cancel workshop (ORGANIZER only)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Delete(':id')
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.workshopService.cancel(id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
