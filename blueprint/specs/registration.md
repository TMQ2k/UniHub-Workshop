# Đặc tả: Registration (Đăng ký workshop)

## Mô tả

Module xử lý đăng ký chỗ ngồi workshop. Đảm bảo **không tranh chấp chỗ ngồi** khi hàng trăm sinh viên đăng ký cùng lúc bằng **Pessimistic Lock** kết hợp database transaction. Trước khi đăng ký, hệ thống **xác thực sinh viên có nằm trong dữ liệu nhà trường** (từ CSV Sync, cờ `is_synced`). Sau đăng ký thành công (miễn phí), sinh viên nhận **mã QR** để check-in. Workshop có phí → chờ thanh toán (`PENDING_PAYMENT`).

## Actor

| Actor | Vai trò |
|-------|---------|
| STUDENT | Đăng ký workshop, xem đăng ký của mình, hủy đăng ký |
| ORGANIZER | Xem tất cả đăng ký theo workshop (kèm thống kê) |

## Luồng chính

### Luồng 1 — Đăng ký workshop miễn phí

1. STUDENT bấm "Đăng ký". Client gửi `POST /registrations` với `{ workshopId }`.
2. Rate limit: **10 req/min per IP** bằng Token Bucket (`RateLimitGuard`).
3. **Xác thực sinh viên từ dữ liệu nhà trường**: Kiểm tra `user.isSynced === true`. Nếu `false` → trả `403 STUDENT_NOT_VERIFIED`.
4. Server bắt đầu **database transaction** qua `DataSource.transaction()`:
   a. `SELECT ... FOR UPDATE` trên workshop row (Pessimistic Lock — `setLock('pessimistic_write')`).
   b. Kiểm tra workshop tồn tại.
   c. Kiểm tra `workshop.status === PUBLISHED`.
   d. Kiểm tra workshop chưa bắt đầu (`startTime > now`).
   e. Kiểm tra `availableSeats > 0`.
   f. Kiểm tra STUDENT chưa đăng ký workshop này (trừ CANCELLED).
   g. Kiểm tra không trùng lịch với workshop đã đăng ký (inner join Workshop check overlap).
   h. Giảm `availableSeats -= 1`.
   i. Tạo registration record `status = CONFIRMED`, sinh **QR code** (HMAC-SHA256 signed).
   j. Update QR code lại với actual registrationId (vì ID chỉ có sau save).
   k. Commit transaction.
4. Controller fire-and-forget `notifyRegistrationConfirmedById()` → enqueue notification (email + QR).
5. Trả `201 Created` với registration info + QR code data.

### Luồng 2 — Đăng ký workshop có phí

1. Bước giống Luồng 1, nhưng ở bước (i) set `status = PENDING_PAYMENT`, `qrCode = null`.
2. `seatHoldExpiresAt = now + 15 phút`.
3. Response trả `paymentUrl` để redirect sang Payment flow.
4. Khi payment thành công → `RegistrationService.confirmPayment()` được gọi: set `status = CONFIRMED`, sinh QR code.
5. Nếu seat hold hết hạn → `expirePendingRegistrations()` (cron-callable) tự động hủy, trả lại chỗ.

### Luồng 3 — Hủy đăng ký (STUDENT)

1. `DELETE /registrations/:id`.
2. Trong DB transaction:
   a. Kiểm tra registration thuộc STUDENT đang đăng nhập.
   b. Kiểm tra chưa CANCELLED.
   c. Kiểm tra cancellation deadline: ≥ 2 giờ trước workshop `startTime`.
   d. Restore seat: `workshop.availableSeats += 1`.
   e. Set `status = CANCELLED`, `qrCode = null`.
3. Trả `200 OK` với `{ id, status }`.

### Luồng 4 — Xem đăng ký của mình (STUDENT)

1. `GET /registrations/me` → trả danh sách, bao gồm `workshopTitle`, `qrCode`, sắp xếp `createdAt DESC`.

### Luồng 5 — Xem tất cả đăng ký (ORGANIZER)

1. `GET /registrations?workshopId=uuid` (bắt buộc, validate UUID).
2. Trả danh sách kèm `studentName`, thống kê `{ total, confirmed, pending, cancelled }`.

### Luồng 6 — Confirm payment callback (Internal)

1. `PaymentService` gọi `RegistrationService.confirmPayment(registrationId)`.
2. Set `status = CONFIRMED`, sinh QR code, clear `seatHoldExpiresAt`.
3. Trả registration entity đã cập nhật.

### Luồng 7 — Expire pending registrations (Cron)

