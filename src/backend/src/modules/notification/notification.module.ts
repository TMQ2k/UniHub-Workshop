import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './entities/notification.entity.js';
import { NotificationService } from './notification.service.js';
import { NotificationController } from './notification.controller.js';
import { NotificationProcessor } from './notification.processor.js';
import { EmailChannel } from './channels/email.channel.js';
import { NOTIFICATION_CHANNELS } from './interfaces/index.js';

/**
 * NotificationModule — OCP compliant.
 *
 * To add a new channel (e.g. TelegramChannel):
 * 1. Create TelegramChannel implementing INotificationChannel.
 * 2. Add it to the `notificationChannelsProvider` factory below.
 * 3. NotificationService is NEVER modified.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({
      name: 'notification',
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationProcessor,
    EmailChannel,
    // OCP: inject all channels as an array via factory provider
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (emailChannel: EmailChannel) => {
        // Add new channels here: (emailChannel, telegramChannel, ...) => [...]
        return [emailChannel];
      },
      inject: [EmailChannel],
    },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
