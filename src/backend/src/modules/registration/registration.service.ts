import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Registration, RegistrationStatus } from './entities/registration.entity.js';
import { Workshop, WorkshopStatus } from '../workshop/entities/workshop.entity.js';
import { User } from '../auth/entities/user.entity.js';
import { NotificationService } from '../notification/notification.service.js';

/** Duration to hold a seat for paid workshops (in minutes) */
const SEAT_HOLD_MINUTES = 15;

/** Minimum hours before workshop start to allow cancellation */
const CANCELLATION_DEADLINE_HOURS = 2;

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(Registration)
    private readonly registrationRepo: Repository<Registration>,
    @InjectRepository(Workshop)
    private readonly workshopRepo: Repository<Workshop>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Reserve Seat — Pessimistic Lock + DB Transaction
  // ──────────────────────────────────────────────────────────

  async reserveSeat(
    workshopId: string,
    studentId: string,
    studentEmail: string,
  ) {
    // ── Pre-check: Verify student is synced from school data ──
    const student = await this.userRepo.findOne({ where: { id: studentId } });
    if (!student || !student.isSynced) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'STUDENT_NOT_VERIFIED',
          message: 'Tài khoản chưa được xác thực từ dữ liệu nhà trường. Vui lòng liên hệ phòng đào tạo.',
        },
      });
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Step 1: SELECT ... FOR UPDATE — Pessimistic Lock
        const workshop = await manager
          .createQueryBuilder(Workshop, 'w')
          .where('w.id = :id', { id: workshopId })
          .setLock('pessimistic_write')
          .getOne();

        if (!workshop) {
          throw new NotFoundException({
            success: false,
            error: { code: 'WORKSHOP_NOT_FOUND', message: 'Workshop không tồn tại.' },
          });
        }

        // Step 2: Validate workshop state
        if (workshop.status !== WorkshopStatus.PUBLISHED) {
          throw new BadRequestException({
            success: false,
            error: { code: 'WORKSHOP_NOT_AVAILABLE', message: 'Workshop chưa được mở đăng ký.' },
          });
        }

        if (new Date(workshop.startTime) <= new Date()) {
          throw new BadRequestException({
            success: false,
            error: { code: 'WORKSHOP_STARTED', message: 'Workshop đã bắt đầu.' },
          });
        }

        // Step 3: Check available seats
        if (workshop.availableSeats <= 0) {
          throw new ConflictException({
            success: false,
            error: { code: 'WORKSHOP_FULL', message: 'Workshop đã hết chỗ.' },
          });
        }

        // Step 4: Check duplicate registration
        const existingRegistration = await manager.findOne(Registration, {
          where: { workshopId, studentId },
        });

        if (existingRegistration && existingRegistration.status !== RegistrationStatus.CANCELLED) {
          throw new ConflictException({
            success: false,
            error: { code: 'ALREADY_REGISTERED', message: 'Bạn đã đăng ký workshop này.' },
          });
        }

        // Step 5: Check schedule conflict with other confirmed/pending registrations
        const conflictingRegistration = await manager
          .createQueryBuilder(Registration, 'r')
          .innerJoin(Workshop, 'ow', 'ow.id = r.workshop_id')
          .where('r.student_id = :studentId', { studentId })
          .andWhere('r.status != :cancelled', { cancelled: RegistrationStatus.CANCELLED })
          .andWhere('r.workshop_id != :workshopId', { workshopId })
          .andWhere('ow.start_time < :endTime', { endTime: workshop.endTime })
          .andWhere('ow.end_time > :startTime', { startTime: workshop.startTime })
          .getOne();

        if (conflictingRegistration) {
          throw new ConflictException({
            success: false,
            error: { code: 'SCHEDULE_CONFLICT', message: 'Workshop trùng lịch với workshop đã đăng ký.' },
          });
        }

        // Step 6: Decrement available seats
        workshop.availableSeats -= 1;
        await manager.save(Workshop, workshop);

        // Step 7: Create registration record
        const isFree = workshop.price === 0;
        const registration = manager.create(Registration, {
          workshopId,
          studentId,
          status: isFree ? RegistrationStatus.CONFIRMED : RegistrationStatus.PENDING_PAYMENT,
          qrCode: isFree ? this.generateQrCode(crypto.randomUUID(), studentId, workshopId) : null,
          seatHoldExpiresAt: isFree
            ? null
            : new Date(Date.now() + SEAT_HOLD_MINUTES * 60 * 1000),
        });

        const saved = await manager.save(Registration, registration);

        // Update QR code with actual registration ID for free workshops
        if (isFree) {
          saved.qrCode = this.generateQrCode(saved.id, studentId, workshopId);
          await manager.save(Registration, saved);
        }

        this.logger.log(
          `Seat reserved: workshop=${workshopId}, student=${studentId}, status=${saved.status}`,
        );

        return saved;
      });
    } catch (error) {
      // Re-throw known HTTP exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // Database lock timeout → retry once, then 503
      this.logger.error(
        `reserveSeat failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Hệ thống đang bận. Vui lòng thử lại sau.' },
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // Enqueue registration notification (called after transaction)
  // ──────────────────────────────────────────────────────────

  async notifyRegistrationConfirmed(
    registration: Registration,
    studentEmail: string,
    workshopTitle: string,
  ): Promise<void> {
    await this.notificationService.send(
      registration.studentId,
      studentEmail,
      'REGISTRATION_CONFIRMED',
      `✅ Đăng ký thành công: ${workshopTitle}`,
      `Chúc mừng! Bạn đã đăng ký thành công workshop "${workshopTitle}".\n\nVui lòng mang mã QR bên dưới đến workshop để nhân viên quét xác nhận tham gia.`,
      {
        registrationId: registration.id,
        workshopId: registration.workshopId,
        workshopTitle,
        qrCode: registration.qrCode, // Email channel uses this to generate QR image
      },
    );
  }

  /**
   * Fetch student email & workshop title, then send notification.
   * Used by the controller as fire-and-forget after registration.
   */
  async notifyRegistrationConfirmedById(registrationId: string): Promise<void> {
    const registration = await this.registrationRepo.findOne({
      where: { id: registrationId },
    });
    if (!registration) return;

    const [user, workshop] = await Promise.all([
      this.userRepo.findOne({ where: { id: registration.studentId } }),
      this.workshopRepo.findOne({ where: { id: registration.workshopId } }),
    ]);

    if (!user || !workshop) return;

    await this.notifyRegistrationConfirmed(
      registration,
      user.email,
      workshop.title,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Cancel registration (STUDENT)
  // ──────────────────────────────────────────────────────────

  async cancelRegistration(registrationId: string, studentId: string) {
    return await this.dataSource.transaction(async (manager) => {
      const registration = await manager.findOne(Registration, {
        where: { id: registrationId, studentId },
      });

      if (!registration) {
        throw new NotFoundException({
          success: false,
          error: { code: 'REGISTRATION_NOT_FOUND', message: 'Đăng ký không tồn tại.' },
        });
      }

      if (registration.status === RegistrationStatus.CANCELLED) {
        throw new BadRequestException({
          success: false,
          error: { code: 'ALREADY_CANCELLED', message: 'Đăng ký đã được hủy trước đó.' },
        });
      }

      // Check cancellation deadline: ≥ 2 hours before workshop start
      const workshop = await manager.findOne(Workshop, {
        where: { id: registration.workshopId },
      });

      if (workshop) {
        const deadlineMs = CANCELLATION_DEADLINE_HOURS * 60 * 60 * 1000;
        const deadline = new Date(workshop.startTime.getTime() - deadlineMs);

        if (new Date() > deadline) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'CANCELLATION_DEADLINE_PASSED',
              message: 'Không thể hủy đăng ký trong vòng 2 giờ trước khi workshop bắt đầu.',
            },
          });
        }

        // Restore seat
        workshop.availableSeats += 1;
        await manager.save(Workshop, workshop);
      }

      registration.status = RegistrationStatus.CANCELLED;
      registration.qrCode = null;
      const saved = await manager.save(Registration, registration);

      this.logger.log(`Registration ${registrationId} cancelled by student ${studentId}`);
      return saved;
    });
  }

  // ──────────────────────────────────────────────────────────
  // Get my registrations (STUDENT)
  // ──────────────────────────────────────────────────────────

  async getMyRegistrations(studentId: string) {
    const registrations = await this.registrationRepo.find({
      where: { studentId },
      relations: ['workshop'],
      order: { createdAt: 'DESC' },
    });

    return registrations.map((r) => ({
      id: r.id,
      workshopId: r.workshopId,
      workshopTitle: r.workshop?.title ?? '',
      status: r.status,
      qrCode: r.qrCode,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ──────────────────────────────────────────────────────────
  // Get workshop registrations (ORGANIZER)
  // ──────────────────────────────────────────────────────────

  async getWorkshopRegistrations(workshopId: string) {
    const registrations = await this.registrationRepo.find({
      where: { workshopId },
      relations: ['student'],
      order: { createdAt: 'ASC' },
    });

    const confirmed = registrations.filter((r) => r.status === RegistrationStatus.CONFIRMED).length;
    const pending = registrations.filter((r) => r.status === RegistrationStatus.PENDING_PAYMENT).length;
    const cancelled = registrations.filter((r) => r.status === RegistrationStatus.CANCELLED).length;

    return {
      data: registrations.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: r.student?.fullName ?? '',
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        total: registrations.length,
        confirmed,
        pending,
        cancelled,
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // Confirm payment callback (called by PaymentService)
  // ──────────────────────────────────────────────────────────

  async confirmPayment(registrationId: string): Promise<Registration> {
    const registration = await this.registrationRepo.findOne({
      where: { id: registrationId },
    });

    if (!registration) {
      throw new NotFoundException({
        success: false,
        error: { code: 'REGISTRATION_NOT_FOUND', message: 'Đăng ký không tồn tại.' },
      });
    }

    registration.status = RegistrationStatus.CONFIRMED;
    registration.qrCode = this.generateQrCode(
      registration.id,
      registration.studentId,
      registration.workshopId,
    );
    registration.seatHoldExpiresAt = null;

    return this.registrationRepo.save(registration);
  }

  // ──────────────────────────────────────────────────────────
  // Expire pending registrations (cron-callable)
  // ──────────────────────────────────────────────────────────

  async expirePendingRegistrations(): Promise<number> {
    const expiredRegistrations = await this.registrationRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: RegistrationStatus.PENDING_PAYMENT })
      .andWhere('r.seat_hold_expires_at <= :now', { now: new Date() })
      .getMany();

    let count = 0;
    for (const reg of expiredRegistrations) {
      await this.dataSource.transaction(async (manager) => {
        reg.status = RegistrationStatus.CANCELLED;
        await manager.save(Registration, reg);

        // Restore seat
        await manager
          .createQueryBuilder()
          .update(Workshop)
          .set({ availableSeats: () => 'available_seats + 1' })
          .where('id = :id', { id: reg.workshopId })
          .execute();
      });
      count++;
    }

    if (count > 0) {
      this.logger.log(`Expired ${count} pending registration(s)`);
    }
    return count;
  }

  // ──────────────────────────────────────────────────────────
  // QR Code generation — HMAC-SHA256 signed
  // ──────────────────────────────────────────────────────────

  generateQrCode(registrationId: string, studentId: string, workshopId: string): string {
    const payload = { registrationId, studentId, workshopId };
    const secret = this.configService.get<string>('QR_HMAC_SECRET', 'default_hmac_secret');
    const dataStr = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(dataStr)
      .digest('hex');

    const qrData = { ...payload, signature };
    return Buffer.from(JSON.stringify(qrData)).toString('base64');
  }
}
