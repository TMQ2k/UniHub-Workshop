# UniHub Workshop — Project Proposal

## Vấn đề

Trường Đại học A tổ chức **"Tuần lễ kỹ năng và nghề nghiệp"** hàng năm. Sự kiện kéo dài 5 ngày, mỗi ngày có 8–12 workshop diễn ra song song tại nhiều phòng khác nhau. Hiện tại, ban tổ chức quản lý đăng ký bằng **Google Form** và thông báo qua **email thủ công**.

### Hậu quả của quy trình hiện tại

| Vấn đề                                                  | Hậu quả                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Google Form không giới hạn chỗ ngồi theo thời gian thực | Đăng ký vượt quá sức chứa phòng, sinh viên đến nhưng không có chỗ  |
| Thông báo email thủ công                                | Chậm trễ, sai sót, thiếu thông tin xác nhận kịp thời               |
| Không có hệ thống check-in                              | Không biết sinh viên nào thực sự tham dự, thống kê thiếu chính xác |
| Không hỗ trợ thanh toán trực tuyến                      | Workshop có phí phải thu tiền tại chỗ, xảy ra nhầm lẫn             |
| Dữ liệu phân tán (nhiều Google Sheet)                   | Khó tổng hợp, không thể phân tích đánh giá                         |

Khi quy mô tăng lên khoảng **12.000 sinh viên**, quy trình thủ công hoàn toàn không còn đáp ứng được.

---

## Mục tiêu

Xây dựng hệ thống **UniHub Workshop** để số hóa toàn bộ quy trình, từ đăng ký đến check-in tại sự kiện, với các mục tiêu cụ thể:

| #   | Mục tiêu                            | Chỉ số đo lường                                                                             |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Xử lý đăng ký đồng thời quy mô lớn  | Hỗ trợ **12.000 sinh viên** đăng ký trong **10 phút đầu**, 60% dồn vào 3 phút đầu tiên      |
| 2   | Đảm bảo không tranh chấp chỗ ngồi   | Không có 2 sinh viên cùng nhận chỗ cuối cùng (zero over-booking)                            |
| 3   | Check-in nhanh tại sự kiện          | Quét QR < 2 giây, hỗ trợ offline khi mất mạng                                               |
| 4   | Thanh toán an toàn                  | Không trừ tiền hai lần, hệ thống vẫn hoạt động khi cổng thanh toán lỗi                      |
| 5   | Thông báo tự động, mở rộng được     | Xác nhận đăng ký qua email + app, dễ bổ sung kênh mới (Telegram, SMS)                       |
| 6   | Đồng bộ dữ liệu sinh viên           | Nhập CSV từ hệ thống cũ định kỳ 15 phút, tạo tài khoản tự động với mật khẩu `{MSSV}@unihub` |
| 7   | Hỗ trợ AI tóm tắt nội dung workshop | Ban tổ chức upload PDF → hệ thống tự tóm tắt hiển thị trên trang chi tiết                   |

---

## Người dùng và nhu cầu

### Sinh viên (~12.000 người)

- Đăng nhập bằng MSSV + mật khẩu (tài khoản được đồng bộ từ hệ thống trường, mật khẩu mặc định `{MSSV}@unihub`)
- Xem danh sách tất cả workshop: thông tin diễn giả, phòng, sơ đồ, **số chỗ còn lại theo thời gian thực**
- Đăng ký tham dự (miễn phí hoặc có phí)
- Nhận **mã QR** sau đăng ký thành công để check-in
- Nhận thông báo xác nhận qua app và email
- **Điều quan trọng nhất:** Trải nghiệm đăng ký nhanh, công bằng, không mất chỗ sau khi đã xác nhận

### Ban tổ chức

- Tạo workshop mới: tiêu đề, mô tả, diễn giả, phòng, thời gian, sức chứa, giá vé
- Cập nhật thông tin, đổi phòng/giờ, hủy workshop
- Upload PDF giới thiệu → hệ thống tự tạo tóm tắt AI
- Xem thống kê: số đăng ký, tỷ lệ check-in, doanh thu
- **Điều quan trọng nhất:** Quản lý tập trung, thao tác nhanh, dữ liệu chính xác real-time

### Nhân sự check-in

- Dùng mobile app quét mã QR sinh viên tại cửa phòng
- Hoạt động được cả khi **mất mạng** (offline check-in)
- Dữ liệu tự đồng bộ khi kết nối trở lại
- **Điều quan trọng nhất:** App ổn định, nhanh, không mất dữ liệu check-in

---

## Phạm vi

### Thuộc phạm vi (In-scope)

