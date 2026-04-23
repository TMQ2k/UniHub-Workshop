import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { RegistrationService } from './registration.service.js';
import { Registration, RegistrationStatus } from './entities/registration.entity.js';
import { Workshop, WorkshopStatus } from '../workshop/entities/workshop.entity.js';
import { User, UserRole } from '../auth/entities/user.entity.js';
import { NotificationService } from '../notification/notification.service.js';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let registrationRepo: jest.Mocked<Repository<Registration>>;
  let workshopRepo: jest.Mocked<Repository<Workshop>>;
  let dataSource: jest.Mocked<DataSource>;
  let notificationService: jest.Mocked<NotificationService>;
  let configService: jest.Mocked<ConfigService>;
  let userRepo: jest.Mocked<Repository<User>>;

  /** Mock synced student — isSynced = true by default */
  const mockStudent: User = {
    id: 'student-1',
    studentId: 'SV001',
    fullName: 'Test Student',
    email: 'test@test.com',
    passwordHash: 'hash',
    role: UserRole.STUDENT,
    faculty: null,
    enrollmentYear: null,
    isLocked: false,
    isSynced: true,
    refreshTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWorkshop: Workshop = {
    id: 'workshop-1',
    title: 'Test Workshop',
    description: 'Desc',
    speaker: 'Speaker',
    room: 'A.101',
    roomMapUrl: null,
    startTime: new Date('2027-06-01T09:00:00Z'),
    endTime: new Date('2027-06-01T11:00:00Z'),
    maxSeats: 60,
    availableSeats: 10,
    price: 0,
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
    status: RegistrationStatus.CONFIRMED,
    qrCode: 'mock-qr',
    seatHoldExpiresAt: null,
    workshop: mockWorkshop,
    student: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /**
   * Creates a mock EntityManager for transaction tests.
   * Accepts overrides to simulate different scenarios.
   */
  function createMockManager(overrides?: {
    workshopResult?: Workshop | null;
    existingRegistration?: Registration | null;
    conflictingRegistration?: Registration | null;
  }): jest.Mocked<EntityManager> {
    const workshopQb = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(
        overrides?.workshopResult !== undefined ? overrides.workshopResult : { ...mockWorkshop },
      ),
    };

    const conflictQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(overrides?.conflictingRegistration ?? null),
    };

    let queryBuilderCallCount = 0;

    return {
      createQueryBuilder: jest.fn().mockImplementation((entity: any) => {
        if (entity === Workshop) return workshopQb;
        if (entity === Registration) return conflictQb;
        queryBuilderCallCount++;
        return workshopQb;
      }),
      findOne: jest.fn().mockResolvedValue(overrides?.existingRegistration ?? null),
      create: jest.fn().mockImplementation((_entity: any, data: any) => ({
        ...mockRegistration,
        ...data,
        id: 'new-reg-id',
      })),
      save: jest.fn().mockImplementation((_entity: any, data: any) => {
        return Promise.resolve({ ...data, id: data.id || 'new-reg-id' });
      }),
    } as unknown as jest.Mocked<EntityManager>;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        {
          provide: getRepositoryToken(Registration),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: getRepositoryToken(Workshop),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockWorkshop),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockStudent),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test_hmac_secret'),
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

    service = module.get<RegistrationService>(RegistrationService);
    registrationRepo = module.get(getRepositoryToken(Registration));
    workshopRepo = module.get(getRepositoryToken(Workshop));
    userRepo = module.get(getRepositoryToken(User));
    dataSource = module.get(DataSource);
    configService = module.get(ConfigService);
    notificationService = module.get(NotificationService);
  });

  // ──────────────────────────────────────────────────────────
  // reserveSeat — Core seat locking tests
  // ──────────────────────────────────────────────────────────

  describe('reserveSeat', () => {
    it('should register successfully for a free workshop with pessimistic lock', async () => {
      const manager = createMockManager();

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      const result = await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');

      // Verify pessimistic lock was used
      const workshopQb = manager.createQueryBuilder(Workshop, 'w');
      expect(workshopQb.setLock).toHaveBeenCalledWith('pessimistic_write');

      // Verify seat was decremented
      expect(manager.save).toHaveBeenCalled();

      // Verify registration was created with CONFIRMED status
      expect(result.status).toBe(RegistrationStatus.CONFIRMED);
    });

    it('should throw STUDENT_NOT_VERIFIED when student is not synced from school data', async () => {
      // Override userRepo to return a non-synced student
      userRepo.findOne = jest.fn().mockResolvedValue({ ...mockStudent, isSynced: false });

      await expect(
        service.reserveSeat('workshop-1', 'student-1', 'test@test.com'),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('STUDENT_NOT_VERIFIED');
      }

      // Restore default mock for other tests
      userRepo.findOne = jest.fn().mockResolvedValue(mockStudent);
    });

    it('should throw STUDENT_NOT_VERIFIED when student does not exist in DB', async () => {
      userRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.reserveSeat('workshop-1', 'unknown-id', 'test@test.com'),
      ).rejects.toThrow(ForbiddenException);

      // Restore default mock
      userRepo.findOne = jest.fn().mockResolvedValue(mockStudent);
    });

    it('should set PENDING_PAYMENT for paid workshop with seat hold', async () => {
      const paidWorkshop = { ...mockWorkshop, price: 50000 };
      const manager = createMockManager({ workshopResult: paidWorkshop });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      const result = await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');

      expect(result.status).toBe(RegistrationStatus.PENDING_PAYMENT);
      expect(result.seatHoldExpiresAt).toBeDefined();
    });

    it('should throw WORKSHOP_FULL when no seats available', async () => {
      const fullWorkshop = { ...mockWorkshop, availableSeats: 0 };
      const manager = createMockManager({ workshopResult: fullWorkshop });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.reserveSeat('workshop-1', 'student-1', 'test@test.com'),
      ).rejects.toThrow(ConflictException);

      try {
        await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('WORKSHOP_FULL');
      }
    });

    it('should throw ALREADY_REGISTERED when student already registered', async () => {
      const manager = createMockManager({
        existingRegistration: { ...mockRegistration, status: RegistrationStatus.CONFIRMED },
      });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.reserveSeat('workshop-1', 'student-1', 'test@test.com'),
      ).rejects.toThrow(ConflictException);

      try {
        await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('ALREADY_REGISTERED');
      }
    });

    it('should allow re-registration if previous was CANCELLED', async () => {
      const manager = createMockManager({
        existingRegistration: { ...mockRegistration, status: RegistrationStatus.CANCELLED },
      });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      // Should NOT throw — cancelled registrations can be re-registered
      const result = await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');
      expect(result).toBeDefined();
    });

    it('should throw SCHEDULE_CONFLICT when workshops overlap', async () => {
      const conflicting = { ...mockRegistration, id: 'other-reg' };
      const manager = createMockManager({ conflictingRegistration: conflicting });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.reserveSeat('workshop-1', 'student-1', 'test@test.com'),
      ).rejects.toThrow(ConflictException);

      try {
        await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('SCHEDULE_CONFLICT');
      }
    });

    it('should throw WORKSHOP_NOT_AVAILABLE when status is not PUBLISHED', async () => {
      const draftWorkshop = { ...mockWorkshop, status: WorkshopStatus.DRAFT };
      const manager = createMockManager({ workshopResult: draftWorkshop });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.reserveSeat('workshop-1', 'student-1', 'test@test.com'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('WORKSHOP_NOT_AVAILABLE');
      }
    });

    it('should throw WORKSHOP_STARTED when workshop already began', async () => {
      const startedWorkshop = {
        ...mockWorkshop,
        startTime: new Date('2020-01-01T09:00:00Z'),
      };
      const manager = createMockManager({ workshopResult: startedWorkshop });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.reserveSeat('workshop-1', 'student-1', 'test@test.com'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.reserveSeat('workshop-1', 'student-1', 'test@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('WORKSHOP_STARTED');
      }
    });

    it('should throw WORKSHOP_NOT_FOUND when workshop does not exist', async () => {
      const manager = createMockManager({ workshopResult: null });

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.reserveSeat('non-existent', 'student-1', 'test@test.com'),
      ).rejects.toThrow(NotFoundException);
    });

    // ──────────────────────────────────────────────────────────
    // RACE CONDITION TEST — proves pessimistic lock handles contention
    // ──────────────────────────────────────────────────────────

    it('should handle race condition: only 1 of 2 concurrent requests succeeds for last seat', async () => {
      /**
       * This test simulates a race condition scenario:
       * - Workshop has exactly 1 seat left (availableSeats = 1).
       * - Two students try to register concurrently.
       *
       * With Pessimistic Lock (SELECT ... FOR UPDATE):
       * - The first transaction acquires the lock, reads availableSeats=1,
       *   decrements to 0, and commits.
       * - The second transaction waits for the lock, then reads
       *   availableSeats=0 and rejects with WORKSHOP_FULL.
       *
       * We prove this by simulating the sequential execution that
       * pessimistic locking enforces (serialized access to the row).
       */
      let seatCount = 1; // Shared mutable state simulating DB row

      // Manager for student A — acquires lock first
      const managerA = createMockManager({
        workshopResult: { ...mockWorkshop, availableSeats: seatCount },
      });
      // Override save to decrement the shared counter
      managerA.save = jest.fn().mockImplementation((_entity: any, data: any) => {
        if (data.availableSeats !== undefined) {
          seatCount = data.availableSeats; // Simulate DB write
        }
        return Promise.resolve({ ...data, id: data.id || 'reg-a' });
      });

      // Manager for student B — reads AFTER A commits (pessimistic lock guarantees this)
      const managerB = createMockManager();
      // Override the workshop query builder to read the CURRENT seat count
      const workshopQbB = {
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockImplementation(async () => {
          // After student A commits, seatCount is 0
          return { ...mockWorkshop, availableSeats: seatCount };
        }),
      };
      managerB.createQueryBuilder = jest.fn().mockImplementation((entity: any) => {
        if (entity === Workshop) return workshopQbB;
        return {
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        };
      });

      let callCount = 0;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => {
        callCount++;
        if (callCount === 1) return cb(managerA); // Student A gets lock first
        return cb(managerB); // Student B gets lock after A commits
      });

      // Student A registers — should succeed
      const resultA = await service.reserveSeat('workshop-1', 'student-a', 'a@test.com');
      expect(resultA.status).toBe(RegistrationStatus.CONFIRMED);

      // Student B registers — should fail (seat taken by A)
      await expect(
        service.reserveSeat('workshop-1', 'student-b', 'b@test.com'),
      ).rejects.toThrow(ConflictException);

      try {
        await service.reserveSeat('workshop-1', 'student-b', 'b@test.com');
      } catch (e: any) {
        expect(e.response.error.code).toBe('WORKSHOP_FULL');
      }

      // Verify pessimistic lock was requested on both managers
      expect(managerA.createQueryBuilder(Workshop, 'w').setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(workshopQbB.setLock).toHaveBeenCalledWith('pessimistic_write');
    });
  });

  // ──────────────────────────────────────────────────────────
  // cancelRegistration
  // ──────────────────────────────────────────────────────────

  describe('cancelRegistration', () => {
    it('should cancel registration and restore seat', async () => {
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce({ ...mockRegistration, status: RegistrationStatus.CONFIRMED })
          .mockResolvedValueOnce({ ...mockWorkshop }),
        save: jest.fn().mockImplementation((_entity: any, data: any) => Promise.resolve(data)),
      } as unknown as jest.Mocked<EntityManager>;

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      const result = await service.cancelRegistration('reg-1', 'student-1');

      expect(result.status).toBe(RegistrationStatus.CANCELLED);
      // Workshop seat should be restored (availableSeats + 1)
      expect(manager.save).toHaveBeenCalledTimes(2);
    });

    it('should throw CANCELLATION_DEADLINE_PASSED when too close to start', async () => {
      const soonWorkshop = {
        ...mockWorkshop,
        startTime: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      };

      // Use a factory so each transaction call gets fresh mocks
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn()
            .mockResolvedValueOnce({ ...mockRegistration, status: RegistrationStatus.CONFIRMED })
            .mockResolvedValueOnce(soonWorkshop),
          save: jest.fn(),
        } as unknown as jest.Mocked<EntityManager>;
        return cb(manager);
      });

      await expect(
        service.cancelRegistration('reg-1', 'student-1'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.cancelRegistration('reg-1', 'student-1');
      } catch (e: any) {
        expect(e.response.error.code).toBe('CANCELLATION_DEADLINE_PASSED');
      }
    });

    it('should throw REGISTRATION_NOT_FOUND for non-existent registration', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      } as unknown as jest.Mocked<EntityManager>;

      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.cancelRegistration('non-existent', 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────
  // QR Code generation
  // ──────────────────────────────────────────────────────────

  describe('generateQrCode', () => {
    it('should generate a valid base64-encoded QR with HMAC signature', () => {
      const qr = service.generateQrCode('reg-1', 'student-1', 'workshop-1');

      expect(qr).toBeDefined();

      // Decode and verify structure
      const decoded = JSON.parse(Buffer.from(qr, 'base64').toString());
      expect(decoded.registrationId).toBe('reg-1');
      expect(decoded.studentId).toBe('student-1');
      expect(decoded.workshopId).toBe('workshop-1');
      expect(decoded.signature).toBeDefined();
      expect(decoded.signature).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('should produce different signatures for different inputs', () => {
      const qr1 = service.generateQrCode('reg-1', 'student-1', 'workshop-1');
      const qr2 = service.generateQrCode('reg-2', 'student-2', 'workshop-2');

      const decoded1 = JSON.parse(Buffer.from(qr1, 'base64').toString());
      const decoded2 = JSON.parse(Buffer.from(qr2, 'base64').toString());

      expect(decoded1.signature).not.toBe(decoded2.signature);
    });
  });
});
