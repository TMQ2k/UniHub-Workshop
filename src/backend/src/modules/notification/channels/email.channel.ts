import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationChannel,
  NotificationPayload,
} from '../interfaces/index.js';
import * as nodemailer from 'nodemailer';

/**
 * Email channel implementation of INotificationChannel.
 * Uses nodemailer with SMTP transport.
 */
@Injectable()
export class EmailChannel implements INotificationChannel {
  readonly channelType = 'EMAIL';
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    // In development, use a preview-only transport (ethereal)
    // In production, configure via env vars
    this.transporter = nodemailer.createTransport({
      host: process.env['SMTP_HOST'] ?? 'smtp.ethereal.email',
      port: Number(process.env['SMTP_PORT'] ?? 587),
      secure: false,
      auth: {
        user: process.env['SMTP_USER'] ?? '',
        pass: process.env['SMTP_PASS'] ?? '',
      },
    });
  }

  async send(payload: NotificationPayload): Promise<void> {
    const info = await this.transporter.sendMail({
      from: process.env['SMTP_FROM'] ?? 'noreply@unihub.edu.vn',
      to: payload.email,
      subject: payload.title,
      text: payload.body,
    });

    this.logger.log(`Email sent to ${payload.email} — messageId: ${info.messageId}`);
  }
}
