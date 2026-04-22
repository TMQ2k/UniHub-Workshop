# Đặc tả: Payment (Thanh toán)

## Mô tả

Module xử lý thanh toán cho workshop có phí. Sử dụng **Mock Payment Adapter** (interface chuẩn để swap provider thật như VNPay, MoMo). Tích hợp **Circuit Breaker** chống cascade failure và **Idempotency Key** chống double charge.

---

## Actor

| Actor | Hành động |
|-------|-----------|
| **STUDENT** | Thanh toán cho workshop có phí |
| **Hệ thống** | Gọi payment gateway, xử lý callback, Circuit Breaker |
| **Payment Gateway (mock)** | Xử lý giao dịch, trả kết quả |

---

## Trạng thái Payment

```
PENDING → PROCESSING → SUCCESS
                     → FAILED → PENDING (retry)
                     → REFUNDED
```

---

## Luồng chính

### LC-01: Khởi tạo thanh toán

```
1. STUDENT gửi POST /payments với { registrationId } + header Idempotency-Key
2. Server kiểm tra:
   a. Registration tồn tại, thuộc student, status = PENDING
   b. Workshop có fee > 0
   c. Kiểm tra Idempotency-Key trong Redis:
      - Đã có → trả response đã lưu (không xử lý lại)
      - Chưa có → tiếp tục
3. Kiểm tra Circuit Breaker:
   - OPEN → trả 503 SERVICE_UNAVAILABLE ngay
   - CLOSED / HALF_OPEN → tiếp tục
4. Gọi PaymentProvider.createPayment()
5. Lưu payment record: status = PROCESSING
6. Lưu response vào Redis với Idempotency-Key, TTL = 24h
7. Trả về payment URL (redirect user)
```

### LC-02: Payment Callback (Webhook)

```
1. Payment gateway gọi POST /payments/callback
2. Verify signature (chống giả mạo)
3. Tìm payment record theo transactionId
4. Nếu success:
   a. Payment.status = SUCCESS
   b. Registration.status = CONFIRMED
   c. Gửi notification xác nhận
5. Nếu failed:
   a. Payment.status = FAILED
   b. Registration giữ PENDING (cho phép retry)
```

### LC-03: Circuit Breaker Logic

```
State: CLOSED (bình thường)
  → Mỗi request FAILED: failureCount++
  → Nếu failureCount ≥ 5 trong 30s → chuyển OPEN

State: OPEN (chặn request)
  → Reject tất cả request → 503 "payment_unavailable"
  → Sau 60s → chuyển HALF_OPEN

State: HALF_OPEN (thử lại)
  → Cho phép 1 request đi qua
  → SUCCESS → chuyển CLOSED, reset failureCount
  → FAILED → chuyển OPEN, restart timer 60s
```

### LC-04: Idempotency Key Flow

```
1. Client gửi header: Idempotency-Key: <uuid-v4>
2. Server kiểm tra Redis key: idempotency:{key}
3. Chưa có:
   a. Xử lý request
   b. Lưu Redis: { statusCode, body, processedAt } — TTL 24h
   c. Trả response
4. Đã có:
   a. Trả response đã lưu ngay lập tức
   b. Không xử lý lại
```

---

## Kịch bản lỗi

| # | Kịch bản | Xử lý | HTTP | Error Code |
|---|----------|--------|------|------------|
| E-01 | Circuit Breaker OPEN | Reject ngay | 503 | `PAYMENT_UNAVAILABLE` |
| E-02 | Double charge (same idempotency key) | Trả response đã lưu | 200 | — |
| E-03 | Thiếu Idempotency-Key header | Reject | 400 | `MISSING_IDEMPOTENCY_KEY` |
| E-04 | Gateway timeout | Mark FAILED, update CB | 504 | `GATEWAY_TIMEOUT` |
| E-05 | Invalid callback signature | Reject, log alert | 400 | `INVALID_SIGNATURE` |
| E-06 | Payment cho workshop miễn phí | Reject | 400 | `PAYMENT_NOT_REQUIRED` |
| E-07 | Registration không ở PENDING | Reject | 400 | `INVALID_REGISTRATION_STATUS` |

---

## Payment Provider Interface (DIP)

```typescript
interface IPaymentProvider {
  createPayment(dto: CreatePaymentDto): Promise<PaymentResult>;
  verifyCallback(payload: CallbackPayload): Promise<boolean>;
  refund(transactionId: string): Promise<RefundResult>;
}
```

- `MockPaymentProvider` implements `IPaymentProvider` — dùng cho dev/test
- `VNPayProvider` implements `IPaymentProvider` — swap khi production (Phase 2)
- Inject qua NestJS DI, switch bằng config (không sửa code)

---

## Ràng buộc

- **Idempotency Key bắt buộc** cho POST /payments
- **Circuit Breaker thresholds**: 5 failures / 30s → OPEN; reset sau 60s
- **Idempotency TTL**: 24 giờ trong Redis
- **Mock adapter** trả SUCCESS sau 1–3s delay (simulate thật)
- **Không lưu thông tin thẻ** — redirect sang payment gateway
- **Tính năng khác KHÔNG bị ảnh hưởng** khi Circuit Breaker OPEN

---

## Tiêu chí chấp nhận

- [ ] Thanh toán thành công → registration chuyển CONFIRMED
- [ ] Gửi cùng Idempotency-Key 2 lần → chỉ xử lý 1 lần
- [ ] Thiếu Idempotency-Key → 400
- [ ] 5 failures liên tiếp → Circuit Breaker OPEN → 503
- [ ] Sau 60s OPEN → HALF_OPEN → 1 request thành công → CLOSED
- [ ] Registration/workshop/check-in hoạt động bình thường khi CB OPEN
- [ ] Mock provider có thể swap bằng real provider qua config

---

## API Contract

### POST `/payments` — Auth: STUDENT
**Headers:** `Idempotency-Key: <uuid-v4>`
```json
// Request
{ "registrationId": "uuid" }
// Response 201
{ "success": true, "data": {
    "id": "uuid", "amount": 50000, "currency": "VND",
    "status": "PROCESSING", "paymentUrl": "https://mock-pay.local/checkout/abc123",
    "expiresAt": "2026-04-22T12:30:00Z" } }
```

### POST `/payments/callback` — Auth: Payment Gateway (verify signature)
```json
// Request (from gateway)
{ "transactionId": "abc123", "status": "SUCCESS", "amount": 50000,
  "signature": "hmac-sha256-signature" }
// Response 200
{ "success": true }
```

### GET `/payments/:id` — Auth: STUDENT (owner)
```json
{ "success": true, "data": {
    "id": "uuid", "registrationId": "uuid", "amount": 50000,
    "status": "SUCCESS", "paidAt": "2026-04-22T12:05:00Z" } }
```
