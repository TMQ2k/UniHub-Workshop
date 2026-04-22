# Đặc tả: Registration (Đăng ký Workshop)

## Mô tả

Module xử lý đăng ký chỗ ngồi workshop. Cơ chế **Pessimistic Lock** (SELECT ... FOR UPDATE) đảm bảo không xảy ra tranh chấp khi nhiều sinh viên đăng ký đồng thời. Hỗ trợ hủy đăng ký và sinh mã QR code cho check-in.

---

## Actor

| Actor | Hành động |
|-------|-----------|
| **STUDENT** | Đăng ký, hủy đăng ký, xem registrations của mình |
| **ORGANIZER** | Xem tất cả registrations theo workshop |
| **Hệ thống** | Lock chỗ ngồi, sinh QR code, gửi notification |

---

## Trạng thái Registration

```
PENDING → CONFIRMED → CHECKED_IN
       ↘ CANCELLED
```

| Trạng thái | Mô tả |
|------------|--------|
| `PENDING` | Đăng ký thành công, chờ thanh toán (nếu workshop có phí) |
| `CONFIRMED` | Đã xác nhận (workshop miễn phí: tự động; có phí: sau khi thanh toán) |
| `CHECKED_IN` | Đã check-in tại workshop |
| `CANCELLED` | Sinh viên hủy hoặc workshop bị hủy |

---

## Luồng chính

### LC-01: Đăng ký Workshop (Core — Pessimistic Lock)

```
1. STUDENT gửi POST /registrations với { workshopId }
2. Server mở database transaction:
   a. SELECT workshop FOR UPDATE (pessimistic_write lock)
   b. Kiểm tra: workshop.status = PUBLISHED
   c. Kiểm tra: workshop.availableSeats > 0
   d. Kiểm tra: student chưa đăng ký workshop này
   e. Giảm availableSeats -= 1
   f. Tạo registration record:
      - status = CONFIRMED (nếu fee = 0)
      - status = PENDING (nếu fee > 0, chờ thanh toán)
   g. Sinh QR code (encode: registrationId + studentId + workshopId)
   h. COMMIT transaction
3. Gửi notification xác nhận qua BullMQ (async)
4. Trả về registration + QR code
```

**Lưu ý quan trọng:** Toàn bộ bước 2a–2g nằm trong **cùng một transaction**. Nếu bất kỳ bước nào fail → rollback toàn bộ, chỗ ngồi không bị giảm.

### LC-02: Hủy đăng ký

```
1. STUDENT gửi DELETE /registrations/:id
2. Kiểm tra: registration thuộc student đang đăng nhập
3. Kiểm tra: status ∈ [PENDING, CONFIRMED] (không hủy CHECKED_IN)
4. Kiểm tra: workshop chưa bắt đầu (startTime > now)
5. Trong transaction:
   a. Cập nhật registration.status = CANCELLED
   b. Tăng workshop.availableSeats += 1
   c. COMMIT
6. Gửi notification hủy
```

### LC-03: Xem registrations của tôi

```
1. STUDENT gửi GET /registrations/me
2. Trả về danh sách registrations của student, kèm thông tin workshop
3. Sort: startTime ASC (workshop sắp diễn ra trước)
```

### LC-04: Xem registrations theo workshop (ORGANIZER)

```
1. ORGANIZER gửi GET /workshops/:workshopId/registrations
2. Trả về danh sách students đã đăng ký
3. Hỗ trợ filter theo status
4. Pagination: page + limit
```

---

## Kịch bản lỗi

| # | Kịch bản | Xử lý | HTTP | Error Code |
|---|----------|--------|------|------------|
| E-01 | Workshop hết chỗ | Reject ngay trong transaction | 409 | `WORKSHOP_FULL` |
| E-02 | Đã đăng ký workshop này | Reject (unique constraint) | 409 | `ALREADY_REGISTERED` |
| E-03 | Workshop chưa PUBLISHED | Reject | 400 | `WORKSHOP_NOT_AVAILABLE` |
| E-04 | Workshop không tồn tại | 404 | 404 | `WORKSHOP_NOT_FOUND` |
| E-05 | Hủy registration đã CHECK_IN | Reject | 400 | `CANNOT_CANCEL_CHECKED_IN` |
| E-06 | Hủy sau khi workshop bắt đầu | Reject | 400 | `WORKSHOP_ALREADY_STARTED` |
| E-07 | Hủy registration của người khác | 403 | 403 | `FORBIDDEN` |
| E-08 | Deadlock trong transaction | Retry 1 lần, nếu fail → 500 | 500 | `INTERNAL_ERROR` |
| E-09 | Rate limit (>10 req/min) | 429 | 429 | `TOO_MANY_REQUESTS` |

---

## Ràng buộc

- **Pessimistic Lock bắt buộc** — không dùng optimistic lock hay application-level lock
- **Rate limiting**: POST /registrations — max 10 req/min per IP (Token Bucket)
- **QR Code**: encode dưới dạng JWT hoặc signed string để chống giả mạo
- **Unique constraint**: (student_id, workshop_id) — DB level
- **Deadlock retry**: tối đa 1 lần retry nếu gặp deadlock
- **Không cho phép đăng ký workshop trùng thời gian** (nice-to-have, không bắt buộc Phase 1)

---

## Tiêu chí chấp nhận

- [ ] Đăng ký thành công → availableSeats giảm 1, nhận QR code
- [ ] 100 request đồng thời → không oversell (seats không âm)
- [ ] Đăng ký trùng → trả 409 `ALREADY_REGISTERED`
- [ ] Workshop hết chỗ → trả 409 `WORKSHOP_FULL`
- [ ] Hủy đăng ký → seats tăng lại
- [ ] Không hủy được khi workshop đã bắt đầu
- [ ] Rate limit > 10 req/min → 429
- [ ] ORGANIZER xem được tất cả registrations

---

## API Contract

### POST `/registrations` — Auth: STUDENT
```json
// Request
{ "workshopId": "uuid" }
// Response 201
{ "success": true, "data": {
    "id": "uuid", "workshopId": "uuid", "studentId": "uuid",
    "status": "CONFIRMED", "qrCode": "data:image/png;base64,...",
    "workshop": { "title": "...", "startTime": "...", "location": "..." },
    "createdAt": "2026-04-22T12:00:00Z" } }
```

### DELETE `/registrations/:id` — Auth: STUDENT (owner only)
```json
{ "success": true, "data": { "id": "uuid", "status": "CANCELLED" } }
```

### GET `/registrations/me` — Auth: STUDENT
```json
{ "success": true, "data": [
    { "id": "uuid", "status": "CONFIRMED", "qrCode": "...",
      "workshop": { "title": "...", "startTime": "...", "location": "..." } }
  ] }
```

### GET `/workshops/:workshopId/registrations` — Auth: ORGANIZER
```json
{ "success": true, "data": [
    { "id": "uuid", "student": { "fullName": "...", "studentId": "2021001234" },
      "status": "CONFIRMED", "registeredAt": "..." }
  ], "meta": { "pagination": { "page": 1, "total": 85 } } }
```