1. Tìm tất cả registration `PENDING_PAYMENT` có `seatHoldExpiresAt <= now`.
2. Mỗi record: set `CANCELLED` + restore `availableSeats` (trong transaction riêng).
3. Trả số lượng đã expire.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP |
|----------|-------|------------|------|
| SV chưa có trong dữ liệu nhà trường | Từ chối, yêu cầu liên hệ phòng đào tạo | `STUDENT_NOT_VERIFIED` | 403 |
| Workshop hết chỗ | Từ chối ngay | `WORKSHOP_FULL` | 409 |
| SV đã đăng ký workshop này | Từ chối | `ALREADY_REGISTERED` | 409 |
| Workshop trùng lịch | Từ chối | `SCHEDULE_CONFLICT` | 409 |
| Workshop chưa PUBLISHED | Từ chối | `WORKSHOP_NOT_AVAILABLE` | 400 |
| Workshop đã bắt đầu | Từ chối | `WORKSHOP_STARTED` | 400 |
| Hủy đăng ký < 2 giờ trước | Từ chối | `CANCELLATION_DEADLINE_PASSED` | 400 |
| Đăng ký đã bị hủy trước đó | Từ chối | `ALREADY_CANCELLED` | 400 |
| Registration không tồn tại | Từ chối | `REGISTRATION_NOT_FOUND` | 404 |
| Database lock timeout | Log error, trả 503 | `SERVICE_UNAVAILABLE` | 503 |

## Ràng buộc

### Tính nhất quán (Consistency)
- **Pessimistic Lock** (`setLock('pessimistic_write')`) cho thao tác trừ chỗ ngồi.
- Toàn bộ logic đăng ký trong **cùng 1 transaction** (`DataSource.transaction()`).
- Không bao giờ xảy ra `availableSeats < 0` (zero over-booking).

### Hiệu năng
- Rate limit `POST /registrations`: **10 req/min per IP** bằng Token Bucket.

### QR Code
- Chứa: `registrationId`, `studentId`, `workshopId`.
- Ký bằng **HMAC-SHA256** với `QR_HMAC_SECRET` env var.
- Format: Base64 encoded JSON string (payload + signature).

### Seat hold cho payment
- Chỗ ngồi giữ **15 phút** (`SEAT_HOLD_MINUTES = 15`).
- Hết hạn → `expirePendingRegistrations()` tự động hủy, trả lại chỗ.

### Notification
- Gửi notification **fire-and-forget** — không block response.
- Controller gọi `.catch(() => {})` để swallow lỗi notification.

## Tiêu chí chấp nhận

- [x] SV đăng ký workshop miễn phí → status CONFIRMED, nhận QR code.
- [x] SV đăng ký workshop có phí → status PENDING_PAYMENT, nhận paymentUrl.
- [x] Pessimistic Lock đảm bảo zero over-booking.
- [x] SV không đăng ký trùng workshop hoặc trùng lịch.
- [x] SV hủy đăng ký → chỗ trả lại, QR code xóa.
- [x] Expire pending registrations trả lại chỗ.
- [x] Payment confirm callback sinh QR code.
- [x] Rate limit 10 req/min trên POST /registrations.

## API Contract

### POST /registrations

**Guards:** `JwtAuthGuard`, `RolesGuard`, `RateLimitGuard` — `@Roles(STUDENT)`, `@RateLimit(10/min)`

```json
// Request
{ "workshopId": "uuid" }

// Response 201 (miễn phí)
{ "success": true,
  "data": {
    "id": "uuid", "workshopId": "uuid", "studentId": "uuid",
    "status": "CONFIRMED", "qrCode": "eyJ...",
    "createdAt": "ISO8601"
  },
  "meta": { "timestamp": "ISO8601" }
}

// Response 201 (có phí)
{ "success": true,
  "data": {
    "id": "uuid", "status": "PENDING_PAYMENT",
    "paymentUrl": "/payments/initiate?registrationId=uuid",
    "seatHoldExpiresAt": "ISO8601"
  },
  "meta": { "timestamp": "ISO8601" }
}
```

### GET /registrations/me

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(STUDENT)`

```json
{ "success": true,
  "data": [
    { "id": "uuid", "workshopId": "uuid", "workshopTitle": "...",
      "status": "CONFIRMED", "qrCode": "...", "createdAt": "..." }
  ],
  "meta": { "timestamp": "ISO8601" }
}
```

### GET /registrations?workshopId=uuid (ORGANIZER)

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(ORGANIZER)`

```json
{ "success": true,
  "data": [
    { "id": "uuid", "studentId": "uuid", "studentName": "...",
      "status": "CONFIRMED", "createdAt": "..." }
  ],
  "meta": { "total": 45, "confirmed": 40, "pending": 3, "cancelled": 2, "timestamp": "ISO8601" }
}
```

### DELETE /registrations/:id

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(STUDENT)`

```json
{ "success": true, "data": { "id": "uuid", "status": "CANCELLED" },
  "meta": { "timestamp": "ISO8601" } }
```
