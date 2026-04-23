import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { CreatePaymentDto } from './dto/index.js';
import { JwtAuthGuard, RolesGuard } from '../../common/guards/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { IdempotencyInterceptor } from '../../common/interceptors/index.js';
import { UserRole } from '../auth/entities/user.entity.js';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ──────────────────────────────────────────────────────────
  // POST /payments — Process payment (STUDENT + Idempotency)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @UseInterceptors(IdempotencyInterceptor)
  @Post()
  @HttpCode(HttpStatus.OK)
  async processPayment(
    @Body() dto: CreatePaymentDto,
    @Request() req: { user: { userId: string; email: string }; idempotencyKey: string },
  ) {
    const data = await this.paymentService.processPayment(
      dto.registrationId,
      req.idempotencyKey,
      req.user.userId,
      req.user.email,
    );

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /payments/stats — Payment stats (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @Get('stats')
  async getPaymentStats() {
    const data = await this.paymentService.getPaymentStats();
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ──────────────────────────────────────────────────────────
  // GET /payments/:registrationId — Payment detail (STUDENT)
  // ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Get(':registrationId')
  async getPayment(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    const data = await this.paymentService.getPaymentByRegistration(registrationId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
