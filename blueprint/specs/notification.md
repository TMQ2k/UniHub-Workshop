# Đặc tả: Notification (Thông báo)

## Mô tả

Module gửi thông báo cho sinh viên qua nhiều kênh. Thiết kế theo **Open/Closed Principle**: thêm kênh thông báo mới (Telegram, SMS...) chỉ cần thêm class mới implement `INotificationChannel`, **không sửa** `NotificationService`. Thông báo được xử lý **bất đồng bộ** qua BullMQ queue.

## Actor

| Actor | Vai trò |
|-------|---------|
| System (internal) | Trigger notification khi có sự kiện (đăng ký, hủy, thay đổi...) |
| STUDENT | Nhận thông báo qua email và app push |
| ORGANIZER | Xem lịch sử thông báo đã gửi |

## Luồng chính

### Luồng 1 — Gửi thông báo (Internal trigger)

1. Module khác (Registration, Payment, Workshop) gọi `INotificationService.send()`.
2. `NotificationService` tạo notification record trong DB `status = PENDING`.
3. Enqueue job vào **BullMQ** notification queue.
4. Queue worker pick job:
   a. Lấy danh sách kênh active cho user (email, app push).
   b. Với mỗi kênh, gọi `INotificationChannel.send(payload)`.
   c. Cập nhật `status = SENT` hoặc `FAILED`.
5. Nếu 1 kênh fail → retry 3 lần, ghi log, không ảnh hưởng kênh khác.

### Luồng 2 — Các sự kiện trigger notification

| Sự kiện | Template | Kênh |
|---------|----------|------|
| Đăng ký thành công (miễn phí) | `REGISTRATION_CONFIRMED` | Email + App Push |
| Thanh toán thành công | `PAYMENT_CONFIRMED` | Email + App Push |
| Workshop bị hủy | `WORKSHOP_CANCELLED` | Email + App Push |
| Workshop đổi phòng/giờ | `WORKSHOP_UPDATED` | Email + App Push |
| Hoàn tiền thành công | `REFUND_COMPLETED` | Email |
| Nhắc nhở trước workshop 1 giờ | `WORKSHOP_REMINDER` | App Push |

### Luồng 3 — Thêm kênh thông báo mới (OCP)

1. Tạo class mới implement `INotificationChannel`:
   ```
   interface INotificationChannel {
     channelType: string;
     send(payload: NotificationPayload): Promise<void>;
   }
   ```
2. Register class mới vào NestJS DI container.
3. **Không sửa** `NotificationService` hay bất kỳ code hiện tại.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code |
|----------|-------|------------|
| Email server không phản hồi | Retry 3 lần (backoff: 1s, 5s, 30s), nếu vẫn lỗi → mark FAILED, log | `EMAIL_SEND_FAILED` |
| App push token invalid | Mark FAILED, log, skip | `PUSH_TOKEN_INVALID` |
| Queue worker crash | BullMQ auto-retry, job không bị mất | — |
| Template không tồn tại | Log error, skip notification | `TEMPLATE_NOT_FOUND` |

## Ràng buộc

- **Bất đồng bộ**: Notification luôn qua BullMQ queue, không gửi đồng bộ trong request.
- **OCP**: Thêm kênh = thêm class, không sửa code cũ.
- **SRP**: `NotificationService` chỉ orchestrate, không biết chi tiết email/push.
- **Retry**: 3 lần với exponential backoff (1s → 5s → 30s).
- **Rate limit**: Tối đa 100 emails/phút (tránh bị SMTP block).
- **Template-based**: Mỗi loại thông báo dùng template predefined.

## Tiêu chí chấp nhận

- [ ] Đăng ký workshop thành công → SV nhận email + app push xác nhận.
- [ ] Workshop bị hủy → tất cả SV đã đăng ký nhận thông báo.
- [ ] Thêm kênh Telegram → chỉ tạo `TelegramChannel` class, không sửa code cũ.
- [ ] Email fail → retry 3 lần, app push vẫn gửi bình thường.
- [ ] Notification không block request chính (bất đồng bộ qua queue).

## API Contract

### GET /notifications/me (STUDENT)

```json
// Response 200
{ "success": true,
  "data": [
    { "id": "uuid", "type": "REGISTRATION_CONFIRMED",
      "title": "Đăng ký thành công", "body": "Bạn đã đăng ký workshop...",
      "read": false, "createdAt": "..." }
  ],
  "meta": { "unreadCount": 3 }
}
```

### PATCH /notifications/:id/read (STUDENT)

```json
// Response 200
{ "success": true, "data": { "id": "uuid", "read": true } }
```
