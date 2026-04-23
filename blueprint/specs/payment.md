# Đặc tả: Payment (Thanh toán)

## Mô tả

Module xử lý thanh toán cho workshop có phí. Sử dụng **mock adapter** với interface thật (`IPaymentProvider`) để dễ swap provider. Tích hợp **Circuit Breaker** (in-memory) để cô lập lỗi payment gateway và **Idempotency Key** (Redis via `IdempotencyInterceptor`) để chống double charge.

## Actor

| Actor | Vai trò |
|-------|---------|
| STUDENT | Thanh toán phí workshop |
| ORGANIZER | Xem thống kê thanh toán (doanh thu, số giao dịch) |

## Luồng chính

### Luồng 1 — Thanh toán workshop có phí

1. Sau khi đăng ký workshop có phí, registration ở `PENDING_PAYMENT`.
2. Client gửi `POST /payments` với `{ registrationId }` và header `Idempotency-Key: <uuid-v4>`.
3. **IdempotencyInterceptor** kiểm tra key trong Redis:
   - **Đã có**: trả response đã lưu ngay lập tức (không xử lý lại).
   - **Chưa có**: tiếp tục xử lý, sau khi hoàn tất lưu response vào Redis (TTL 24h).
4. `PaymentService.processPayment()`:
   a. Validate registration tồn tại, thuộc student, status = `PENDING_PAYMENT`.
   b. Kiểm tra seat hold chưa hết hạn (`seatHoldExpiresAt`).
   c. Lấy workshop info (price, title).
   d. Tạo payment record `status = PROCESSING`.
   e. Gọi `CircuitBreaker.execute()`:
      - **OPEN**: reject ngay `CircuitBreakerOpenError` → set payment FAILED → `503 PAYMENT_UNAVAILABLE`.
      - **CLOSED / HALF_OPEN**: gọi `PaymentProvider.processPayment(amount, metadata)`.
   f. Nếu provider trả `success = false`: set FAILED, throw `502 PAYMENT_FAILED`.
   g. Nếu provider thành công:
      - Payment `status = COMPLETED`, ghi `transactionId`, `paidAt`.
      - Gọi `RegistrationService.confirmPayment()` → registration CONFIRMED + sinh QR code.
      - Enqueue notification `PAYMENT_CONFIRMED` (fire-and-forget, `.catch(() => {})`).
   h. Lưu response vào Redis qua IdempotencyInterceptor.
5. Trả `200 OK` với payment confirmation kèm `qrCode`.

### Luồng 2 — Circuit Breaker states

1. **CLOSED**: forward request bình thường. Đếm lỗi liên tiếp.
2. Nếu **5 lỗi liên tiếp trong 30 giây** → chuyển sang **OPEN**.
3. **OPEN**: reject ngay `503 PAYMENT_UNAVAILABLE`. Không gọi gateway. Các tính năng khác **không bị ảnh hưởng**.
4. Sau **60 giây** → chuyển sang **HALF_OPEN** (kiểm tra tự động trong `getState()`).
5. **HALF_OPEN**: cho 1 request thử:
   - Thành công → **CLOSED**, reset failure counter.
   - Thất bại → **OPEN**, đợi thêm 60 giây.

### Luồng 3 — Client retry (Idempotency Key)

1. Client gửi request payment với cùng `Idempotency-Key`.
2. `IdempotencyInterceptor` tìm key trong Redis → đã tồn tại.
3. Trả response đã lưu → **không xử lý lại, không trừ tiền lần 2**.

### Luồng 4 — Xem thanh toán (STUDENT)

1. `GET /payments/:registrationId` → trả payment detail (id, amount, status, transactionId, paidAt).

### Luồng 5 — Thống kê thanh toán (ORGANIZER)

