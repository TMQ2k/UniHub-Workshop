# Đặc tả: Notification (Thông báo)

## Mô tả

Module gửi thông báo cho sinh viên qua nhiều kênh. Thiết kế theo **Open/Closed Principle**: thêm kênh thông báo mới (Telegram, SMS...) chỉ cần thêm class mới implement `INotificationChannel`, **không sửa** `NotificationService`. Thông báo được xử lý **bất đồng bộ** qua BullMQ queue.

Hiện tại đã triển khai kênh **Email** sử dụng nodemailer với SMTP transport, hỗ trợ gửi QR code dạng ảnh inline trong email HTML.

## Actor

| Actor | Vai trò |
|-------|---------|
| System (internal) | Trigger notification khi có sự kiện (đăng ký, thanh toán, hủy...) |
| STUDENT | Nhận thông báo qua email, xem inbox, đánh dấu đã đọc |


## Luồng chính

### Luồng 1 — Gửi thông báo (Internal trigger)

1. Module khác (Registration, Payment) gọi `NotificationService.send(userId, email, type, title, body, data?)`.
2. `NotificationService` tạo notification record trong DB `status = PENDING` cho mỗi kênh active.
3. Enqueue job vào **BullMQ** notification queue (1 job per channel record).
4. Job config: `attempts: 3`, `backoff: custom`, `removeOnComplete: true`, `removeOnFail: false`.
5. Queue worker (`NotificationProcessor`) pick job:
   a. Tìm channel implementation theo `channelType`.
   b. Gọi `channel.send(payload)`.
   c. Thành công → update `status = SENT`.
   d. Thất bại → increment `retryCount`, re-throw → BullMQ retry.
6. Sau 3 lần retry thất bại → job stay in failed queue, `status` vẫn PENDING.

### Luồng 2 — Các sự kiện trigger notification

| Sự kiện | Template Type | Trigger bởi |
|---------|--------------|-------------|
| Đăng ký thành công (miễn phí) | `REGISTRATION_CONFIRMED` | RegistrationService |
| Thanh toán thành công | `PAYMENT_CONFIRMED` | PaymentService |

### Luồng 3 — Thêm kênh thông báo mới (OCP)

1. Tạo class mới implement `INotificationChannel`:
   ```typescript
   interface INotificationChannel {
     readonly channelType: string;
     send(payload: NotificationPayload): Promise<void>;
   }
   ```
2. Register class mới vào NestJS DI container (multi-provider `NOTIFICATION_CHANNELS` token).
3. **Không sửa** `NotificationService` hay `NotificationProcessor`.

### Luồng 4 — EmailChannel (Implementation)

1. Sử dụng **nodemailer** với SMTP transport (cấu hình qua `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
2. Xây dựng email HTML với branding UniHub Workshop (gradient header, styled body).
3. Nếu `payload.data.qrCode` tồn tại → sinh QR image bằng thư viện `qrcode` → embed inline trong email (CID attachment).
4. Log Ethereal preview URL trong môi trường development.
5. Sender address: `SMTP_FROM` env var, mặc định `noreply@unihub.edu.vn`.

### Luồng 5 — Xem thông báo (STUDENT)

1. `GET /notifications/me` → trả danh sách thông báo của user, sắp xếp theo `createdAt` DESC.
2. Response bao gồm `unreadCount` cho badge hiển thị.

### Luồng 6 — Đánh dấu đã đọc (STUDENT)

1. `PATCH /notifications/:id/read` → update `isRead = true` (chỉ cho notification thuộc user hiện tại).

## NotificationPayload Interface

```typescript
interface NotificationPayload {
  userId: string;
  email: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
```

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code |
|----------|-------|------------|
| Email server không phản hồi | Retry 3 lần (backoff: 1s, 5s, 30s), nếu vẫn lỗi → job failed | `EMAIL_SEND_FAILED` |
| Channel không tồn tại cho channelType | Mark FAILED, log error | — |
| Queue worker crash | BullMQ auto-retry, job không bị mất | — |

## Ràng buộc

- **Bất đồng bộ**: Notification luôn qua BullMQ queue, không gửi đồng bộ trong request.
- **OCP**: Thêm kênh = thêm class implement `INotificationChannel` + register vào DI, không sửa code cũ.
- **SRP**: `NotificationService` chỉ orchestrate, `NotificationProcessor` chỉ xử lý queue, `EmailChannel` chỉ gửi email.
- **Retry**: 3 lần với custom exponential backoff (1s → 5s → 30s) qua `NotificationProcessor.getBackoffDelay()`.
- **QR Code trong email**: Sử dụng `qrcode` library tạo PNG buffer, gửi dưới dạng CID inline attachment.

## Tiêu chí chấp nhận

- [x] Module khác gọi `NotificationService.send()` → tạo DB record + enqueue BullMQ job — non-blocking.
- [x] Đăng ký workshop thành công → SV nhận email xác nhận kèm QR code inline.
- [x] Thanh toán thành công → SV nhận email xác nhận kèm QR code inline.
- [x] Thêm kênh mới → chỉ tạo class mới implement `INotificationChannel`, không sửa code cũ.
- [x] Email fail → retry 3 lần (1s, 5s, 30s backoff).
- [x] Notification không block request chính (bất đồng bộ qua queue).
- [x] STUDENT xem inbox thông báo, đánh dấu đã đọc.

## API Contract

### GET /notifications/me (STUDENT)

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(STUDENT)`

```json
// Response 200
{ "success": true,
  "data": [
    { "id": "uuid", "type": "REGISTRATION_CONFIRMED",
      "title": "Đăng ký thành công", "body": "Bạn đã đăng ký workshop...",
      "read": false, "createdAt": "ISO8601" }
  ],
  "meta": { "unreadCount": 3 }
}
```

### PATCH /notifications/:id/read (STUDENT)

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(STUDENT)`

```json
// Response 200
{ "success": true, "data": { "id": "uuid", "read": true } }
```
