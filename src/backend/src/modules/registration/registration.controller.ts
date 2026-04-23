import {
  Controller,
  Post,
  Get,
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
import { RegistrationService } from './registration.service.js';
import { CreateRegistrationDto } from './dto/index.js';
import { JwtAuthGuard, RolesGuard, RateLimitGuard } from '../../common/guards/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { UserRole } from '../auth/entities/user.entity.js';

/** Rate limit: 10 requests per minute per IP for POST /registrations */
const RATE_LIMIT_POST_REGISTRATIONS = { maxTokens: 10, windowSeconds: 60 };

@Controller('registrations')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  // ──────────────────────────────────────────────────────────
  // POST /registrations — Reserve seat (STUDENT, rate-limited)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles(UserRole.STUDENT)
  @RateLimit(RATE_LIMIT_POST_REGISTRATIONS)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: CreateRegistrationDto,
    @Request() req: { user: { userId: string; email: string } },
  ) {
    const registration = await this.registrationService.reserveSeat(
      dto.workshopId,
      req.user.userId,
      req.user.email,
    );

    // Enqueue notification asynchronously for confirmed (free) registrations
    if (registration.status === 'CONFIRMED') {
      // Fire-and-forget — SRP: notification is async, not blocking the response
      this.registrationService
        .notifyRegistrationConfirmed(registration, req.user.email, '')
        .catch(() => {});
    }

    // Response shape differs for free vs paid
    if (registration.status === 'CONFIRMED') {
      return {
        success: true,
        data: {
          id: registration.id,
          workshopId: registration.workshopId,
          studentId: registration.studentId,
          status: registration.status,
          qrCode: registration.qrCode,
          createdAt: registration.createdAt.toISOString(),
        },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    // Paid workshop — PENDING_PAYMENT
    return {
      success: true,
      data: {
        id: registration.id,
        status: registration.status,
        paymentUrl: `/payments/initiate?registrationId=${registration.id}`,
        seatHoldExpiresAt: registration.seatHoldExpiresAt?.toISOString(),
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /registrations/me — My registrations (STUDENT)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Get('me')
  async getMyRegistrations(
    @Request() req: { user: { userId: string } },
  ) {
    const data = await this.registrationService.getMyRegistrations(req.user.userId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /registrations?workshopId=uuid — All registrations (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Get()
  async getWorkshopRegistrations(
    @Query('workshopId', ParseUUIDPipe) workshopId: string,
  ) {
    const result = await this.registrationService.getWorkshopRegistrations(workshopId);
    return {
      success: true,
      data: result.data,
      meta: { ...result.meta, timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // DELETE /registrations/:id — Cancel registration (STUDENT)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Delete(':id')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { userId: string } },
  ) {
    const data = await this.registrationService.cancelRegistration(id, req.user.userId);
    return {
      success: true,
      data: { id: data.id, status: data.status },
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
