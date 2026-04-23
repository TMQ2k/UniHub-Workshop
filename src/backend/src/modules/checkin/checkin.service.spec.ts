import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckinService } from './checkin.service.js';
import { CheckIn, CheckInSource } from './entities/checkin.entity.js';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity.js';
import { SyncCheckInItemDto } from './dto/index.js';

describe('CheckinService', () => {
  let service: CheckinService;
  let checkinRepo: jest.Mocked<Repository<CheckIn>>;
  let registrationRepo: jest.Mocked<Repository<Registration>>;

  const STAFF_USER_ID = 'staff-user-1';

  const mockRegistration: Registration = {
    id: 'reg-1',
    workshopId: 'workshop-1',
    studentId: 'student-1',
    status: RegistrationStatus.CONFIRMED,
    qrCode: 'mock-qr',
    seatHoldExpiresAt: null,
    workshop: null as any,
    student: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCheckin: CheckIn = {
    id: 'checkin-1',
    registrationId: 'reg-1',
    scannedBy: STAFF_USER_ID,
    scannedAt: new Date('2026-05-10T09:05:00+07:00'),
    source: CheckInSource.ONLINE,
    registration: null as any,
    scanner: null as any,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        {
          provide: getRepositoryToken(CheckIn),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((data) => ({ id: 'new-checkin', ...data })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
          },
        },
        {
          provide: getRepositoryToken(Registration),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
    checkinRepo = module.get(getRepositoryToken(CheckIn));
    registrationRepo = module.get(getRepositoryToken(Registration));
  });

  // ──────────────────────────────────────────────────────────
  // syncOfflineCheckins — Happy path
  // ──────────────────────────────────────────────────────────

  describe('syncOfflineCheckins', () => {
    it('should sync a valid check-in successfully', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue({ ...mockRegistration });
      checkinRepo.findOne = jest.fn().mockResolvedValue(null);

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0].status).toBe('synced');
      expect(checkinRepo.create).toHaveBeenCalledWith({
        registrationId: 'reg-1',
        scannedBy: STAFF_USER_ID,
        scannedAt: new Date('2026-05-10T09:05:00+07:00'),
        source: CheckInSource.OFFLINE_SYNC,
      });
      expect(checkinRepo.save).toHaveBeenCalled();
    });

    it('should process items sorted by scannedAt (FIFO)', async () => {
      const regA = { ...mockRegistration, id: 'reg-a', workshopId: 'workshop-1' };
      const regB = { ...mockRegistration, id: 'reg-b', workshopId: 'workshop-1' };

      registrationRepo.findOne = jest.fn()
        .mockResolvedValueOnce(regA)
        .mockResolvedValueOnce(regB);
      checkinRepo.findOne = jest.fn().mockResolvedValue(null);

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-b', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:10:00+07:00' },
        { registrationId: 'reg-a', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.synced).toBe(2);

      // Verify reg-a (earlier) was processed first
      const firstCreateCall = (checkinRepo.create as jest.Mock).mock.calls[0][0];
      expect(firstCreateCall.registrationId).toBe('reg-a');
    });

    it('should sync multiple items with mixed results', async () => {
      registrationRepo.findOne = jest.fn()
        .mockResolvedValueOnce({ ...mockRegistration }) // reg-1 valid
        .mockResolvedValueOnce(null); // reg-2 not found
      checkinRepo.findOne = jest.fn().mockResolvedValue(null);

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' },
        { registrationId: 'reg-2', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:06:00+07:00' },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[1].reason).toBe('REGISTRATION_NOT_FOUND');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Validation errors
  // ──────────────────────────────────────────────────────────

  describe('validation errors', () => {
    it('should return REGISTRATION_NOT_FOUND when registration does not exist', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue(null);

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'non-existent', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.failed).toBe(1);
      expect(result.results[0].reason).toBe('REGISTRATION_NOT_FOUND');
    });

    it('should return REGISTRATION_CANCELLED when registration is cancelled', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue({
        ...mockRegistration,
        status: RegistrationStatus.CANCELLED,
      });

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.failed).toBe(1);
      expect(result.results[0].reason).toBe('REGISTRATION_CANCELLED');
    });

    it('should return REGISTRATION_NOT_CONFIRMED when registration is pending payment', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue({
        ...mockRegistration,
        status: RegistrationStatus.PENDING_PAYMENT,
      });

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.failed).toBe(1);
      expect(result.results[0].reason).toBe('REGISTRATION_NOT_CONFIRMED');
    });

    it('should return WORKSHOP_MISMATCH when workshopId does not match', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue({
        ...mockRegistration,
        workshopId: 'different-workshop',
      });

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.failed).toBe(1);
      expect(result.results[0].reason).toBe('WORKSHOP_MISMATCH');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Conflict resolution — Last-write-wins
  // ──────────────────────────────────────────────────────────

  describe('conflict resolution (last-write-wins)', () => {
    it('should return ALREADY_CHECKED_IN when incoming scan is later than existing', async () => {
      registrationRepo.findOne = jest.fn().mockResolvedValue({ ...mockRegistration });
      checkinRepo.findOne = jest.fn().mockResolvedValue({
        ...mockCheckin,
        scannedAt: new Date('2026-05-10T09:00:00+07:00'), // existing earlier
      });

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' }, // incoming later
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.failed).toBe(1);
      expect(result.results[0].reason).toBe('ALREADY_CHECKED_IN');
      expect(checkinRepo.save).not.toHaveBeenCalled();
    });

    it('should overwrite existing check-in when incoming scan is earlier (last-write-wins)', async () => {
      const existingCheckin = {
        ...mockCheckin,
        scannedAt: new Date('2026-05-10T09:10:00+07:00'), // existing later
      };

      registrationRepo.findOne = jest.fn().mockResolvedValue({ ...mockRegistration });
      checkinRepo.findOne = jest.fn().mockResolvedValue(existingCheckin);

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: '2026-05-10T09:05:00+07:00' }, // incoming earlier
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.synced).toBe(1);
      expect(result.results[0].status).toBe('synced');

      // Verify existing record was updated with earlier timestamp
      expect(checkinRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          scannedAt: new Date('2026-05-10T09:05:00+07:00'),
          source: CheckInSource.OFFLINE_SYNC,
        }),
      );
    });

    it('should return ALREADY_CHECKED_IN when incoming scan has same timestamp', async () => {
      const sameTime = '2026-05-10T09:05:00+07:00';

      registrationRepo.findOne = jest.fn().mockResolvedValue({ ...mockRegistration });
      checkinRepo.findOne = jest.fn().mockResolvedValue({
        ...mockCheckin,
        scannedAt: new Date(sameTime),
      });

      const items: SyncCheckInItemDto[] = [
        { registrationId: 'reg-1', workshopId: 'workshop-1', scannedAt: sameTime },
      ];

      const result = await service.syncOfflineCheckins(items, STAFF_USER_ID);

      expect(result.failed).toBe(1);
      expect(result.results[0].reason).toBe('ALREADY_CHECKED_IN');
    });
  });
});
