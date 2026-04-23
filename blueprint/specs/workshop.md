# Đặc tả: Workshop Management

## Mô tả

Module quản lý workshop cho "Tuần lễ kỹ năng và nghề nghiệp". Ban tổ chức tạo/sửa/publish/hủy workshop. Sinh viên xem danh sách và chi tiết workshop với **số chỗ còn lại realtime**. Rate limiting bằng **Token Bucket** trên Redis bảo vệ endpoint listing.

## Actor

| Actor | Vai trò |
|-------|---------|
| ORGANIZER | Tạo, sửa, publish, hủy workshop. Xem tất cả workshops (bao gồm DRAFT) |
| STUDENT | Xem danh sách PUBLISHED, xem chi tiết, filter/search |

## Luồng chính

### Luồng 1 — Tạo workshop (ORGANIZER)

1. Điền: tiêu đề, mô tả, diễn giả, phòng, roomMapUrl, thời gian, sức chứa (`maxSeats`), giá vé.
2. Validate: startTime > now, endTime > startTime, không xung đột phòng.
3. `POST /workshops` → tạo `status=DRAFT`, `availableSeats=maxSeats`, `createdBy=userId`.
4. Trả `201 Created`.

### Luồng 2 — Cập nhật workshop (ORGANIZER)

1. `PATCH /workshops/:id` → validate workshop tồn tại, chưa CANCELLED.
2. Nếu đổi thời gian → validate lại schedule hợp lệ.
3. Nếu đổi room/thời gian → kiểm tra xung đột phòng (exclude workshop hiện tại).
4. Nếu giảm `maxSeats`: mới ≥ số đăng ký hiện tại (`maxSeats - availableSeats`).
5. `availableSeats` điều chỉnh: `availableSeats += (newMaxSeats - oldMaxSeats)`.
6. Cập nhật partial — chỉ thay đổi các field được gửi.

### Luồng 3 — Publish workshop (ORGANIZER)

1. `PATCH /workshops/:id/publish` → validate chưa CANCELLED → set `status=PUBLISHED`.

### Luồng 4 — Hủy workshop (ORGANIZER)

1. `DELETE /workshops/:id` → set `status=CANCELLED` (soft delete).
2. Hoàn tiền/thông báo xử lý bởi RegistrationService và NotificationService (SRP).

### Luồng 5 — Xem danh sách (ALL, Rate-limited)

1. `GET /workshops?page=1&limit=20&date=...&free=true&search=...&status=...`
2. `status=all` hiện tất cả (organizer dashboard). Mặc định chỉ PUBLISHED.
3. `free=true` chỉ workshop miễn phí. `search` tìm title/description (case-insensitive).
4. Sắp xếp theo `startTime` ASC.
5. Rate limit: **100 req/min/IP** bằng Token Bucket (`RateLimitGuard` + `@RateLimit`).

### Luồng 6 — Xem chi tiết (ALL)

1. `GET /workshops/:id` (validate UUID bằng `ParseUUIDPipe`).
2. Trả đầy đủ thông tin workshop.

## Kịch bản lỗi

| Kịch bản | Error Code | HTTP |
|----------|------------|------|
| Thời gian bắt đầu trong quá khứ | `INVALID_SCHEDULE` | 400 |
| Thời gian kết thúc ≤ bắt đầu | `INVALID_SCHEDULE` | 400 |
| Cập nhật/publish workshop đã hủy | `WORKSHOP_CANCELLED` | 400 |
| Giảm maxSeats dưới số đăng ký | `SEATS_BELOW_REGISTRATIONS` | 400 |
| Workshop không tồn tại | `WORKSHOP_NOT_FOUND` | 404 |
| STUDENT cố tạo/sửa/hủy | `FORBIDDEN` | 403 |
| Xung đột phòng cùng giờ | `ROOM_CONFLICT` | 409 |

## Ràng buộc

- Status lifecycle: `DRAFT` → `PUBLISHED` → `CANCELLED` (không quay lại).
- `availableSeats` cập nhật realtime (giảm khi registration, tăng khi cancel).
- Soft delete: CANCELLED không xóa khỏi DB.
- Rate limit listing: **100 req/min/IP** bằng Token Bucket trên Redis.
- Endpoint write yêu cầu `JwtAuthGuard + RolesGuard` với role `ORGANIZER`.
- Param `id` validate bằng `ParseUUIDPipe`.

## Tiêu chí chấp nhận

- [x] ORGANIZER tạo workshop mới (DRAFT), cập nhật (partial), publish, hủy (soft delete).
- [x] STUDENT xem danh sách PUBLISHED với filter/search/pagination.
- [x] ORGANIZER xem tất cả workshops (status=all).
- [x] STUDENT không thể tạo/sửa/hủy (403).
- [x] Không tạo 2 workshop cùng phòng cùng giờ (409).
- [x] Rate limit 100 req/min trên GET /workshops.

## API Contract

### POST /workshops
**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(ORGANIZER)`
```json
// Request
{ "title": "string", "description": "string", "speaker": "string",
  "room": "string", "roomMapUrl": "string",
  "startTime": "ISO8601", "endTime": "ISO8601", "maxSeats": 60, "price": 0 }
// Response 201
{ "success": true, "data": { "id": "uuid", "status": "DRAFT", "availableSeats": 60, "createdBy": "uuid", ... },
  "meta": { "timestamp": "ISO8601" } }
```

### GET /workshops
**Guards:** `RateLimitGuard` — `@RateLimit({ maxTokens: 100, windowSeconds: 60 })`
```
?page=1&limit=20&date=2026-05-10&free=true&search=resume&status=all
```
```json
{ "success": true, "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "timestamp": "ISO8601" } }
```

### GET /workshops/:id
```json
{ "success": true, "data": { "id": "uuid", "title": "...", "availableSeats": 45, ... },
  "meta": { "timestamp": "ISO8601" } }
```

### PATCH /workshops/:id
**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(ORGANIZER)`
```json
// Request (partial update)
{ "room": "B.201", "startTime": "ISO8601" }
// Response 200
{ "success": true, "data": { ... }, "meta": { "timestamp": "ISO8601" } }
```

### PATCH /workshops/:id/publish
**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(ORGANIZER)`
```json
{ "success": true, "data": { "id": "uuid", "status": "PUBLISHED", ... }, "meta": { "timestamp": "ISO8601" } }
```

### DELETE /workshops/:id
**Guards:** `JwtAuthGuard`, `RolesGuard` — `@Roles(ORGANIZER)`
```json
{ "success": true, "data": { "id": "uuid", "status": "CANCELLED", ... }, "meta": { "timestamp": "ISO8601" } }
```
