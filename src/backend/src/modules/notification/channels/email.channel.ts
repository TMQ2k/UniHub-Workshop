import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationChannel,
  NotificationPayload,
} from '../interfaces/index.js';
import * as nodemailer from 'nodemailer';
import * as QRCode from 'qrcode';

/**
 * Email channel implementation of INotificationChannel.
 * Uses nodemailer with SMTP transport.
 * Supports inline QR code images in HTML emails.
 */
@Injectable()
export class EmailChannel implements INotificationChannel {
  readonly channelType = 'EMAIL';
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
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
    const attachments: nodemailer.SendMailOptions['attachments'] = [];
    let html = this.buildHtmlBody(payload);

    // If there's QR code data, generate a QR image and embed it inline
    if (payload.data?.['qrCode']) {
      try {
        const qrBuffer = await QRCode.toBuffer(
          payload.data['qrCode'] as string,
          {
            type: 'png',
            width: 300,
            margin: 2,
            color: { dark: '#1e1b4b', light: '#ffffff' },
          },
        );

        attachments.push({
          filename: 'qr-checkin.png',
          content: qrBuffer,
          cid: 'qrcode@unihub',
        });

        html += `
          <div style="text-align:center;margin:24px 0;">
            <p style="font-size:14px;color:#6b7280;margin-bottom:12px;">
              📱 Mã QR Check-in của bạn:
            </p>
            <img src="cid:qrcode@unihub" alt="QR Check-in" width="250" height="250" 
                 style="border-radius:12px;border:2px solid #e5e7eb;" />
            <p style="font-size:12px;color:#9ca3af;margin-top:12px;">
              Đưa mã QR này cho nhân viên quét khi đến workshop
            </p>
          </div>
        `;
      } catch (err) {
        this.logger.warn(
          `Failed to generate QR image: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    html += this.buildHtmlFooter();

    const info = await this.transporter.sendMail({
      from: process.env['SMTP_FROM'] ?? 'noreply@unihub.edu.vn',
      to: payload.email,
      subject: payload.title,
      text: payload.body,
      html,
      attachments,
    });

    this.logger.log(`Email sent to ${payload.email} — messageId: ${info.messageId}`);

    // Log Ethereal preview URL in development
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      this.logger.log(`📧 Ethereal preview: ${previewUrl}`);
    }
  }

  private buildHtmlBody(payload: NotificationPayload): string {
    const workshopTitle = (payload.data?.['workshopTitle'] as string) || '';
    const workshopBadge = workshopTitle
      ? `<div style="background:linear-gradient(135deg,#6366f1,#a855f7);color:white;padding:12px 20px;border-radius:10px;text-align:center;margin:16px 0;">
           <span style="font-size:16px;font-weight:700;">📌 ${workshopTitle}</span>
         </div>`
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family:'Segoe UI',Arial,sans-serif;background:#f9fafb;padding:32px;">
        <div style="max-width:500px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:12px;width:48px;height:48px;line-height:48px;color:white;font-weight:bold;font-size:20px;">U</div>
            <h2 style="margin:12px 0 0;color:#1e1b4b;">UniHub Workshop</h2>
          </div>
          <h3 style="color:#1e1b4b;margin-bottom:8px;">${payload.title}</h3>
          ${workshopBadge}
          <p style="color:#4b5563;line-height:1.6;">${payload.body.replace(/\n/g, '<br>')}</p>
    `;
  }

  private buildHtmlFooter(): string {
    return `
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="font-size:12px;color:#9ca3af;text-align:center;">
            Email này được gửi tự động từ UniHub Workshop System.
          </p>
        </div>
      </body>
      </html>
    `;
  }
}
