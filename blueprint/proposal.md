# UniHub Workshop — Proposal

## 1. Bối cảnh

Trường Đại học A tổ chức thường niên **"Tuần lễ kỹ năng và nghề nghiệp"** với khoảng **50 workshop** diễn ra trong 5 ngày, phục vụ **~12.000 sinh viên**. Quy trình hiện tại hoàn toàn thủ công: đăng ký qua Google Form, điểm danh bằng giấy, thống kê bằng Excel.

### Vấn đề hiện tại

| # | Vấn đề | Hệ quả |
|---|--------|--------|
| 1 | Tranh chấp chỗ ngồi | Sinh viên đăng ký nhưng không có chỗ, phản ứng tiêu cực |
| 2 | Điểm danh thủ công | Mất 15–20 phút/workshop, dễ sai sót |
| 3 | Không có thống kê real-time | Ban tổ chức không biết workshop nào đông/vắng |
| 4 | Mất dữ liệu | File Excel bị lỗi/mất, không có backup |
| 5 | Không tích hợp hệ thống sinh viên | Phải nhập tay danh sách sinh viên |

---

## 2. Giải pháp đề xuất

**UniHub Workshop** — hệ thống số hóa toàn bộ quy trình đăng ký và check-in workshop, gồm:

- **Web Portal** cho sinh viên và ban tổ chức
- **Mobile App** cho nhân sự check-in (hỗ trợ offline)
- **Backend API** xử lý nghiệp vụ cốt lõi
- **Tích hợp AI** để tóm tắt nội dung workshop từ tài liệu

---

## 3. Người dùng mục tiêu

| Nhóm | Số lượng ước tính | Nhu cầu chính |
|------|-------------------|---------------|
| **Sinh viên** | ~12.000 | Xem lịch workshop, đăng ký chỗ, nhận QR code, check-in |
| **Ban tổ chức (Organizer)** | ~20–30 | Tạo/quản lý workshop, xem thống kê, quản lý đăng ký |
| **Nhân sự check-in (Staff)** | ~50 | Quét QR nhanh, hoạt động cả khi mất mạng |

---

## 4. Tính năng chính

### 4.1 Quản lý Workshop (Organizer)
- CRUD workshop: tiêu đề, mô tả, thời gian, địa điểm, số chỗ ngồi tối đa
- Xem danh sách đăng ký theo workshop
- Dashboard thống kê: tỷ lệ lấp đầy, check-in rate

### 4.2 Đăng ký Workshop (Sinh viên)
- Xem danh sách workshop (lọc theo ngày, trạng thái, từ khóa)
- Đăng ký chỗ ngồi — **chống tranh chấp bằng Pessimistic Lock**
- Hủy đăng ký (trước thời hạn)
- Nhận QR code xác nhận qua email và trong app

### 4.3 Thanh toán (Payment)
- Một số workshop có phí → cần thanh toán online
- Mock payment adapter (interface chuẩn để swap provider: VNPay, MoMo...)
- **Circuit Breaker** chống cascade failure khi gateway lỗi
- **Idempotency Key** chống double charge

### 4.4 Check-in (Staff)
- Quét QR code bằng camera trên mobile app
- Validate: đúng workshop, đúng thời gian, đã đăng ký
- **Offline mode**: lưu queue trong AsyncStorage, sync khi có mạng
- Conflict resolution: last-write-wins theo timestamp

### 4.5 Thông báo (Notification)
- Email xác nhận đăng ký
- Nhắc nhở trước workshop (30 phút)
- Thông báo khi workshop bị hủy/thay đổi
- Kiến trúc mở rộng: interface `INotificationChannel` → dễ thêm Telegram, SMS

### 4.6 Tóm tắt AI (AI Summary)
- Organizer upload tài liệu workshop (PDF)
- Hệ thống gọi Anthropic Claude API để tóm tắt
- Hiển thị tóm tắt trên trang chi tiết workshop
- Streaming response cho UX tốt hơn

### 4.7 Đồng bộ CSV (CSV Sync)
- Import danh sách sinh viên từ file CSV (từ hệ thống đào tạo)
- Cron job 2:00 AM hàng ngày
- Upsert theo `student_id`: insert mới hoặc update thông tin
- Chạy trong background queue, không ảnh hưởng hệ thống đang chạy

### 4.8 Xác thực & Phân quyền (Auth)
- JWT-based: access token 15 phút + refresh token 7 ngày
- 3 role: STUDENT, ORGANIZER, CHECKIN_STAFF
- RBAC với guard system của NestJS

---

## 5. Yêu cầu phi chức năng

| Yêu cầu | Chỉ tiêu |
|----------|-----------|
| **Concurrency** | Xử lý đúng khi 500+ sinh viên đăng ký cùng lúc 1 workshop |
| **Availability** | Check-in hoạt động kể cả khi mất mạng (offline mode) |
| **Rate Limiting** | Token Bucket — chống spam/DDoS: 10 req/min cho đăng ký, 100 req/min cho xem danh sách |
| **Fault Tolerance** | Circuit Breaker cho payment gateway — không ảnh hưởng tính năng khác |
| **Idempotency** | Không xử lý trùng lặp cho thanh toán |
| **Data Import** | CSV import an toàn, không gián đoạn hệ thống |
| **Security** | Không hardcode secret, RBAC nghiêm ngặt, JWT rotate |

---

## 6. Tech Stack

| Layer | Công nghệ | Lý do chọn |
|-------|-----------|-------------|
| Backend API | NestJS + TypeScript | Module system khớp bounded context |
| Database | PostgreSQL | Transaction support cho seat-locking |
| Cache / Queue | Redis + BullMQ | Rate limiting, idempotency, background jobs |
| Web Frontend | Next.js (App Router) | SSR cho SEO và performance |
| Mobile | React Native + Expo | Offline support qua AsyncStorage |
| Auth | JWT (access 15m + refresh 7d) | Stateless, phù hợp mobile |
| AI | Anthropic Claude API | Xử lý PDF natively, streaming |
| Payment | Mock adapter | Interface chuẩn để swap provider |

---

## 7. Phạm vi Phase 1 (MVP)

- [x] Thiết kế tài liệu (blueprint)
- [ ] Auth module (JWT + RBAC)
- [ ] Workshop CRUD
- [ ] Registration với seat locking
- [ ] Mock payment + circuit breaker
- [ ] QR check-in (online)
- [ ] Email notification
- [ ] CSV import cron job
- [ ] AI summary (basic)

**Phase 2 (Enhancement):**
- Offline check-in sync
- Push notification
- Advanced analytics dashboard
- Multi-language support
