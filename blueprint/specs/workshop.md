# Đặc tả: Workshop Management

## Mô tả

Module quản lý workshop — cho phép ORGANIZER tạo, sửa, hủy workshop và xem thống kê. STUDENT xem danh sách workshop công khai với filter và search. Đây là module trung tâm, cung cấp dữ liệu cho Registration, Check-in, và AI Summary.

---

## Actor

| Actor | Hành động |
|-------|-----------|
| **ORGANIZER** | Tạo, sửa, xóa mềm, hủy workshop; xem thống kê |
| **STUDENT** | Xem danh sách, xem chi tiết workshop |
| **Hệ thống** | Tự động cập nhật trạng thái workshop theo thời gian |

---

## Trạng thái Workshop (State Machine)

```
DRAFT → PUBLISHED → ONGOING → COMPLETED
                  ↘ CANCELLED
```

| Trạng thái | Mô tả | Chuyển bởi |
|------------|--------|------------|
| `DRAFT` | Chưa hiển thị cho SV | Mặc định khi tạo |
| `PUBLISHED` | SV có thể đăng ký | ORGANIZER publish |
| `ONGOING` | Đang diễn ra | Hệ thống (cron theo startTime) |
| `COMPLETED` | Đã kết thúc | Hệ thống (cron theo endTime) |
| `CANCELLED` | Bị hủy | ORGANIZER |

**Quy tắc:**
- Chỉ `PUBLISHED` cho phép đăng ký
- Hủy `PUBLISHED` → notification cho tất cả đã đăng ký
- Không thể hủy `ONGOING`
- `COMPLETED` / `CANCELLED` là terminal state

---

## Luồng chính

### LC-01: Tạo Workshop
1. ORGANIZER gửi `POST /workshops`
2. Validate: startTime ở tương lai, endTime > startTime, maxSeats ∈ [1, 300]
3. Tạo workshop: status=DRAFT, availableSeats=maxSeats
4. Trả về workshop

### LC-02: Cập nhật Workshop
1. ORGANIZER gửi `PATCH /workshops/:id`
2. Kiểm tra: tồn tại, status là DRAFT|PUBLISHED, maxSeats ≥ số đã đăng ký
3. Cập nhật — nếu đổi thời gian/địa điểm → trigger notification

### LC-03: Publish Workshop
1. `POST /workshops/:id/publish`
2. Kiểm tra status=DRAFT → chuyển PUBLISHED

### LC-04: Hủy Workshop
1. `POST /workshops/:id/cancel`
2. Kiểm tra status=PUBLISHED
3. Chuyển CANCELLED, hoàn seats, hủy registrations, gửi notification

### LC-05: Xem danh sách (Public)
1. `GET /workshops` — trả workshop PUBLISHED|ONGOING
2. Filter: date, status, search (ILIKE)
3. Pagination: page + limit (default 1/10, max 50)
4. Sort: startTime ASC

### LC-06: Chi tiết Workshop
1. `GET /workshops/:id` — trả đầy đủ info + AI summary nếu có

### LC-07: Dashboard thống kê
1. `GET /workshops/stats` — tổng workshop/status, tổng đăng ký, fill rate, check-in rate, top 5

---

## Kịch bản lỗi

| # | Kịch bản | HTTP | Error Code |
|---|----------|------|------------|
| E-01 | Workshop không tồn tại | 404 | `WORKSHOP_NOT_FOUND` |
| E-02 | Sửa COMPLETED workshop | 400 | `WORKSHOP_NOT_EDITABLE` |
| E-03 | Hủy ONGOING workshop | 400 | `CANNOT_CANCEL_ONGOING` |
| E-04 | maxSeats < số đã đăng ký | 400 | `SEATS_BELOW_REGISTERED` |
| E-05 | startTime ở quá khứ | 400 | `INVALID_START_TIME` |
| E-06 | endTime ≤ startTime | 400 | `INVALID_TIME_RANGE` |
| E-07 | STUDENT cố tạo workshop | 403 | `FORBIDDEN` |

---

## Ràng buộc

- `MAX_SEATS_PER_WORKSHOP = 300`
- Tên: 5–200 ký tự; Mô tả: max 2000 ký tự
- Soft delete (đánh dấu `deletedAt`)
- Cron chuyển trạng thái mỗi phút
- Rate limiting: GET /workshops — 100 req/min per IP

---

## Tiêu chí chấp nhận

- [ ] ORGANIZER tạo workshop → status=DRAFT
- [ ] Publish → SV thấy trong danh sách
- [ ] Cancel → registrations hủy + notification
- [ ] Không hủy được ONGOING
- [ ] Filter/search/pagination hoạt động
- [ ] STUDENT không tạo/sửa/xóa (403)
- [ ] Stats trả dữ liệu chính xác

---

## API Contract

### POST `/workshops` — Auth: ORGANIZER
```json
// Request
{ "title": "CV Writing", "description": "...", "startTime": "2026-05-10T09:00:00Z",
  "endTime": "2026-05-10T11:00:00Z", "location": "Hội trường A", "maxSeats": 100,
  "fee": 0, "tags": ["career"] }
// Response 201
{ "success": true, "data": { "id": "uuid", "status": "DRAFT", "availableSeats": 100 } }
```

### GET `/workshops` — Auth: Public
```
?page=1&limit=10&date=2026-05-10&search=CV&status=PUBLISHED
```
```json
{ "success": true, "data": [...],
  "meta": { "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 } } }
```

### PATCH `/workshops/:id` — Auth: ORGANIZER (partial update)

### POST `/workshops/:id/publish` — Auth: ORGANIZER

### POST `/workshops/:id/cancel` — Auth: ORGANIZER
```json
{ "success": true, "data": { "id": "uuid", "status": "CANCELLED", "cancelledRegistrations": 15 } }
```

### GET `/workshops/stats` — Auth: ORGANIZER
```json
{ "success": true, "data": {
    "totalWorkshops": { "DRAFT": 5, "PUBLISHED": 20, "ONGOING": 3, "COMPLETED": 12 },
    "totalRegistrations": 1850, "averageFillRate": 0.72,
    "averageCheckinRate": 0.85, "topWorkshops": [...] } }
```
