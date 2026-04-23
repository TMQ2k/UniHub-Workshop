# Đặc tả: AI Summary

## Mô tả

Module cho phép ban tổ chức upload file **PDF** giới thiệu workshop. Hệ thống tự động xử lý: tách nội dung, làm sạch văn bản, gửi sang **Anthropic Claude API** để tạo bản tóm tắt hiển thị trên trang chi tiết workshop.

## Actor

| Actor | Vai trò |
|-------|---------|
| ORGANIZER | Upload PDF giới thiệu workshop |
| STUDENT | Xem tóm tắt AI trên trang chi tiết workshop |
| Anthropic Claude API (External) | Xử lý nội dung, tạo tóm tắt |

## Luồng chính

### Luồng 1 — Upload PDF và tạo summary

1. ORGANIZER chọn workshop, upload file PDF.
2. Client gửi `POST /workshops/:id/ai-summary` (multipart/form-data).
3. Server validate:
   - File là PDF.
   - Kích thước ≤ **10MB**.
   - Workshop tồn tại, thuộc quyền ORGANIZER.
4. Server lưu PDF lên disk (hoặc local storage).
5. Enqueue job vào **BullMQ** ai-summary queue.
6. Trả `202 Accepted` (processing bất đồng bộ).
7. Queue worker xử lý:
   a. Tách text từ PDF (dùng pdf-parse library).
   b. Làm sạch: bỏ header/footer, page numbers, normalize whitespace.
   c. Nếu text quá dài → chunk (max 50.000 chars).
   d. Gọi **Anthropic Claude API** với prompt tóm tắt + streaming response.
   e. Lưu summary vào DB, liên kết với workshop.
   f. Update workshop record `aiSummaryStatus = COMPLETED`.

### Luồng 2 — Xem summary

1. STUDENT/ORGANIZER truy cập `GET /workshops/:id`.
2. Response bao gồm field `aiSummary` (string) nếu đã có.
3. Nếu đang xử lý: `aiSummaryStatus = PROCESSING`.

### Luồng 3 — Regenerate summary

1. ORGANIZER upload PDF mới hoặc bấm "Tạo lại".
2. `POST /workshops/:id/ai-summary` → xóa summary cũ, enqueue job mới.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP |
|----------|-------|------------|------|
| File không phải PDF | Từ chối | `INVALID_FILE_TYPE` | 400 |
| File > 10MB | Từ chối | `FILE_TOO_LARGE` | 400 |
| PDF không extract được text | Mark FAILED, thông báo ORGANIZER | `PDF_PARSE_FAILED` | — |
| Claude API rate limit | Retry với exponential backoff (3 lần) | `AI_RATE_LIMITED` | — |
| Claude API timeout | Retry 2 lần, nếu vẫn lỗi → mark FAILED | `AI_TIMEOUT` | — |
| Claude API key invalid | Log error, alert admin | `AI_AUTH_FAILED` | — |

## Ràng buộc

- **Bất đồng bộ**: PDF processing qua BullMQ, không block request.
- **File size**: Tối đa **10MB** per PDF.
- **AI Model**: Anthropic Claude API (hỗ trợ xử lý PDF natively).
- **Summary length**: Tối đa **500 từ**.
- **Ngôn ngữ**: Summary sinh ra bằng **tiếng Việt**.
- **Rate limit**: Tối đa **10 AI requests/phút** (tránh vượt API quota).
- **Storage**: PDF lưu local filesystem, path lưu trong DB.
- API key lưu trong biến môi trường `ANTHROPIC_API_KEY`, không hardcode.

## Tiêu chí chấp nhận

- [ ] ORGANIZER upload PDF → nhận 202 Accepted, summary được tạo bất đồng bộ.
- [ ] Summary hiển thị trên trang chi tiết workshop.
- [ ] File không phải PDF → bị từ chối 400.
- [ ] File > 10MB → bị từ chối 400.
- [ ] Claude API lỗi → retry 3 lần, nếu vẫn lỗi → mark FAILED.
- [ ] STUDENT không upload được PDF (403).

## API Contract

### POST /workshops/:id/ai-summary

**Headers:** `Authorization: Bearer <accessToken>` (ORGANIZER)  
**Content-Type:** `multipart/form-data`

```json
// Response 202
{ "success": true,
  "data": {
    "workshopId": "uuid",
    "aiSummaryStatus": "PROCESSING",
    "message": "PDF đang được xử lý. Tóm tắt sẽ sẵn sàng trong vài phút."
  }
}
```

### GET /workshops/:id/ai-summary

```json
// Response 200 (completed)
{ "success": true,
  "data": {
    "workshopId": "uuid",
    "summary": "Workshop hướng dẫn sinh viên kỹ năng viết CV...",
    "status": "COMPLETED",
    "generatedAt": "2026-04-22T07:10:00Z"
  }
}

// Response 200 (processing)
{ "success": true,
  "data": { "workshopId": "uuid", "status": "PROCESSING", "summary": null }
}
```
