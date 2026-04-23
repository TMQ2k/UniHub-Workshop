import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationService } from './notification.service.js';
import { Notification } from './entities/notification.entity.js';
import {
  INotificationChannel,
  NOTIFICATION_CHANNELS,
  NotificationPayload,
} from './interfaces/index.js';

describe('NotificationService', () => {
  let service: NotificationService;
  let notifRepo: Record<string, jest.Mock>;
  let mockQueue: Record<string, jest.Mock>;
  let emailChannel: INotificationChannel;

  beforeEach(async () => {
    notifRepo = {
      create: jest.fn((dto) => ({ id: 'notif-1', ...dto })),
      save: jest.fn((records) =>
        Promise.resolve(
          records.map((r: Record<string, unknown>, i: number) => ({
            ...r,
            id: `notif-${i + 1}`,
          })),
        ),
      ),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    emailChannel = {
      channelType: 'EMAIL',
      send: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification), useValue: notifRepo },
        { provide: getQueueToken('notification'), useValue: mockQueue },
        { provide: NOTIFICATION_CHANNELS, useValue: [emailChannel] },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  // ── OCP: channels are injected, not hardcoded ──────────

  describe('send', () => {
    it('should create PENDING records and enqueue jobs for each channel', async () => {
      await service.send(
        'user-1',
        'test@example.com',
        'REGISTRATION_CONFIRMED',
        'Đăng ký thành công',
        'Bạn đã đăng ký workshop...',
      );

      // One record per channel (we have 1 channel: EMAIL)
      expect(notifRepo.save).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-notification',
        expect.objectContaining({
          channelType: 'EMAIL',
          payload: expect.objectContaining({ email: 'test@example.com' }),
        }),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should handle multiple channels without modifying service', async () => {
      // Simulate adding a second channel (OCP test)
      const pushChannel: INotificationChannel = {
        channelType: 'APP_PUSH',
        send: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationService,
          { provide: getRepositoryToken(Notification), useValue: notifRepo },
          { provide: getQueueToken('notification'), useValue: mockQueue },
          {
            provide: NOTIFICATION_CHANNELS,
            useValue: [emailChannel, pushChannel],
          },
        ],
      }).compile();

      const multiChannelService =
        module.get<NotificationService>(NotificationService);

      await multiChannelService.send(
        'user-1',
        'test@example.com',
        'WORKSHOP_CANCELLED',
        'Workshop bị hủy',
        'Workshop XYZ đã bị hủy.',
      );

      // 2 channels → 2 records saved, 2 jobs queued
      expect(notifRepo.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  // ── processNotification ────────────────────────────────

  describe('processNotification', () => {
    it('should call channel.send and mark SENT on success', async () => {
      await service.processNotification('notif-1', {
        userId: 'user-1',
        email: 'test@example.com',
        type: 'TEST',
        title: 'Test',
        body: 'Hello',
      } as NotificationPayload, 'EMAIL');

      expect(emailChannel.send).toHaveBeenCalledTimes(1);
      expect(notifRepo.update).toHaveBeenCalledWith('notif-1', {
        status: 'SENT',
      });
    });

    it('should increment retryCount and re-throw on channel failure', async () => {
      (emailChannel.send as jest.Mock).mockRejectedValue(
        new Error('SMTP down'),
      );

      await expect(
        service.processNotification('notif-1', {
          userId: 'user-1',
          email: 'test@example.com',
          type: 'TEST',
          title: 'Test',
          body: 'Hello',
        } as NotificationPayload, 'EMAIL'),
      ).rejects.toThrow('SMTP down');

      expect(notifRepo.increment).toHaveBeenCalledWith(
        { id: 'notif-1' },
        'retryCount',
        1,
      );
    });

    it('should mark FAILED for unknown channel type', async () => {
      await service.processNotification('notif-1', {
        userId: 'user-1',
        email: 'test@example.com',
        type: 'TEST',
        title: 'Test',
        body: 'Hello',
      } as NotificationPayload, 'UNKNOWN');

      expect(notifRepo.update).toHaveBeenCalledWith('notif-1', {
        status: 'FAILED',
      });
    });
  });

  // ── markAsRead ─────────────────────────────────────────

  describe('markAsRead', () => {
    it('should update isRead to true', async () => {
      const result = await service.markAsRead('notif-1', 'user-1');

      expect(notifRepo.update).toHaveBeenCalledWith(
        { id: 'notif-1', userId: 'user-1' },
        { isRead: true },
      );
      expect(result.read).toBe(true);
    });
  });
});
