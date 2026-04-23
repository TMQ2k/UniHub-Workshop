# Đặc tả: Payment (Thanh toán)

## Mô tả

Module xử lý thanh toán cho workshop có phí. Sử dụng **mock adapter** với interface thật để dễ swap provider. Tích hợp **Circuit Breaker** để cô lập lỗi payment gateway và **Idempotency Key** để chống double charge.

## Actor

| Actor | Vai trò |
|-------|---------|
| STUDENT | Thanh toán phí workshop, xem trạng thái thanh toán |
| ORGANIZER | Xem lịch sử thanh toán, xem doanh thu |
| Payment Gateway (External) | Xử lý giao dịch thanh toán (mock) |

## Luồng chính

### Luồng 1 — Thanh toán workshop có phí

1. Sau khi đăng ký workshop có phí, registration ở `PENDING_PAYMENT`.
2. Client gửi `POST /payments` với `{ registrationId }` và header `Idempotency-Key: <uuid-v4>`.
3. Server kiểm tra **Idempotency Key** trong Redis:
   - **Đã có**: trả response đã lưu ngay lập tức (không xử lý lại).
   - **Chưa có**: tiếp tục xử lý.
4. Server kiểm tra **Circuit Breaker** state:
   - **OPEN**: reject ngay với `503 PAYMENT_UNAVAILABLE`.
   - **CLOSED / HALF_OPEN**: tiếp tục.
5. Server tạo payment record `status = PROCESSING`.
6. Gọi **PaymentProvider** (interface) → `processPayment(amount, metadata)`.
7. Nếu thành công:
   - Payment `status = COMPLETED`.
   - Registration `status = CONFIRMED`.
   - Sinh QR code.
   - Enqueue notification (xác nhận thanh toán + QR).
   - Lưu response vào Redis với Idempotency Key (TTL 24h).
8. Trả `200 OK` với payment confirmation.

### Luồng 2 — Payment Gateway lỗi (Circuit Breaker)

1. Payment gateway trả lỗi hoặc timeout.
2. Circuit Breaker ghi nhận lỗi.
3. Nếu đạt **5 lỗi liên tiếp trong 30 giây** → CB chuyển sang **OPEN**.
4. Khi CB OPEN:
   - Mọi request payment mới → reject ngay `503 PAYMENT_UNAVAILABLE`.
   - Các tính năng khác (xem workshop, đăng ký miễn phí...) **KHÔNG bị ảnh hưởng**.
5. Sau **60 giây** → CB chuyển sang **HALF_OPEN**.
6. Cho 1 request thử:
   - Thành công → CB trở về **CLOSED**.
   - Thất bại → CB quay lại **OPEN**, đợi thêm 60 giây.

### Luồng 3 — Client retry (Idempotency Key)

1. Client gửi request payment với cùng `Idempotency-Key`.
2. Server tìm key trong Redis → đã tồn tại.
3. Trả response đã lưu trước đó → **không xử lý lại, không trừ tiền lần 2**.

### Luồng 4 — Hoàn tiền (Refund)

1. Khi SV hủy đăng ký hoặc ORGANIZER hủy workshop.
2. Server tạo refund record, gọi `PaymentProvider.refund()`.
3. Update payment `status = REFUNDED`.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP |
|----------|-------|------------|------|
| Payment gateway timeout | CB ghi nhận lỗi, trả lỗi cho client | `PAYMENT_TIMEOUT` | 504 |
| CB đang OPEN | Reject ngay, không gọi gateway | `PAYMENT_UNAVAILABLE` | 503 |
| Idempotency Key trùng | Trả cached response | — | 200 |
| Registration không ở PENDING_PAYMENT | Từ chối | `INVALID_PAYMENT_STATE` | 400 |
| Seat hold đã hết hạn (15 phút) | Từ chối, yêu cầu đăng ký lại | `SEAT_HOLD_EXPIRED` | 400 |
| Refund gateway lỗi | Retry 3 lần qua BullMQ, nếu vẫn lỗi → alert ORGANIZER | `REFUND_FAILED` | 500 |

## Ràng buộc

### Circuit Breaker
- **Threshold mở**: 5 lỗi liên tiếp trong 30 giây.
- **Reset timeout**: 60 giây ở OPEN trước khi thử HALF_OPEN.
- **Isolation**: Chỉ ảnh hưởng payment, không ảnh hưởng module khác.

### Idempotency Key
- Format: UUID v4, gửi qua header `Idempotency-Key`.
- Lưu trữ: Redis, TTL = **24 giờ**.
- Value: serialized response (status + body).
- Mỗi request payment **bắt buộc** có Idempotency Key, thiếu → 400.

### Payment Provider Interface
```
interface PaymentProvider {
  processPayment(amount: number, metadata: PaymentMetadata): Promise<PaymentResult>;
  refund(transactionId: string, amount: number): Promise<RefundResult>;
  getStatus(transactionId: string): Promise<PaymentStatus>;
}
```
- `MockPaymentProvider` implement interface này cho development.
- Swap sang VNPay/Momo = tạo class mới implement cùng interface (**OCP**).

### Hiệu năng
- Payment respond < **3 giây** (bao gồm gateway call).
- Idempotency check < **10ms** (Redis lookup).

## Tiêu chí chấp nhận

- [ ] SV thanh toán thành công → registration CONFIRMED, nhận QR code.
- [ ] Client retry với cùng Idempotency Key → nhận cached response, tiền không bị trừ lần 2.
- [ ] Payment gateway lỗi 5 lần liên tiếp → CB OPEN → request mới bị reject 503.
- [ ] Khi CB OPEN: xem workshop, đăng ký miễn phí vẫn hoạt động bình thường.
- [ ] Sau 60 giây CB thử HALF_OPEN → nếu gateway OK → CB CLOSED.
- [ ] Request thiếu Idempotency Key → 400.
- [ ] Seat hold hết 15 phút → payment bị từ chối.

## API Contract

### POST /payments

**Headers:**
- `Authorization: Bearer <accessToken>` (STUDENT)
- `Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000`

```json
// Request
{ "registrationId": "uuid" }

// Response 200
{ "success": true,
  "data": {
    "id": "uuid",
    "registrationId": "uuid",
    "amount": 50000,
    "currency": "VND",
    "status": "COMPLETED",
    "transactionId": "mock_txn_123",
    "paidAt": "2026-04-22T07:05:00Z"
  }
}

// Response 503 (CB OPEN)
{ "success": false,
  "error": { "code": "PAYMENT_UNAVAILABLE",
    "message": "Hệ thống thanh toán tạm thời không khả dụng. Vui lòng thử lại sau." }
}
```

### GET /payments/:registrationId

```json
// Response 200
{ "success": true,
  "data": {
    "id": "uuid", "amount": 50000, "status": "COMPLETED",
    "transactionId": "mock_txn_123", "paidAt": "..."
  }
}
```

### GET /payments/stats (ORGANIZER)

```json
// Response 200
{ "success": true,
  "data": {
    "totalRevenue": 2500000,
    "totalTransactions": 50,
    "completedPayments": 48,
    "refundedPayments": 2
  }
}
```
