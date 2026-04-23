# 🎯 UniHub Workshop — Workflow Test (Tuần tự)

Hướng dẫn test toàn bộ flow từ Admin tạo workshop → Sinh viên đăng ký → Email QR → Staff quét QR.

---

## Bước 1: Admin tạo Workshop

> **Tài khoản:** ADMIN001 / Admin@123

1. Mở **http://localhost:3001/login**
2. Đăng nhập bằng `ADMIN001` / `Admin@123`
3. Vào **Dashboard** → Click **"+ Tạo Workshop"**
4. Điền thông tin workshop:
   - Tiêu đề: `Workshop Kỹ năng Giao tiếp`
   - Mô tả: `Học cách giao tiếp hiệu quả trong môi trường doanh nghiệp`
   - Diễn giả: `TS. Nguyễn Văn A`
   - Phòng: `A.301`
   - Bắt đầu: `2026-05-15 08:30`
   - Kết thúc: `2026-05-15 11:30`
   - Số chỗ: `50`
   - Giá: `0` (miễn phí)
5. Click **"Tạo Workshop"**
6. Quay lại Dashboard → Click **"Publish"** để mở đăng ký
7. **Đăng xuất**

**💡 Tùy chọn:** Upload file PDF để auto-fill form (ở phần trên form tạo workshop)

---

## Bước 2: Sinh viên tạo tài khoản

1. Mở **http://localhost:3001/register**
2. Điền thông tin:
   - MSSV: *(để trống — hệ thống tự tạo, VD: SV004)*
   - Họ tên: `Lê Thị C`
   - Email: `lethic@student.edu.vn`
   - Mật khẩu: `Test@123`
   - Xác nhận mật khẩu: `Test@123`
3. Click **"Đăng ký"**
4. Hệ thống tự đăng nhập → chuyển về trang chủ

---

## Bước 3: Sinh viên đăng ký Workshop

1. Tại trang chủ, click vào workshop **"Workshop Kỹ năng Giao tiếp"**
2. Click **"Đăng ký ngay"** → Xác nhận đăng ký
3. Kết quả thành công sẽ hiển thị:
   - ✅ Thông báo "Đăng ký thành công!"
   - 📱 **Hình ảnh QR code** (không phải text base64)
   - 📥 Nút "Tải QR code" (download PNG)

**Lưu ý:** Số chỗ còn lại sẽ giảm đi 1 trên trang workshop.

---

## Bước 4: Kiểm tra Email xác nhận

1. Truy cập **https://ethereal.email/login**
2. Đăng nhập bằng:
   - Email: `jpftzldlraidtdb5@ethereal.email`
   - Password: `yFSuBZCy1ryPhndDPC`
3. Vào **Inbox** → Tìm email có tiêu đề:
   > **✅ Đăng ký thành công: Workshop Kỹ năng Giao tiếp**
4. Mở email → Nội dung gồm:
   - Tên workshop đã đăng ký
   - **Hình ảnh QR code** để staff quét
   - Hướng dẫn mang QR đến workshop

---

## Bước 5: Staff quét QR trên Mobile

> **Tài khoản:** STAFF001 / Admin@123  
> ⚠️ Staff **KHÔNG** đăng nhập được trên web. Chỉ dùng mobile.

### 5a. Mở app mobile trên điện thoại thật

1. Máy tính: Chạy backend + Expo
   ```powershell
   # Terminal 1: Backend
   cd src/backend && npm run start:dev

   # Terminal 2: Expo  
   cd src/mobile && npx expo start
   ```
2. Điện thoại: Cài **Expo Go** (Google Play / App Store)
3. Quét QR code từ terminal Expo bằng Expo Go
4. App mở trên điện thoại

### 5b. Đăng nhập Staff

1. Nhập mã: `STAFF001`
2. Mật khẩu: `Admin@123`
3. Đăng nhập thành công → Màn hình Scanner

### 5c. Quét QR sinh viên

1. Chọn workshop **"Workshop Kỹ năng Giao tiếp"** (chip ở trên)
2. Hướng camera vào **QR code của sinh viên** (từ web hoặc email)
3. Kết quả: **✅ Check-in thành công!**

---

## ✅ Checklist tổng kết

| # | Hành động | Kết quả mong đợi |
|---|-----------|-------------------|
| 1 | Admin tạo + publish workshop | Workshop hiển thị trang chủ |
| 2 | SV đăng ký tài khoản | Tài khoản tạo thành công, auto-login |
| 3 | SV đăng ký workshop | QR code IMAGE hiển thị |
| 4 | SV nhận email | Email chứa tên workshop + QR image |
| 5 | Staff đăng nhập web | ❌ Bị chặn — "chỉ dùng mobile" |
| 6 | Staff đăng nhập mobile | ✅ Vào Scanner screen |
| 7 | Staff quét QR SV | ✅ Check-in thành công |
| 8 | Số chỗ workshop giảm | availableSeats - 1 |

---

## 📋 Lưu ý quan trọng

- **LAN IP**: Mobile app dùng IP `192.168.1.15`. Nếu IP khác, sửa `src/mobile/src/constants/index.ts`
- **SMTP**: Dùng Ethereal (test email). Email thực sẽ không gửi được — chỉ xem trên ethereal.email
- **Backend phải chạy** khi test mobile: `npm run start:dev` trong `src/backend`
