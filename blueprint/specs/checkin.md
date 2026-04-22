# Đặc tả: Check-in (QR Scan + Offline Sync)

## Mô tả

Module check-in cho phép CHECKIN_STAFF quét QR code sinh viên tại workshop. Hỗ trợ **offline mode**: khi mất mạng, lưu check-in vào queue trên AsyncStorage, tự động sync khi có mạng. Conflict resolution bằng "last-write-wins" theo timestamp.

---

## Actor

| Actor | Hành động |
|-------|-----------|
| **CHECKIN_STAFF** | Quét QR, xem kết quả check-in, xử lý offline queue |
| **STUDENT** | Xuất trình QR code (passive) |
| **Mobile App** | Lưu queue offline, tự sync |
| **Backend** | Validate QR, cập nhật registration status |

---

## Luồng chính

### LC-01: Check-in Online

```
1. STAFF mở camera trên mobile app
2. Quét QR code của sinh viên
3. App gửi POST /checkins với { qrPayload, workshopId }
4. Server validate:
   a. Decode QR → lấy registrationId, studentId, workshopId
   b. Registration tồn tại và status = CONFIRMED
   c. Workshop.id khớp với workshopId trong QR
   d. Workshop đang trong thời gian diễn ra (startTime ≤ now ≤ endTime + buffer 30min)
5. Cập nhật registration.status = CHECKED_IN, checkedInAt = now
6. Trả kết quả cho app hiển thị: ✅ tên SV, mã SV, trạng thái
```

### LC-02: Check-in Offline

```
1. App phát hiện mất mạng (NetInfo)
2. STAFF quét QR → app validate cơ bản (format QR hợp lệ)
3. Lưu vào AsyncStorage queue:
   {
     studentQR: string,
     workshopId: string,
     scannedAt: ISO timestamp (local device time),
     syncStatus: 'pending'
   }
4. Hiển thị cho STAFF: "⏳ Đã lưu, sẽ sync khi có mạng"
5. App tiếp tục cho phép quét (không block)
```

### LC-03: Sync Offline Queue

```
1. App phát hiện có mạng trở lại
2. Đọc tất cả records với syncStatus = 'pending'
3. Sort theo scannedAt ASC (đúng thứ tự quét)
4. Gửi lần lượt POST /checkins/batch
5. Server xử lý từng record:
   a. Validate như online check-in
   b. Nếu đã CHECKED_IN → skip (idempotent)
   c. Nếu conflict (ai đã check-in trước) → last-write-wins theo scannedAt
6. Cập nhật syncStatus = 'synced' hoặc 'failed'
7. Hiển thị tổng kết sync cho STAFF
```

---

## Kịch bản lỗi

| # | Kịch bản | Xử lý | HTTP | Error Code |
|---|----------|--------|------|------------|
| E-01 | QR không hợp lệ (decode fail) | Reject | 400 | `INVALID_QR_CODE` |
| E-02 | Registration không tồn tại | Reject | 404 | `REGISTRATION_NOT_FOUND` |
| E-03 | Đã check-in rồi | Idempotent — trả success | 200 | — |
| E-04 | Workshop chưa bắt đầu | Reject | 400 | `WORKSHOP_NOT_STARTED` |
| E-05 | Workshop đã kết thúc (quá buffer) | Reject | 400 | `WORKSHOP_ENDED` |
| E-06 | Workshop ID không khớp QR | Reject | 400 | `WORKSHOP_MISMATCH` |
| E-07 | Registration status không phải CONFIRMED | Reject | 400 | `INVALID_CHECKIN_STATUS` |
| E-08 | Offline sync — 1 record fail | Skip record, tiếp tục | — | — |

---

## Ràng buộc

- **Check-in buffer**: cho phép check-in muộn tối đa 30 phút sau endTime
- **Idempotent**: check-in lần 2 cho cùng registration → trả success, không thay đổi
- **Offline queue max**: 500 records trên device (phòng memory overflow)
- **Sync batch size**: 20 records/request
- **Conflict resolution**: last-write-wins — so sánh `scannedAt` timestamp
- **QR format**: JWT signed string chứa { registrationId, studentId, workshopId }
- **QR signature**: verify bằng server secret key (chống giả mạo)

---

## Tiêu chí chấp nhận

- [ ] Quét QR hợp lệ → registration chuyển CHECKED_IN
- [ ] Quét QR lần 2 → idempotent, trả success
- [ ] QR giả mạo → reject 400
- [ ] Workshop chưa/đã diễn ra → reject
- [ ] Offline: quét QR khi mất mạng → lưu queue thành công
- [ ] Có mạng lại → sync tự động, đúng thứ tự
- [ ] Sync: record lỗi không block record khác
- [ ] STUDENT/ORGANIZER không truy cập được check-in scan (403)

---

## API Contract

### POST `/checkins` — Auth: CHECKIN_STAFF
```json
// Request
{ "qrPayload": "eyJhbGciOiJIUzI1NiIs...", "workshopId": "uuid" }
// Response 200
{ "success": true, "data": {
    "registrationId": "uuid",
    "student": { "fullName": "Nguyễn Văn A", "studentId": "2021001234" },
    "workshopTitle": "CV Writing Workshop",
    "checkedInAt": "2026-05-10T09:15:00Z",
    "status": "CHECKED_IN" } }
```

### POST `/checkins/batch` — Auth: CHECKIN_STAFF
```json
// Request
{ "checkins": [
    { "qrPayload": "...", "workshopId": "uuid", "scannedAt": "2026-05-10T09:10:00Z" },
    { "qrPayload": "...", "workshopId": "uuid", "scannedAt": "2026-05-10T09:11:00Z" }
  ] }
// Response 200
{ "success": true, "data": {
    "total": 2, "synced": 2, "skipped": 0, "failed": 0,
    "results": [
      { "qrPayload": "...", "status": "synced" },
      { "qrPayload": "...", "status": "synced" }
    ] } }
```

### GET `/checkins/workshop/:workshopId` — Auth: ORGANIZER
```json
{ "success": true, "data": {
    "workshopId": "uuid", "totalRegistered": 85, "totalCheckedIn": 72,
    "checkinRate": 0.847,
    "checkins": [
      { "student": { "fullName": "...", "studentId": "..." },
        "checkedInAt": "2026-05-10T09:10:00Z" }
    ] } }
```