- ✅ Web app cho sinh viên xem/đăng ký workshop (Next.js)
- ✅ Trang admin cho ban tổ chức quản lý (Next.js)
- ✅ Mobile app cho nhân sự check-in với offline support (React Native + Expo)
- ✅ Backend API xử lý nghiệp vụ (NestJS)
- ✅ Hệ thống phân quyền RBAC (3 roles)
- ✅ Thanh toán qua **mock adapter** (interface thật, implementation giả lập)
- ✅ Thông báo email + app push
- ✅ AI Summary từ PDF upload (Google Gemini 2.5 Flash API)
- ✅ Đồng bộ sinh viên từ CSV (cron job 15 phút), tạo tài khoản tự động
- ✅ Các cơ chế bảo vệ: Pessimistic Lock, Token Bucket, Circuit Breaker, Idempotency Key
- ✅ Docker Compose cho môi trường local
- ✅ Seed data và hướng dẫn khởi chạy

### Không thuộc phạm vi (Out-of-scope)

- ❌ Cổng thanh toán thật (VNPay, Momo, Stripe...)
- ❌ Hạ tầng production (Kubernetes, CI/CD pipeline)
- ❌ Single Sign-On (SSO) với hệ thống trường
- ❌ Multi-tenant (chỉ phục vụ 1 trường)
- ❌ Internationalization (i18n) — chỉ hỗ trợ tiếng Việt
- ❌ Mobile app cho sinh viên (sinh viên dùng web app)
- ❌ Real-time WebSocket cho live updates (dùng polling hoặc refresh)

---

## Rủi ro và ràng buộc

### R1 — Tranh chấp chỗ ngồi

**Mô tả:** Một số workshop chỉ có 60 chỗ nhưng hàng trăm sinh viên cố đăng ký cùng lúc khi mở đăng ký.

**Hậu quả nếu không xử lý:** Hai sinh viên cùng nhận chỗ cuối cùng → over-booking → mất uy tín.

**Giải pháp dự kiến:** Pessimistic Lock (`SELECT ... FOR UPDATE`) kết hợp database transaction — đảm bảo serializable cho thao tác trừ chỗ ngồi.

---

### R2 — Tải đột biến

**Mô tả:** Dự kiến ~12.000 sinh viên truy cập trong 10 phút đầu khi mở đăng ký, 60% dồn vào 3 phút đầu tiên (~120 req/s peak).

**Hậu quả nếu không xử lý:** Backend bị quá tải, timeout hàng loạt, không ai đăng ký được.

**Giải pháp dự kiến:** Token Bucket Rate Limiting trên Redis — giới hạn request per IP, đảm bảo công bằng và bảo vệ backend.

---

### R3 — Cổng thanh toán không ổn định

**Mô tả:** Cổng thanh toán có thể timeout hoặc lỗi liên tục. Sinh viên retry → nguy cơ trừ tiền hai lần.

**Hậu quả nếu không xử lý:** (1) Double charge — mất tiền sinh viên. (2) Payment lỗi kéo sập toàn bộ hệ thống — sinh viên không xem được lịch workshop.

**Giải pháp dự kiến:**

- Circuit Breaker (3 trạng thái: CLOSED / OPEN / HALF_OPEN) — cô lập lỗi payment, không ảnh hưởng tính năng khác.
- Idempotency Key (UUID v4, lưu Redis TTL 24h) — chống double charge khi retry.

---

### R4 — Check-in offline

**Mô tả:** Một số khu vực trong trường có kết nối mạng không ổn định. Nhân sự check-in cần quét QR ngay cả khi mất mạng.

**Hậu quả nếu không xử lý:** Sinh viên đến nhưng không check-in được → thống kê sai, trải nghiệm kém.

**Giải pháp dự kiến:** Mobile app lưu check-in vào AsyncStorage queue khi offline, tự động sync theo thứ tự `scannedAt` khi có mạng trở lại, conflict resolution bằng last-write-wins.

---

### R5 — Tích hợp một chiều với hệ thống cũ

**Mô tả:** Hệ thống quản lý sinh viên hiện tại không có API. Cách duy nhất lấy dữ liệu là qua file CSV được export vào ban đêm.

**Hậu quả nếu không xử lý:** Không xác thực được sinh viên khi đăng ký, hoặc dữ liệu lỗi/trùng gây sai lệch.

**Giải pháp dự kiến:** Cron job mỗi 15 phút → đọc CSV → validate header → parse từng row → upsert theo `student_id` → tạo tài khoản với mật khẩu mặc định `{MSSV}@unihub` → log kết quả. Chạy trong BullMQ background queue, không gián đoạn hệ thống.
