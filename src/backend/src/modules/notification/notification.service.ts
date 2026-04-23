import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Notification } from './entities/notification.entity.js';
import {
  INotificationChannel,
  NotificationPayload,
  NOTIFICATION_CHANNELS,
} from './interfaces/index.js';

const NOTIFICATION_QUEUE = 'notification';

/**
 * NotificationService — orchestrates notification delivery.
 *
 * OCP compliance: this class does NOT know which channels exist.
 * It iterates over all injected INotificationChannel implementations.
 * Adding a new channel requires ZERO changes to this class.
 *
 * SRP compliance: this class only orchestrates. It does not know
 * how to send email, push, or any concrete channel.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: INotificationChannel[],
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  /**
   * Public API called by other modules (Registration, Payment, etc.).
   * Creates DB records and enqueues async jobs — never blocks the caller.
   */
  async send(
    userId: string,
    email: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    // Create a PENDING notification record per active channel
    const records: Notification[] = [];

    for (const channel of this.channels) {
      const record = this.notificationRepo.create({
        userId,
        type,
        title,
        body,
        channel: channel.channelType,
        status: 'PENDING',
      });
      records.push(record);
    }

    const saved = await this.notificationRepo.save(records);

    // Enqueue a job per notification record so they're processed independently
    for (const record of saved) {
      await this.notificationQueue.add(
        'send-notification',
        {
          notificationId: record.id,
          payload: { userId, email, type, title, body, data } as NotificationPayload,
          channelType: record.channel,
        },
        {
          attempts: 3,
          backoff: { type: 'custom' },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }

    this.logger.log(
      `Enqueued ${saved.length} notification(s) for user ${userId} — type: ${type}`,
    );
  }

  /**
   * Process a single notification job (called by the queue worker).
   * Finds the matching channel and delivers the message.
   */
  async processNotification(
    notificationId: string,
    payload: NotificationPayload,
    channelType: string,
  ): Promise<void> {
    const channel = this.channels.find((c) => c.channelType === channelType);

    if (!channel) {
      this.logger.error(`No channel found for type "${channelType}"`);
      await this.notificationRepo.update(notificationId, { status: 'FAILED' });
      return;
    }

    try {
      await channel.send(payload);
      await this.notificationRepo.update(notificationId, { status: 'SENT' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send via ${channelType} for notification ${notificationId}: ${msg}`,
      );
      // Increment retry count; BullMQ handles the retry scheduling
      await this.notificationRepo.increment(
        { id: notificationId },
        'retryCount',
        1,
      );
      throw error; // Re-throw so BullMQ retries the job
    }
  }

  /**
   * Get notifications for a specific user (student inbox).
   */
  async getMyNotifications(userId: string) {
    const notifications = await this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    };
  }

  /**
   * Mark a notification as read.
   */
  async markAsRead(notificationId: string, userId: string) {
    await this.notificationRepo.update(
      { id: notificationId, userId },
      { isRead: true },
    );
    return { id: notificationId, read: true };
  }
}
