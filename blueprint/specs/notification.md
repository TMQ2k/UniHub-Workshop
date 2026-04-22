# Đặc tả: Notification (Thông báo)

## Mô tả

Module gửi thông báo cho người dùng. Kiến trúc dựa trên **interface `INotificationChannel`** — tuân thủ Open/Closed Principle: thêm kênh mới (Telegram, SMS) = thêm class mới, không sửa `NotificationService`. Sử dụng BullMQ để xử lý gửi notification bất đồng bộ.

---

## Actor

| Actor | Hành động |
|-------|-----------|
| **Hệ thống** | Trigger notification khi có sự kiện (đăng ký, hủy, nhắc nhở) |
| **STUDENT** | Nhận notification (email, in-app) |
| **ORGANIZER** | Nhận notification quản trị |

---

## Các loại Notification

| Loại | Trigger | Người nhận | Kênh |
|------|---------|------------|------|
| `REGISTRATION_CONFIRMED` | Đăng ký thành công | STUDENT | Email |
| `REGISTRATION_CANCELLED` | Hủy đăng ký | STUDENT | Email |
| `PAYMENT_SUCCESS` | Thanh toán thành công | STUDENT | Email |
| `WORKSHOP_CANCELLED` | Workshop bị hủy | Tất cả đã đăng ký | Email |
| `WORKSHOP_UPDATED` | Thay đổi thời gian/địa điểm | Tất cả đã đăng ký | Email |
| `WORKSHOP_REMINDER` | 30 phút trước workshop | Tất cả CONFIRMED | Email |
| `CHECKIN_SUCCESS` | Check-in thành công | STUDENT | In-app |

---

## Luồng chính

### LC-01: Gửi Notification (Async via BullMQ)

```
1. Module khác gọi NotificationService.send(userId, type, payload)
2. NotificationService tạo job trong BullMQ queue 'notifications'
3. Worker pick up job:
   a. Resolve template theo type
   b. Inject payload vào template
   c. Lấy danh sách channels active cho user
   d. Gửi qua từng channel (EmailChannel, etc.)
4. Nếu gửi thất bại → retry 3 lần (exponential backoff: 1s, 5s, 30s)
5. Sau 3 lần fail → mark job FAILED, log error
```

### LC-02: Workshop Reminder (Scheduled)

```
1. Cron job chạy mỗi 5 phút
2. Query: workshop có startTime trong khoảng [now+25min, now+35min]
3. Lấy danh sách registrations CONFIRMED
4. Queue notification WORKSHOP_REMINDER cho mỗi student
5. Đánh dấu workshop đã gửi reminder (chống gửi trùng)
```

### LC-03: Broadcast khi Workshop bị hủy

```
1. WorkshopService gọi NotificationService.broadcast(workshopId, WORKSHOP_CANCELLED)
2. Server lấy tất cả registrations CONFIRMED/PENDING của workshop
3. Queue notification cho mỗi student (batch enqueue)
```

---

## Kiến trúc Channel (OCP)

```typescript
// Interface — không bao giờ sửa
interface INotificationChannel {
  readonly channelType: string;
  send(payload: NotificationPayload): Promise<void>;
  isAvailable(userId: string): Promise<boolean>;
}

// Phase 1: Email
class EmailChannel implements INotificationChannel { ... }

// Phase 2 (future): chỉ cần thêm class mới
class TelegramChannel implements INotificationChannel { ... }
class SMSChannel implements INotificationChannel { ... }
```

**NotificationService** nhận `INotificationChannel[]` qua DI → iterate và gửi.

---

## Kịch bản lỗi

| # | Kịch bản | Xử lý | Error Code |
|---|----------|--------|------------|
| E-01 | Email gửi fail (SMTP lỗi) | Retry 3 lần, sau đó mark FAILED | `EMAIL_SEND_FAILED` |
| E-02 | Template không tồn tại | Log error, skip | `TEMPLATE_NOT_FOUND` |
| E-03 | User không có email | Skip channel, log warning | `NO_EMAIL` |
| E-04 | Queue full (BullMQ) | Log alert, monitor | `QUEUE_OVERFLOW` |
| E-05 | Duplicate reminder | Check flag, skip nếu đã gửi | — |

---

## Ràng buộc

- **Async only**: Notification KHÔNG block business logic (gửi qua BullMQ)
- **Retry**: 3 lần, exponential backoff (1s, 5s, 30s)
- **Reminder**: 30 phút trước workshop, gửi 1 lần duy nhất
- **Phase 1**: Chỉ implement EmailChannel
- **Không gửi notification cho CHECKIN_STAFF** (chỉ STUDENT và ORGANIZER)
- **Template-based**: Mỗi loại notification có template riêng

---

## Tiêu chí chấp nhận

- [ ] Đăng ký → nhận email xác nhận
- [ ] Workshop bị hủy → tất cả đã đăng ký nhận email
- [ ] Reminder gửi ~30 phút trước, không gửi trùng
- [ ] Email fail → retry 3 lần
- [ ] Notification không block business logic
- [ ] Thêm kênh mới không cần sửa NotificationService

---

## API Contract

Notification module **không expose public API**. Chỉ có internal interface:

```typescript
// Internal — gọi bởi các module khác
interface INotificationService {
  send(userId: string, type: NotificationType, payload: Record<string, any>): Promise<void>;
  broadcast(workshopId: string, type: NotificationType, payload?: Record<string, any>): Promise<void>;
}
```

### GET `/notifications/me` — Auth: STUDENT (Phase 2, nice-to-have)
```json
{ "success": true, "data": [
    { "id": "uuid", "type": "REGISTRATION_CONFIRMED", "message": "...",
      "read": false, "createdAt": "..." }
  ] }
```
