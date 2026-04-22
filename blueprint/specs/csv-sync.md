# Đặc tả: CSV Sync (Đồng bộ Sinh viên từ CSV)

## Mô tả

Module import danh sách sinh viên từ file CSV (xuất từ hệ thống đào tạo). Chạy tự động qua **cron job lúc 2:00 AM hàng ngày**. Xử lý trong **background queue (BullMQ)** để không ảnh hưởng hệ thống đang chạy. Upsert theo `student_id`: insert sinh viên mới hoặc update thông tin đã có.

---

## Actor

| Actor | Hành động |
|-------|-----------|
| **Hệ thống (Cron)** | Trigger import tự động 2:00 AM |
| **ORGANIZER** | Trigger import thủ công, xem log import |
| **Hệ thống đào tạo (bên ngoài)** | Đặt file CSV vào thư mục quy định |

---

## CSV Format

**File path**: `/data/import/students_{YYYYMMDD}.csv`

**Header bắt buộc:**
```csv
student_id,full_name,email,faculty,year_of_study
```

**Ví dụ:**
```csv
student_id,full_name,email,faculty,year_of_study
2021001234,Nguyễn Văn A,a.nguyen@university.edu.vn,Công nghệ Thông tin,3
2021001235,Trần Thị B,b.tran@university.edu.vn,Kinh tế,2
2022002001,Lê Văn C,c.le@university.edu.vn,Cơ khí,1
```

---

## Luồng chính

### LC-01: Import tự động (Cron)

```
1. Cron job trigger lúc 2:00 AM
2. Kiểm tra file: /data/import/students_{today YYYYMMDD}.csv
3. Nếu không có file → log info, skip (không phải lỗi)
4. Nếu có file → tạo job trong BullMQ queue 'csv-import'
5. Worker process job (chi tiết ở LC-03)
```

### LC-02: Import thủ công (ORGANIZER)

```
1. ORGANIZER gửi POST /csv-sync/import (upload file CSV)
2. Server validate file cơ bản (extension, size)
3. Lưu file vào /data/import/
4. Tạo job trong BullMQ queue
5. Trả 202 Accepted
```

### LC-03: Worker xử lý CSV

```
1. Worker pick up job
2. Đọc file CSV
3. Validate header:
   - Phải có đúng 5 cột: student_id, full_name, email, faculty, year_of_study
   - Nếu header sai → ABORT toàn bộ file, log lỗi
4. Parse từng row:
   a. Validate:
      - student_id: không trống, alphanumeric
      - full_name: không trống, 2–100 ký tự
      - email: format email hợp lệ
      - faculty: không trống
      - year_of_study: số nguyên 1–7
   b. Nếu row hợp lệ → thêm vào batch upsert
   c. Nếu row không hợp lệ → SKIP row, ghi log (row number + lý do)
5. Batch upsert vào database:
   - Key: student_id
   - INSERT nếu student_id chưa tồn tại
   - UPDATE (full_name, email, faculty, year_of_study) nếu đã tồn tại
6. Tạo import log record:
   { fileNam, totalRows, inserted, updated, skipped, failed,
     errors: [{ row: 5, reason: "invalid email" }],
     startedAt, completedAt, status: COMPLETED|FAILED }
7. Di chuyển file → /data/import/processed/
```

---

## Kịch bản lỗi

| # | Kịch bản | Xử lý | Error Code |
|---|----------|--------|------------|
| E-01 | File không tồn tại (cron) | Log info, skip | — |
| E-02 | Header format sai | ABORT toàn bộ file | `INVALID_CSV_HEADER` |
| E-03 | Row dữ liệu sai | Skip row, log lỗi chi tiết | `INVALID_ROW` |
| E-04 | Email duplicate trong file | Skip row sau, giữ row đầu | `DUPLICATE_EMAIL` |
| E-05 | Database connection fail | Retry job 3 lần | `DB_CONNECTION_ERROR` |
| E-06 | File quá lớn (>50MB) | Reject | `FILE_TOO_LARGE` |
| E-07 | File encoding không phải UTF-8 | Cố detect, nếu fail → abort | `INVALID_ENCODING` |

**Quan trọng:** Lỗi ở row cụ thể KHÔNG abort toàn bộ file. Chỉ lỗi header mới abort.

---

## Ràng buộc

- **Cron**: 2:00 AM hàng ngày (configurable)
- **Background**: xử lý trong BullMQ queue, KHÔNG block API server
- **Batch size**: upsert 100 rows/batch (giảm round-trip DB)
- **File size max**: 50MB (~500k rows)
- **Encoding**: UTF-8 (BOM optional)
- **Upsert key**: `student_id` (unique trong DB)
- **Không xóa** sinh viên không có trong CSV (one-way sync, chỉ insert/update)
- **Log retention**: giữ 30 ngày import logs
- **Processed files**: di chuyển sang `/data/import/processed/`

---

## Tiêu chí chấp nhận

- [ ] Cron 2:00 AM → tự động import nếu có file
- [ ] Header sai → abort file, log lỗi rõ ràng
- [ ] Row sai → skip row, tiếp tục xử lý
- [ ] SV mới → insert vào DB
- [ ] SV đã có → update thông tin
- [ ] Import log ghi đầy đủ: total, inserted, updated, skipped, failed
- [ ] Không gián đoạn hệ thống đang chạy
- [ ] ORGANIZER import thủ công → upload + process thành công
- [ ] File > 50MB → reject

---

## API Contract

### POST `/csv-sync/import` — Auth: ORGANIZER
```
Content-Type: multipart/form-data
Body: file (CSV, max 50MB)
```
```json
// Response 202
{ "success": true, "data": {
    "importId": "uuid", "fileName": "students_20260422.csv",
    "status": "PROCESSING" } }
```

### GET `/csv-sync/logs` — Auth: ORGANIZER
```json
{ "success": true, "data": [
    { "id": "uuid", "fileName": "students_20260422.csv",
      "status": "COMPLETED", "totalRows": 12500,
      "inserted": 150, "updated": 12300, "skipped": 45, "failed": 5,
      "startedAt": "2026-04-22T02:00:05Z",
      "completedAt": "2026-04-22T02:01:30Z" }
  ] }
```

### GET `/csv-sync/logs/:id` — Auth: ORGANIZER
```json
{ "success": true, "data": {
    "id": "uuid", "fileName": "students_20260422.csv",
    "status": "COMPLETED", "totalRows": 12500,
    "inserted": 150, "updated": 12300, "skipped": 45, "failed": 5,
    "errors": [
      { "row": 5, "reason": "invalid email format: abc@" },
      { "row": 102, "reason": "student_id is empty" }
    ],
    "startedAt": "2026-04-22T02:00:05Z",
    "completedAt": "2026-04-22T02:01:30Z" } }
```
