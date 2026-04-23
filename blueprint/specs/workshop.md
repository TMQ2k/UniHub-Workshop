# Đặc tả: Workshop Management

## Mô tả

Module quản lý workshop cho "Tuần lễ kỹ năng và nghề nghiệp". Ban tổ chức tạo/sửa/hủy workshop. Sinh viên xem danh sách và chi tiết workshop với **số chỗ còn lại realtime**.

## Actor

| Actor | Vai trò |
|-------|---------|
| ORGANIZER | Tạo, sửa, publish, hủy workshop. Xem thống kê |
| STUDENT | Xem danh sách, xem chi tiết, filter/search |

## Luồng chính

### Luồng 1 — Tạo workshop (ORGANIZER)

1. Điền: tiêu đề, mô tả, diễn giả, phòng, thời gian, sức chứa (`maxSeats`), giá vé.
2. `POST /workshops` → validate → tạo workshop `status=DRAFT`, `availableSeats=maxSeats`.
3. Trả `201 Created`.

### Luồng 2 — Cập nhật workshop (ORGANIZER)

1. `PATCH /workshops/:id` → validate workshop tồn tại, chưa CANCELLED.
2. Nếu giảm `maxSeats`: mới ≥ số đăng ký hiện tại.
3. Nếu đổi phòng/giờ → trigger notification cho SV đã đăng ký.

### Luồng 3 — Publish workshop (ORGANIZER)

1. `PATCH /workshops/:id/publish` → validate đủ thông tin → set `status=PUBLISHED`.

### Luồng 4 — Hủy workshop (ORGANIZER)

1. `DELETE /workshops/:id` → set `status=CANCELLED`.
2. Hoàn tiền SV đã thanh toán (workshop có phí).
3. Gửi notification hủy cho tất cả SV đã đăng ký.

### Luồng 5 — Xem danh sách (ALL)

1. `GET /workshops?page=1&limit=20&date=...&free=true&search=...`
2. Trả danh sách PUBLISHED workshops với `availableSeats` realtime.
3. Pagination: default limit=20, max=50.

### Luồng 6 — Xem chi tiết (ALL)

1. `GET /workshops/:id` → trả đầy đủ: mô tả, diễn giả, phòng, sơ đồ, thời gian, giá, AI summary.

## Kịch bản lỗi

| Kịch bản | Error Code | HTTP |
|----------|------------|------|
| Thời gian trong quá khứ | `INVALID_SCHEDULE` | 400 |
| Cập nhật workshop đã hủy | `WORKSHOP_CANCELLED` | 400 |
| Giảm maxSeats dưới số đăng ký | `SEATS_BELOW_REGISTRATIONS` | 400 |
| Workshop không tồn tại | `WORKSHOP_NOT_FOUND` | 404 |
| STUDENT cố tạo/sửa/hủy | `FORBIDDEN` | 403 |
| Xung đột phòng cùng giờ | `ROOM_CONFLICT` | 409 |

## Ràng buộc

- Status lifecycle: `DRAFT` → `PUBLISHED` → `CANCELLED` (không quay lại).
- `maxSeats` ∈ [1, 500]. `availableSeats` cập nhật realtime.
- Soft delete: CANCELLED không xóa khỏi DB.
- Listing respond < **200ms**. Rate limit: **100 req/min/IP**.

## Tiêu chí chấp nhận

- [ ] ORGANIZER tạo/sửa/hủy workshop thành công.
- [ ] Hủy workshop → SV nhận thông báo, workshop có phí được hoàn tiền.
- [ ] STUDENT xem danh sách với filter/search/pagination.
- [ ] STUDENT xem chi tiết bao gồm `availableSeats` realtime.
- [ ] STUDENT không thể tạo/sửa/hủy (403).
- [ ] Không tạo 2 workshop cùng phòng cùng giờ (409).

## API Contract

### POST /workshops
```json
// Request
{ "title": "string", "description": "string", "speaker": "string",
  "room": "string", "roomMapUrl": "string",
  "startTime": "ISO8601", "endTime": "ISO8601",
  "maxSeats": 60, "price": 0 }
// Response 201
{ "success": true, "data": { "id": "uuid", "status": "DRAFT", "availableSeats": 60, ... } }
```

### GET /workshops
```
?page=1&limit=20&date=2026-05-10&free=true&search=resume
```
```json
// Response 200
{ "success": true, "data": [...], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

### GET /workshops/:id
```json
// Response 200 — full detail including aiSummary
{ "success": true, "data": { "id": "uuid", "title": "...", "aiSummary": "...", "availableSeats": 45, ... } }
```

### PATCH /workshops/:id
```json
// Request (partial update)
{ "room": "B.201", "startTime": "ISO8601" }
// Response 200 — updated workshop
```

### PATCH /workshops/:id/publish
```json
// Response 200
{ "success": true, "data": { "id": "uuid", "status": "PUBLISHED" } }
```

### DELETE /workshops/:id
```json
// Response 200
{ "success": true, "data": { "id": "uuid", "status": "CANCELLED" } }
```
