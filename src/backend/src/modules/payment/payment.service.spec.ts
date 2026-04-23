import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { Payment, PaymentStatus } from './entities/payment.entity.js';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity.js';
import { Workshop, WorkshopStatus } from '../workshop/entities/workshop.entity.js';
import { PAYMENT_PROVIDER, IPaymentProvider } from './interfaces/index.js';
import { RegistrationService } from '../registration/registration.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { CircuitBreakerState } from './circuit-breaker.js';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepo: jest.Mocked<Repository<Payment>>;
  let registrationRepo: jest.Mocked<Repository<Registration>>;
  let workshopRepo: jest.Mocked<Repository<Workshop>>;
  let paymentProvider: jest.Mocked<IPaymentProvider>;
  let registrationService: jest.Mocked<RegistrationService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockWorkshop: Workshop = {
    id: 'workshop-1',
    title: 'Paid Workshop',
    description: 'Desc',
    speaker: 'Speaker',
    room: 'A.101',
    roomMapUrl: null,
    startTime: new Date('2027-06-01T09:00:00Z'),
    endTime: new Date('2027-06-01T11:00:00Z'),
    maxSeats: 60,
    availableSeats: 10,
    price: 50000,
    status: WorkshopStatus.PUBLISHED,
    createdBy: 'user-1',
    creator: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRegistration: Registration = {
    id: 'reg-1',
    workshopId: 'workshop-1',
    studentId: 'student-1',
    status: RegistrationStatus.PENDING_PAYMENT,
    qrCode: null,
    seatHoldExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min from now
    workshop: mockWorkshop,
    student: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPayment: Payment = {
    id: 'payment-1',
    registrationId: 'reg-1',
    amount: 50000,
    currency: 'VND',
    status: PaymentStatus.PROCESSING,
    transactionId: null,
    idempotencyKey: 'idem-key-1',
    paidAt: null,
    registration: mockRegistration,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            create: jest.fn().mockImplementation((data) => ({ ...mockPayment, ...data })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...mockPayment, ...entity })),
            findOne: jest.fn().mockResolvedValue(mockPayment),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(Registration),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ ...mockRegistration }),
          },
        },
        {
          provide: getRepositoryToken(Workshop),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ ...mockWorkshop }),
          },
        },
        {
          provide: PAYMENT_PROVIDER,
          useValue: {
            processPayment: jest.fn().mockResolvedValue({
              success: true,
              transactionId: 'txn_123',
            }),
            refund: jest.fn().mockResolvedValue({ success: true, refundId: 'ref_1' }),
            getStatus: jest.fn().mockResolvedValue({ transactionId: 'txn_123', status: 'COMPLETED' }),
          },
        },
        {
          provide: RegistrationService,
          useValue: {
            confirmPayment: jest.fn().mockResolvedValue({
              ...mockRegistration,
              status: RegistrationStatus.CONFIRMED,
              qrCode: 'generated-qr',
            }),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            send: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepo = module.get(getRepositoryToken(Payment));
    registrationRepo = module.get(getRepositoryToken(Registration));
    workshopRepo = module.get(getRepositoryToken(Workshop));
    paymentProvider = module.get(PAYMENT_PROVIDER);
    registrationService = module.get(RegistrationService);
    notificationService = module.get(NotificationService);
  });

  // ──────────────────────────────────────────────────────────
  // processPayment — normal flow
  // ──────────────────────────────────────────────────────────

  describe('processPayment', () => {
    it('should process payment successfully and confirm registration', async () => {
      const result = await service.processPayment(
        'reg-1', 'idem-key-1', 'student-1', 'test@test.com',
      );

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.transactionId).toBe('txn_123');
      expect(result.qrCode).toBe('generated-qr');

      // Verify provider was called
      expect(paymentProvider.processPayment).toHaveBeenCalledWith(
        50000,
        expect.objectContaining({ registrationId: 'reg-1' }),
      );

      // Verify registration was confirmed
      expect(registrationService.confirmPayment).toHaveBeenCalledWith('reg-1');
    });

    it('should throw INVALID_PAYMENT_STATE when registration is not PENDING_PAYMENT', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue({
        ...mockRegistration,
        status: RegistrationStatus.CONFIRMED,
      });

      await expect(
        service.processPayment('reg-1', 'idem-key-2', 'student-1', 'test@test.com'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.processPayment('reg-1', 'idem-key-2', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('INVALID_PAYMENT_STATE');
      }
    });

    it('should throw SEAT_HOLD_EXPIRED when hold time has passed', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue({
        ...mockRegistration,
        seatHoldExpiresAt: new Date(Date.now() - 1000), // Expired
      });

      await expect(
        service.processPayment('reg-1', 'idem-key-3', 'student-1', 'test@test.com'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.processPayment('reg-1', 'idem-key-3', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('SEAT_HOLD_EXPIRED');
      }
    });

    it('should throw REGISTRATION_NOT_FOUND for non-existent registration', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.processPayment('non-existent', 'idem-key-4', 'student-1', 'test@test.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Circuit Breaker integration
  // ──────────────────────────────────────────────────────────

  describe('Circuit Breaker', () => {
    it('should reject payment with 503 when Circuit Breaker is OPEN', async () => {
      // Trip the circuit breaker with 5 failures
      paymentProvider.processPayment = jest.fn().mockRejectedValue(new Error('gateway timeout'));

      for (let i = 0; i < 5; i++) {
        try {
          await service.processPayment('reg-1', `idem-${i}`, 'student-1', 'test@test.com');
        } catch { /* expected */ }
      }

      // Verify CB is now OPEN
      expect(service._getCircuitBreaker().getState()).toBe(CircuitBreakerState.OPEN);

      // Next request should fail with 503
      try {
        await service.processPayment('reg-1', 'idem-open', 'student-1', 'test@test.com');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(503);
        expect(e.getResponse().error.code).toBe('PAYMENT_UNAVAILABLE');
      }
    });

    it('should recover when Circuit Breaker transitions to HALF_OPEN and probe succeeds', async () => {
      // Trip the circuit breaker
      paymentProvider.processPayment = jest.fn().mockRejectedValue(new Error('timeout'));

      for (let i = 0; i < 5; i++) {
        try {
          await service.processPayment('reg-1', `idem-${i}`, 'student-1', 'test@test.com');
        } catch { /* expected */ }
      }

      expect(service._getCircuitBreaker().getState()).toBe(CircuitBreakerState.OPEN);

      // Simulate reset timeout passing
      service._getCircuitBreaker()._setLastOpenTimestamp(Date.now() - 61_000);
      expect(service._getCircuitBreaker().getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Now make the provider succeed for the probe
      paymentProvider.processPayment = jest.fn().mockResolvedValue({
        success: true,
        transactionId: 'txn_recovery',
      });

      const result = await service.processPayment(
        'reg-1', 'idem-recovery', 'student-1', 'test@test.com',
      );

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(service._getCircuitBreaker().getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return to OPEN when HALF_OPEN probe fails', async () => {
      // Trip the circuit breaker
      paymentProvider.processPayment = jest.fn().mockRejectedValue(new Error('timeout'));

      for (let i = 0; i < 5; i++) {
        try {
          await service.processPayment('reg-1', `idem-${i}`, 'student-1', 'test@test.com');
        } catch { /* expected */ }
      }

      // Simulate reset timeout
      service._getCircuitBreaker()._setLastOpenTimestamp(Date.now() - 61_000);
      expect(service._getCircuitBreaker().getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Probe fails
      paymentProvider.processPayment = jest.fn().mockRejectedValue(new Error('still broken'));

      try {
        await service.processPayment('reg-1', 'idem-probe-fail', 'student-1', 'test@test.com');
      } catch { /* expected */ }

      expect(service._getCircuitBreaker().getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Payment stats
  // ──────────────────────────────────────────────────────────

  describe('getPaymentStats', () => {
    it('should calculate revenue and counts correctly', async () => {
      paymentRepo.find = jest.fn().mockResolvedValue([
        { ...mockPayment, status: PaymentStatus.COMPLETED, amount: 50000 },
        { ...mockPayment, status: PaymentStatus.COMPLETED, amount: 100000 },
        { ...mockPayment, status: PaymentStatus.REFUNDED, amount: 50000 },
        { ...mockPayment, status: PaymentStatus.FAILED, amount: 50000 },
      ]);

      const stats = await service.getPaymentStats();

      expect(stats.totalRevenue).toBe(150000);
      expect(stats.totalTransactions).toBe(4);
      expect(stats.completedPayments).toBe(2);
      expect(stats.refundedPayments).toBe(1);
    });
  });
});
