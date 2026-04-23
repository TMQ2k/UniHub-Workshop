/**
 * Payload passed to every notification channel.
 */
export interface NotificationPayload {
  userId: string;
  email: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Open/Closed Principle — Notification channel abstraction.
 *
 * To add a new channel (e.g. Telegram, SMS):
 * 1. Create a class implementing INotificationChannel.
 * 2. Register it with NestJS DI using the NOTIFICATION_CHANNELS token.
 * 3. Do NOT modify NotificationService.
 */
export interface INotificationChannel {
  /** Unique identifier for this channel, e.g. 'EMAIL', 'APP_PUSH', 'TELEGRAM' */
  readonly channelType: string;

  /** Send a notification through this channel. Throws on failure. */
  send(payload: NotificationPayload): Promise<void>;
}

/**
 * DI token for injecting all notification channel implementations.
 */
export const NOTIFICATION_CHANNELS = 'NOTIFICATION_CHANNELS';
