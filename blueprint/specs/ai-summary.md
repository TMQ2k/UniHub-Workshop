# Đặc tả: AI Summary (Tóm tắt Workshop bằng AI)

## Mô tả

Cho phép ORGANIZER upload tài liệu workshop (PDF) và sử dụng **Anthropic Claude API** để tạo bản tóm tắt tự động. Tóm tắt được hiển thị trên trang chi tiết workshop, giúp sinh viên nắm nhanh nội dung. Hỗ trợ **streaming response** cho UX mượt.

---

## Actor

| Actor | Hành động |
|-------|-----------|
| **ORGANIZER** | Upload PDF, trigger tóm tắt, xem/sửa kết quả |
| **STUDENT** | Xem tóm tắt trên trang workshop |
| **Hệ thống** | Gọi Claude API, stream kết quả, lưu cache |

---

## Luồng chính

### LC-01: Upload PDF và tạo tóm tắt

```
1. ORGANIZER gửi POST /workshops/:id/summary (multipart/form-data, file PDF)
2. Server validate:
   a. Workshop tồn tại, user là ORGANIZER
   b. File là PDF, size ≤ 10MB
   c. Workshop chưa có summary hoặc cho phép overwrite
3. Lưu file vào storage (local disk hoặc S3)
4. Tạo job trong BullMQ queue 'ai-summary':
   { workshopId, filePath, userId }
5. Trả 202 Accepted (xử lý bất đồng bộ)
```

### LC-02: Worker xử lý tóm tắt

```
1. Worker pick up job từ queue
2. Đọc file PDF
3. Gọi Anthropic Claude API:
   - Model: claude-sonnet (hoặc config)
   - System prompt: "Tóm tắt nội dung workshop bằng tiếng Việt,
     giữ các điểm chính, format markdown, tối đa 500 từ"
   - Attach PDF content
4. Nhận response (streaming)
5. Lưu kết quả vào database: workshop.aiSummary
6. Cập nhật status: COMPLETED
7. Nếu lỗi → retry 2 lần, sau đó mark FAILED
```

### LC-03: Xem tóm tắt (Streaming)

```
1. Client gửi GET /workshops/:id/summary
2. Nếu summary đã có (cached) → trả ngay
3. Nếu đang xử lý → trả status PROCESSING
4. Client có thể subscribe SSE endpoint để nhận streaming updates
```

### LC-04: Regenerate tóm tắt

```
1. ORGANIZER gửi POST /workshops/:id/summary/regenerate
2. Xóa summary cũ, tạo job mới trong queue
3. Trả 202 Accepted
```

---

## Kịch bản lỗi

| # | Kịch bản | Xử lý | HTTP | Error Code |
|---|----------|--------|------|------------|
| E-01 | File không phải PDF | Reject | 400 | `INVALID_FILE_TYPE` |
| E-02 | File > 10MB | Reject | 400 | `FILE_TOO_LARGE` |
| E-03 | Claude API rate limit | Retry với backoff | 503 | `AI_SERVICE_BUSY` |
| E-04 | Claude API error | Retry 2 lần, mark FAILED | 500 | `AI_PROCESSING_FAILED` |
| E-05 | PDF corrupt/unreadable | Mark FAILED, notify organizer | 422 | `UNREADABLE_PDF` |
| E-06 | Workshop không tồn tại | 404 | 404 | `WORKSHOP_NOT_FOUND` |

---

## Ràng buộc

- **File size**: max 10MB
- **File type**: PDF only (Phase 1)
- **Summary length**: tối đa 500 từ
- **Language**: tiếng Việt
- **Processing**: bất đồng bộ qua BullMQ (không block request)
- **Retry**: 2 lần cho Claude API failures
- **Cache**: summary lưu trong DB, không gọi API lại trừ khi regenerate
- **API Key**: từ env `ANTHROPIC_API_KEY` (không hardcode)
- **Concurrency**: max 3 AI jobs đồng thời (tránh rate limit)

---

## Tiêu chí chấp nhận

- [ ] Upload PDF → job được tạo, trả 202
- [ ] Worker xử lý → summary lưu vào DB
- [ ] SV xem workshop → thấy AI summary
- [ ] File không phải PDF → reject 400
- [ ] File > 10MB → reject 400
- [ ] Claude API lỗi → retry 2 lần
- [ ] Regenerate → summary mới thay thế cũ
- [ ] STUDENT không upload được (403)

---

## API Contract

### POST `/workshops/:id/summary` — Auth: ORGANIZER
```
Content-Type: multipart/form-data
Body: file (PDF, max 10MB)
```
```json
// Response 202
{ "success": true, "data": {
    "workshopId": "uuid", "status": "PROCESSING",
    "message": "Đang xử lý tóm tắt, vui lòng chờ..." } }
```

### GET `/workshops/:id/summary` — Auth: Public
```json
// Response 200 (completed)
{ "success": true, "data": {
    "workshopId": "uuid", "status": "COMPLETED",
    "summary": "## Nội dung chính\n\n- Điểm 1...\n- Điểm 2...",
    "generatedAt": "2026-04-22T12:10:00Z",
    "wordCount": 350 } }

// Response 200 (processing)
{ "success": true, "data": {
    "workshopId": "uuid", "status": "PROCESSING",
    "summary": null } }
```

### POST `/workshops/:id/summary/regenerate` — Auth: ORGANIZER
```json
// Response 202
{ "success": true, "data": {
    "workshopId": "uuid", "status": "PROCESSING" } }
```
