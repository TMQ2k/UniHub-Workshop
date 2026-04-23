# Đặc tả: CSV Sync (Đồng bộ dữ liệu sinh viên)

## Mô tả

Module nhập dữ liệu sinh viên từ file **CSV** được hệ thống quản lý cũ của trường export vào ban đêm. Hệ thống cũ không có API — chỉ có thể đọc CSV theo lịch cố định. UniHub Workshop chạy **cron job lúc 2:00 AM** hàng ngày để nhập dữ liệu, xác thực sinh viên khi đăng ký.

## Actor

| Actor | Vai trò |
|-------|---------|
| System (Cron) | Tự động trigger import lúc 2:00 AM |
| Legacy Student System | Export CSV vào `/data/import/` hàng đêm |
| ORGANIZER | Xem log kết quả import, trigger import thủ công |

## Luồng chính

### Luồng 1 — Import tự động (Cron 2:00 AM)

1. Cron job trigger lúc **2:00 AM** hàng ngày.
2. Quét thư mục `/data/import/` tìm file `students_{YYYYMMDD}.csv`.
3. Nếu không có file mới → log "No new file", kết thúc.
4. Enqueue job vào **BullMQ** csv-import queue.
5. Queue worker xử lý:
   a. **Validate header**: kiểm tra các cột bắt buộc tồn tại.
      - Nếu header sai → **abort toàn bộ file**, log lỗi, kết thúc.
   b. **Parse từng row**:
      - Validate data types, required fields.
      - Row lỗi → **skip row** (không abort toàn bộ), ghi log row lỗi + lý do.
      - Row hợp lệ → tiếp tục.
   c. **Upsert** theo `student_id`:
      - Nếu chưa tồn tại → INSERT (tạo user mới, role = STUDENT, mật khẩu mặc định).
      - Nếu đã tồn tại → UPDATE (cập nhật name, email, faculty, ...).
   d. **Log kết quả**: tổng rows, inserted, updated, skipped, failed.
6. Di chuyển file đã xử lý sang `/data/import/processed/`.

### Luồng 2 — Import thủ công (ORGANIZER)

1. ORGANIZER gửi `POST /csv-sync/trigger` (hoặc upload CSV trực tiếp).
2. Server enqueue job tương tự Luồng 1.
3. Trả `202 Accepted`.

### Luồng 3 — Xem log import

1. ORGANIZER gửi `GET /csv-sync/logs`.
2. Trả danh sách import logs với kết quả chi tiết.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code |
|----------|-------|------------|
| Header CSV sai format | Abort toàn bộ file, log lỗi | `INVALID_CSV_HEADER` |
| Row thiếu student_id | Skip row, ghi log | `MISSING_STUDENT_ID` |
| Row email invalid format | Skip row, ghi log | `INVALID_EMAIL` |
| Duplicate student_id trong cùng file | Lấy row cuối cùng (last-wins) | — |
| File CSV rỗng (chỉ có header) | Log "empty file", kết thúc | `EMPTY_CSV` |
| File CSV quá lớn (> 100MB) | Từ chối, log lỗi | `FILE_TOO_LARGE` |
| DB connection lost giữa import | Retry job, rollback partial changes | `DB_CONNECTION_LOST` |
| Cron job crash | BullMQ auto-retry job | — |

## Ràng buộc

### CSV Format

```csv
student_id,full_name,email,faculty,enrollment_year
21127001,Nguyễn Văn A,21127001@student.hcmus.edu.vn,CNTT,2021
21127002,Trần Thị B,21127002@student.hcmus.edu.vn,CNTT,2021
```

Các cột bắt buộc: `student_id`, `full_name`, `email`  
Các cột tùy chọn: `faculty`, `enrollment_year`

### Xử lý
- **Không gián đoạn hệ thống**: chạy trong background BullMQ queue.
- **Batch processing**: xử lý **100 rows/batch** để giảm tải DB.
- **Transaction per batch**: mỗi batch trong 1 transaction.
- **Mật khẩu mặc định** cho SV mới: hash của `student_id + "UniHub2026"`.
- **File size**: tối đa **100MB** (~500.000 rows).

### Scheduling
- Cron: `0 2 * * *` (2:00 AM daily).
- Timeout: **30 phút** tối đa per job.

## Tiêu chí chấp nhận

- [ ] Cron job chạy lúc 2:00 AM, import file CSV mới.
- [ ] Header CSV sai → abort toàn bộ file, ghi log.
- [ ] Row lỗi → skip row, không abort toàn bộ file.
- [ ] Student_id chưa tồn tại → INSERT user mới.
- [ ] Student_id đã tồn tại → UPDATE thông tin.
- [ ] Log kết quả: tổng / inserted / updated / skipped / failed.
- [ ] Import không gián đoạn hệ thống đang chạy.
- [ ] ORGANIZER xem được log import.
- [ ] ORGANIZER trigger import thủ công.

## API Contract

### POST /csv-sync/trigger (ORGANIZER)

```json
// Response 202
{ "success": true,
  "data": { "jobId": "uuid", "status": "QUEUED", "message": "Import job đã được thêm vào queue." }
}
```

### GET /csv-sync/logs (ORGANIZER)

```json
// Response 200
{ "success": true,
  "data": [
    {
      "id": "uuid", "filename": "students_20260422.csv",
      "status": "COMPLETED", "startedAt": "2026-04-22T02:00:05Z",
      "completedAt": "2026-04-22T02:03:45Z",
      "summary": {
        "totalRows": 12000, "inserted": 500, "updated": 11200,
        "skipped": 250, "failed": 50
      }
    }
  ]
}
```

### GET /csv-sync/logs/:id (ORGANIZER)

```json
// Response 200 — detailed log with failed rows
{ "success": true,
  "data": {
    "id": "uuid", "filename": "students_20260422.csv",
    "status": "COMPLETED", "summary": { ... },
    "errors": [
      { "row": 152, "studentId": "21127152", "reason": "INVALID_EMAIL", "rawData": "..." },
      { "row": 305, "studentId": null, "reason": "MISSING_STUDENT_ID", "rawData": "..." }
    ]
  }
}
```
