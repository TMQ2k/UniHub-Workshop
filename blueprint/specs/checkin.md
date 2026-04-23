# Đặc tả: Check-in

## Mô tả

Module check-in tại sự kiện. Nhân sự dùng **mobile app** (React Native + Expo) quét **mã QR** của sinh viên tại cửa phòng. Hỗ trợ **offline check-in**: khi mất mạng, app lưu dữ liệu vào AsyncStorage và tự đồng bộ khi có kết nối trở lại.

## Actor

| Actor | Vai trò |
|-------|---------|
| CHECKIN_STAFF | Quét QR check-in sinh viên tại cửa phòng |
| STUDENT | Trình mã QR để check-in |
| ORGANIZER | Xem thống kê check-in |

## Luồng chính

### Luồng 1 — Check-in online (có mạng)

1. CHECKIN_STAFF mở mobile app, chọn workshop cần check-in.
2. Quét mã QR của sinh viên bằng camera.
3. App decode QR → extract `registrationId`, `studentId`, `workshopId`.
4. App verify **HMAC signature** trên QR (chống giả mạo).
5. Gửi `POST /checkins` với `{ registrationId, workshopId, scannedAt }`.
6. Server validate:
   - Registration tồn tại, `status = CONFIRMED`.
   - Workshop đúng (workshopId khớp).
   - Chưa check-in trước đó (chống check-in trùng).
7. Tạo check-in record `status = CHECKED_IN`.
8. App hiển thị ✅ xác nhận + tên sinh viên.

### Luồng 2 — Check-in offline (mất mạng)

1. CHECKIN_STAFF quét QR khi không có mạng.
2. App verify HMAC signature locally.
3. App lưu check-in vào **AsyncStorage queue**:
   ```
   { studentQR, workshopId, scannedAt (ISO timestamp local), syncStatus: 'pending' }
   ```
4. App hiển thị ⏳ "Đã ghi nhận (chờ đồng bộ)" + tên SV (cache local).
5. App hiển thị badge số lượng pending check-ins.

### Luồng 3 — Đồng bộ khi có mạng (Sync)

1. App detect network connectivity restored.
2. Đọc toàn bộ pending check-ins từ AsyncStorage.
3. Gửi lần lượt theo thứ tự **scannedAt** (đảm bảo thứ tự thời gian).
4. `POST /checkins/batch` với mảng pending check-ins.
5. Server xử lý từng check-in:
   - Thành công → `syncStatus = 'synced'`.
   - Lỗi (đã check-in trước, registration invalid) → `syncStatus = 'failed'`, kèm lý do.
6. App cập nhật UI, xóa synced records khỏi queue.
7. Hiển thị báo cáo sync: X thành công, Y thất bại.

### Luồng 4 — Conflict resolution

- Nếu cùng 1 sinh viên check-in 2 lần (1 offline + 1 online từ staff khác):
  - Server dùng **last-write-wins** với `scannedAt` timestamp.
  - Check-in đầu tiên được giữ, lần sau trả `ALREADY_CHECKED_IN` (không phải lỗi nghiêm trọng).

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP |
|----------|-------|------------|------|
| QR code invalid / giả mạo | Từ chối, hiển thị ❌ | `INVALID_QR` | 400 |
| SV chưa đăng ký workshop này | Từ chối | `REGISTRATION_NOT_FOUND` | 404 |
| SV đã check-in rồi | Thông báo "đã check-in", không lỗi nghiêm trọng | `ALREADY_CHECKED_IN` | 409 |
| Registration bị hủy | Từ chối | `REGISTRATION_CANCELLED` | 400 |
| Workshop chưa bắt đầu (quá sớm) | Cảnh báo nhưng vẫn cho check-in | — | 200 |
| Mất mạng giữa chừng sync | Dừng sync, giữ remaining items trong queue | — | — |
| AsyncStorage đầy | Cảnh báo, yêu cầu sync sớm | — | — |

## Ràng buộc

### Offline Support
- App phải hoạt động **100% offline** cho chức năng quét QR.
- Pending queue trong AsyncStorage, tối đa **500 records** trước khi cảnh báo.
- Sync tự động khi phát hiện network restored.
- Sync theo thứ tự `scannedAt` (FIFO).

### Bảo mật
- QR code ký bằng **HMAC-SHA256** → app verify locally trước khi gửi server.
- CHECKIN_STAFF chỉ có quyền `checkin:scan`, không truy cập được module khác.

### Hiệu năng
- Check-in online respond < **500ms**.
- QR decode + HMAC verify < **100ms** (local).
- Batch sync xử lý **50 records/batch**.

## Tiêu chí chấp nhận

- [ ] CHECKIN_STAFF quét QR online → check-in thành công, hiển thị ✅ + tên SV.
- [ ] Quét QR offline → lưu vào queue, hiển thị ⏳ "chờ đồng bộ".
- [ ] Khi có mạng trở lại → tự động sync, hiển thị kết quả.
- [ ] QR giả mạo (sai HMAC) → bị từ chối ngay.
- [ ] Check-in trùng → thông báo "đã check-in", không crash.
- [ ] CHECKIN_STAFF không truy cập được tạo workshop hay xem đăng ký (403).

## API Contract

### POST /checkins

**Headers:** `Authorization: Bearer <accessToken>` (CHECKIN_STAFF)

```json
// Request
{ "registrationId": "uuid", "workshopId": "uuid", "scannedAt": "2026-05-10T09:05:00+07:00" }

// Response 201
{ "success": true,
  "data": {
    "id": "uuid", "registrationId": "uuid",
    "studentName": "Nguyễn Văn A", "studentId": "21127001",
    "workshopTitle": "Resume Writing Workshop",
    "checkedInAt": "2026-05-10T09:05:00+07:00"
  }
}
```

### POST /checkins/batch

**Headers:** `Authorization: Bearer <accessToken>` (CHECKIN_STAFF)

```json
// Request
{ "checkins": [
    { "registrationId": "uuid1", "workshopId": "uuid", "scannedAt": "..." },
    { "registrationId": "uuid2", "workshopId": "uuid", "scannedAt": "..." }
  ]
}

// Response 200
{ "success": true,
  "data": {
    "synced": 8, "failed": 2,
    "results": [
      { "registrationId": "uuid1", "status": "synced" },
      { "registrationId": "uuid2", "status": "failed", "reason": "ALREADY_CHECKED_IN" }
    ]
  }
}
```

### GET /checkins/stats?workshopId=uuid (ORGANIZER)

```json
// Response 200
{ "success": true,
  "data": {
    "workshopId": "uuid", "totalRegistrations": 60,
    "checkedIn": 45, "checkInRate": "75%"
  }
}
```