1. `GET /payments/stats` → trả `{ totalRevenue, totalTransactions, completedPayments, refundedPayments }`.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP |
|----------|-------|------------|------|
| CB đang OPEN | Reject ngay, payment set FAILED | `PAYMENT_UNAVAILABLE` | 503 |
| Provider trả success=false | Payment set FAILED | `PAYMENT_FAILED` | 502 |
| Provider timeout/exception | CB ghi nhận lỗi, payment set FAILED | `PAYMENT_TIMEOUT` | 504 |
| Idempotency Key trùng | Trả cached response | — | 200 |
| Registration không ở PENDING_PAYMENT | Từ chối | `INVALID_PAYMENT_STATE` | 400 |
| Seat hold đã hết hạn | Từ chối | `SEAT_HOLD_EXPIRED` | 400 |
| Registration không tồn tại | Từ chối | `REGISTRATION_NOT_FOUND` | 404 |
| Payment không tồn tại | Từ chối | `PAYMENT_NOT_FOUND` | 404 |
| Thiếu Idempotency Key header | Từ chối (IdempotencyInterceptor) | `MISSING_IDEMPOTENCY_KEY` | 400 |

## Ràng buộc

### Circuit Breaker (In-memory)
- **Threshold mở**: 5 lỗi liên tiếp trong 30 giây (`FAILURE_THRESHOLD=5`, `FAILURE_WINDOW_MS=30000`).
- **Reset timeout**: 60 giây (`RESET_TIMEOUT_MS=60000`).
- **Isolation**: Chỉ ảnh hưởng payment, không ảnh hưởng module khác.
- Trạng thái lưu in-memory (reset khi restart app).

### Idempotency Key (Redis via Interceptor)
- Xử lý bằng `IdempotencyInterceptor` (NestJS interceptor).
- Key từ header `Idempotency-Key`.
- Lưu trữ: Redis, TTL = **24 giờ**.
- Thiếu header → 400.
- Database unique constraint trên `payments.idempotency_key` làm safety net.

### Payment Provider Interface
```typescript
interface IPaymentProvider {
  processPayment(amount: number, metadata: PaymentMetadata): Promise<PaymentResult>;
  refund(transactionId: string, amount: number): Promise<RefundResult>;
  getStatus(transactionId: string): Promise<PaymentStatusResult>;
}
```
- `MockPaymentProvider` implement interface cho development (simulate 100ms delay).
- Swap sang VNPay/Momo = tạo class mới, đổi DI binding trong `PaymentModule` (**OCP + LSP**).
- DI token: `PAYMENT_PROVIDER`.

## Tiêu chí chấp nhận

- [x] SV thanh toán thành công → payment COMPLETED, registration CONFIRMED, nhận QR code.
- [x] Client retry với cùng Idempotency Key → nhận cached response, tiền không bị trừ lần 2.
- [x] Payment gateway lỗi 5 lần liên tiếp → CB OPEN → request mới bị reject 503.
- [x] Khi CB OPEN: xem workshop, đăng ký miễn phí vẫn hoạt động bình thường.
- [x] Sau 60 giây CB thử HALF_OPEN → nếu gateway OK → CB CLOSED.
- [x] Seat hold hết 15 phút → payment bị từ chối (SEAT_HOLD_EXPIRED).
- [x] ORGANIZER xem thống kê thanh toán.

## API Contract

### POST /payments

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(STUDENT)`
**Interceptor:** `IdempotencyInterceptor`

**Headers:**
- `Authorization: Bearer <accessToken>`
- `Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000`

```json
// Request
{ "registrationId": "uuid" }

// Response 200
{ "success": true,
  "data": {
    "id": "uuid", "registrationId": "uuid",
    "amount": 50000, "currency": "VND",
    "status": "COMPLETED", "transactionId": "mock_txn_123",
    "paidAt": "ISO8601", "qrCode": "eyJ..."
  },
  "meta": { "timestamp": "ISO8601" }
}

// Response 503 (CB OPEN)
{ "success": false,
  "error": { "code": "PAYMENT_UNAVAILABLE",
    "message": "Hệ thống thanh toán tạm thời không khả dụng. Vui lòng thử lại sau." }
}
```

### GET /payments/:registrationId (STUDENT)

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(STUDENT)`

```json
{ "success": true,
  "data": {
    "id": "uuid", "amount": 50000, "status": "COMPLETED",
    "transactionId": "mock_txn_123", "paidAt": "..."
  },
  "meta": { "timestamp": "ISO8601" }
}
```

### GET /payments/stats (ORGANIZER)

**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(ORGANIZER)`

```json
{ "success": true,
  "data": {
    "totalRevenue": 2500000, "totalTransactions": 50,
    "completedPayments": 48, "refundedPayments": 2
  },
  "meta": { "timestamp": "ISO8601" }
}
```
