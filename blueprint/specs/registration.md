# Đặc tả: Registration (Đăng ký workshop)

## Mô tả

Module xử lý đăng ký chỗ ngồi workshop. Đảm bảo **không tranh chấp chỗ ngồi** khi hàng trăm sinh viên đăng ký cùng lúc bằng **Pessimistic Lock** kết hợp database transaction. Sau đăng ký thành công, sinh viên nhận **mã QR** để check-in.

## Actor

| Actor | Vai trò |
|-------|---------|
| STUDENT | Đăng ký workshop, xem đăng ký của mình, hủy đăng ký |
| ORGANIZER | Xem tất cả đăng ký, xem thống kê |

## Luồng chính

### Luồng 1 — Đăng ký workshop miễn phí

1. STUDENT chọn workshop, bấm "Đăng ký".
2. Client gửi `POST /registrations` với `{ workshopId }`.
3. Server bắt đầu **database transaction**:
   a. `SELECT ... FOR UPDATE` trên workshop row (Pessimistic Lock).
   b. Kiểm tra `availableSeats > 0`.
   c. Kiểm tra STUDENT chưa đăng ký workshop này.
   d. Kiểm tra workshop không trùng lịch với workshop đã đăng ký.
   e. Giảm `availableSeats -= 1`.
   f. Tạo registration record `status = CONFIRMED`.
   g. Sinh **QR code** (chứa `registrationId` + `studentId` + HMAC signature).
   h. Commit transaction.
4. Enqueue notification job (email + app push xác nhận).
5. Trả `201 Created` với registration + QR code data.

### Luồng 2 — Đăng ký workshop có phí

1. Bước 1–3 giống Luồng 1, nhưng ở bước (f) set `status = PENDING_PAYMENT`.
2. Giữ chỗ (seat reserved) trong **15 phút**.
3. Redirect sinh viên sang Payment flow (xem `payment.md`).
4. Khi payment thành công → callback cập nhật `status = CONFIRMED`, sinh QR.
5. Nếu payment timeout (15 phút) → tự động hủy registration, trả lại chỗ.

### Luồng 3 — Hủy đăng ký (STUDENT)

1. STUDENT chọn đăng ký cần hủy.
2. Client gửi `DELETE /registrations/:id`.
3. Server kiểm tra:
   - Registration thuộc về STUDENT đang đăng nhập.
   - Workshop chưa bắt đầu (hoặc còn trong thời hạn hủy: ≥ 2 giờ trước giờ bắt đầu).
4. Database transaction: set `status = CANCELLED`, tăng `availableSeats += 1`.
5. Nếu đã thanh toán → enqueue refund job.
6. Trả `200 OK`.

### Luồng 4 — Xem đăng ký của mình (STUDENT)

1. `GET /registrations/me` → trả danh sách đăng ký của STUDENT, bao gồm QR code data.

### Luồng 5 — Xem tất cả đăng ký (ORGANIZER)

1. `GET /registrations?workshopId=...` → trả danh sách đăng ký cho workshop cụ thể.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP |
|----------|-------|------------|------|
| Workshop hết chỗ | Từ chối ngay | `WORKSHOP_FULL` | 409 |
| SV đã đăng ký workshop này | Từ chối | `ALREADY_REGISTERED` | 409 |
| Workshop trùng lịch với workshop đã đăng ký | Từ chối | `SCHEDULE_CONFLICT` | 409 |
| Workshop chưa PUBLISHED | Từ chối | `WORKSHOP_NOT_AVAILABLE` | 400 |
| Workshop đã bắt đầu | Từ chối | `WORKSHOP_STARTED` | 400 |
| Hủy đăng ký < 2 giờ trước giờ bắt đầu | Từ chối | `CANCELLATION_DEADLINE_PASSED` | 400 |
| Payment timeout (15 phút) | Tự động hủy registration, trả chỗ | — | — |
| Database lock timeout | Retry 1 lần, nếu vẫn lỗi trả 503 | `SERVICE_UNAVAILABLE` | 503 |

## Ràng buộc

### Tính nhất quán (Consistency)
- **Bắt buộc Pessimistic Lock** (`SELECT ... FOR UPDATE`) cho thao tác trừ chỗ ngồi.
- Toàn bộ logic đăng ký (check seats → trừ seats → tạo record) trong **cùng 1 transaction**.
- Không bao giờ xảy ra `availableSeats < 0` (over-booking = zero tolerance).

### Hiệu năng
- Registration endpoint respond < **1 giây** kể cả dưới tải 120 req/s.
- Rate limit `POST /registrations`: **10 req/min per IP**.

### QR Code
- Chứa: `registrationId`, `studentId`, `workshopId`.
- Ký bằng **HMAC-SHA256** với secret key để chống giả mạo.
- Format: Base64 encoded JSON string.

### Seat hold cho payment
- Chỗ ngồi được giữ **15 phút** cho workshop có phí.
- Cron job chạy mỗi phút: tìm registration `PENDING_PAYMENT` quá 15 phút → tự động hủy.

## Tiêu chí chấp nhận

- [ ] SV đăng ký workshop miễn phí thành công, nhận QR code.
- [ ] SV đăng ký workshop có phí → status = PENDING_PAYMENT, chỗ được giữ 15 phút.
- [ ] 100 SV đăng ký cùng lúc workshop 60 chỗ → chỉ 60 SV thành công, 40 nhận WORKSHOP_FULL.
- [ ] Không bao giờ xảy ra `availableSeats < 0`.
- [ ] SV không đăng ký trùng workshop hoặc trùng lịch.
- [ ] SV hủy đăng ký → chỗ ngồi được trả lại, `availableSeats += 1`.
- [ ] Payment timeout → registration tự động hủy, chỗ trả lại.

## API Contract

### POST /registrations

**Headers:** `Authorization: Bearer <accessToken>` (STUDENT)

```json
// Request
{ "workshopId": "uuid" }

// Response 201 (miễn phí)
{ "success": true,
  "data": {
    "id": "uuid", "workshopId": "uuid", "studentId": "uuid",
    "status": "CONFIRMED",
    "qrCode": "eyJyZWdpc3RyYXRpb25JZCI6...",
    "createdAt": "2026-04-22T07:00:00Z"
  }
}

// Response 201 (có phí)
{ "success": true,
  "data": {
    "id": "uuid", "status": "PENDING_PAYMENT",
    "paymentUrl": "/payments/initiate?registrationId=uuid",
    "seatHoldExpiresAt": "2026-04-22T07:15:00Z"
  }
}
```

### GET /registrations/me

```json
// Response 200
{ "success": true,
  "data": [
    { "id": "uuid", "workshopId": "uuid", "workshopTitle": "...",
      "status": "CONFIRMED", "qrCode": "...", "createdAt": "..." }
  ]
}
```

### GET /registrations?workshopId=uuid (ORGANIZER)

```json
// Response 200
{ "success": true,
  "data": [...],
  "meta": { "total": 45, "confirmed": 40, "pending": 3, "cancelled": 2 }
}
```

### DELETE /registrations/:id

```json
// Response 200
{ "success": true, "data": { "id": "uuid", "status": "CANCELLED" } }
```
