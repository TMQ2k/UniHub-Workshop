import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationService } from './notification.service.js';
import { NotificationPayload } from './interfaces/index.js';

interface NotificationJobData {
  notificationId: string;
  payload: NotificationPayload;
  channelType: string;
}

const BACKOFF_DELAYS_MS = [1_000, 5_000, 30_000]; // 1s → 5s → 30s (exponential)

/**
 * BullMQ worker that processes notification jobs off the queue.
 * Retry with custom exponential backoff: 1s, 5s, 30s.
 */
@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationService: NotificationService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { notificationId, payload, channelType } = job.data;

    this.logger.log(
      `Processing notification ${notificationId} via ${channelType}`,
    );

    await this.notificationService.processNotification(
      notificationId,
      payload,
      channelType,
    );
  }

  /**
   * Custom backoff strategy: 1s → 5s → 30s as per spec.
   */
  static getBackoffDelay(attemptsMade: number): number {
    const index = Math.min(attemptsMade - 1, BACKOFF_DELAYS_MS.length - 1);
    return BACKOFF_DELAYS_MS[index]!;
  }
}
