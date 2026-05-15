import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity.js';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity.js';
import { Workshop } from '../workshop/entities/workshop.entity.js';
import { User } from '../auth/entities/user.entity.js';
import type { IPaymentProvider, PaymentMetadata } from './interfaces/index.js';
import { PAYMENT_PROVIDER } from './interfaces/index.js';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';
import { RegistrationService } from '../registration/registration.service.js';
import { NotificationService } from '../notification/notification.service.js';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly circuitBreaker = new CircuitBreaker();

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Registration)
    private readonly registrationRepo: Repository<Registration>,
    @InjectRepository(Workshop)
    private readonly workshopRepo: Repository<Workshop>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
    private readonly registrationService: RegistrationService,
    private readonly notificationService: NotificationService,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Process Payment — Circuit Breaker + Provider call
  // ──────────────────────────────────────────────────────────

  async processPayment(
    registrationId: string,
    idempotencyKey: string,
    studentId: string,
    studentEmail: string,
  ) {
    // Step 1: Validate registration state
    const registration = await this.registrationRepo.findOne({
      where: { id: registrationId, studentId },
    });

    if (!registration) {
      throw new NotFoundException({
        success: false,
        error: { code: 'REGISTRATION_NOT_FOUND', message: 'Đăng ký không tồn tại.' },
      });
    }

    if (registration.status !== RegistrationStatus.PENDING_PAYMENT) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_PAYMENT_STATE', message: 'Đăng ký không ở trạng thái chờ thanh toán.' },
      });
    }

    // Step 2: Check seat hold expiry
    if (registration.seatHoldExpiresAt && new Date() > registration.seatHoldExpiresAt) {
      throw new BadRequestException({
        success: false,
        error: { code: 'SEAT_HOLD_EXPIRED', message: 'Thời gian giữ chỗ đã hết. Vui lòng đăng ký lại.' },
      });
    }

    // Step 3: Get workshop info for payment metadata
    const workshop = await this.workshopRepo.findOne({
      where: { id: registration.workshopId },
    });

    if (!workshop) {
      throw new NotFoundException({
        success: false,
        error: { code: 'WORKSHOP_NOT_FOUND', message: 'Workshop không tồn tại.' },
      });
    }

    // Step 4: Create payment record (PROCESSING)
    const payment = this.paymentRepo.create({
      registrationId,
      amount: workshop.price,
      currency: 'VND',
      status: PaymentStatus.PROCESSING,
      idempotencyKey,
    });
    const savedPayment = await this.paymentRepo.save(payment);

    // Step 5: Call payment provider through Circuit Breaker
    const metadata: PaymentMetadata = {
      registrationId,
      studentId,
      workshopId: workshop.id,
      workshopTitle: workshop.title,
    };

    try {
      const result = await this.circuitBreaker.execute(async () => {
        return this.paymentProvider.processPayment(workshop.price, metadata);
      });

      if (!result.success) {
        savedPayment.status = PaymentStatus.FAILED;
        await this.paymentRepo.save(savedPayment);
        throw new HttpException(
          {
            success: false,
            error: { code: 'PAYMENT_FAILED', message: 'Thanh toán thất bại.' },
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      // Step 6: Payment succeeded — update records
      savedPayment.status = PaymentStatus.COMPLETED;
      savedPayment.transactionId = result.transactionId;
      savedPayment.paidAt = new Date();
      await this.paymentRepo.save(savedPayment);

      // Step 7: Confirm registration (generates QR code)
      const confirmedRegistration = await this.registrationService.confirmPayment(registrationId);

      // Step 8: Enqueue notification with QR code (async, non-blocking)
      // Look up student email from DB (JWT doesn't carry email)
      const resolvedEmail = studentEmail || (await this.userRepo.findOne({ where: { id: studentId } }))?.email || '';
      this.notificationService
        .send(
          studentId,
          resolvedEmail,
          'PAYMENT_CONFIRMED',
          `✅ Thanh toán thành công: ${workshop.title}`,
          `Bạn đã thanh toán thành công workshop "${workshop.title}".\n\nVui lòng mang mã QR bên dưới đến workshop để nhân viên quét xác nhận tham gia.`,
          {
            registrationId,
            paymentId: savedPayment.id,
            workshopTitle: workshop.title,
            qrCode: confirmedRegistration.qrCode, // Email channel embeds QR image
          },
        )
        .catch(() => {});

      this.logger.log(
        `Payment completed: id=${savedPayment.id}, txn=${result.transactionId}, registration=${registrationId}`,
      );

      return {
        id: savedPayment.id,
        registrationId,
        amount: savedPayment.amount,
        currency: savedPayment.currency,
        status: savedPayment.status,
        transactionId: savedPayment.transactionId,
        paidAt: savedPayment.paidAt?.toISOString(),
        qrCode: confirmedRegistration.qrCode,
      };
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        // CB is OPEN — clean up the PROCESSING payment
        savedPayment.status = PaymentStatus.FAILED;
        await this.paymentRepo.save(savedPayment);

        throw new HttpException(
          {
            success: false,
            error: {
              code: 'PAYMENT_UNAVAILABLE',
              message: 'Hệ thống thanh toán tạm thời không khả dụng. Vui lòng thử lại sau.',
            },
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // Re-throw known HTTP exceptions
      if (error instanceof HttpException) {
        throw error;
      }

      // Unknown error
      savedPayment.status = PaymentStatus.FAILED;
      await this.paymentRepo.save(savedPayment);

      this.logger.error(
        `Payment failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        {
          success: false,
          error: { code: 'PAYMENT_TIMEOUT', message: 'Cổng thanh toán không phản hồi.' },
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
  }

  // ──────────────────────────────────────────────────────────
  // Get payment by registration (STUDENT)
  // ──────────────────────────────────────────────────────────

  async getPaymentByRegistration(registrationId: string) {
    const payment = await this.paymentRepo.findOne({
      where: { registrationId },
      order: { createdAt: 'DESC' },
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        error: { code: 'PAYMENT_NOT_FOUND', message: 'Thanh toán không tồn tại.' },
      });
    }

    return {
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transactionId,
      paidAt: payment.paidAt?.toISOString(),
    };
  }

  // ──────────────────────────────────────────────────────────
  // Payment stats (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  async getPaymentStats() {
    const payments = await this.paymentRepo.find();

    const totalRevenue = payments
      .filter((p) => p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0);

    const completedPayments = payments.filter((p) => p.status === PaymentStatus.COMPLETED).length;

    return {
      totalRevenue,
      totalTransactions: payments.length,
      completedPayments,
    };
  }

  /** Expose circuit breaker for testing */
  _getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }
}
