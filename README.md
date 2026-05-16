# UniHub Workshop — Hệ thống Quản lý Workshop Đại học

> Hệ thống đăng ký, thanh toán, check-in workshop cho **Tuần lễ Kỹ năng và Nghề nghiệp** tại trường Đại học.

---

## Mục lục

1. [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
2. [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
3. [Hướng dẫn cài đặt & khởi chạy](#hướng-dẫn-cài-đặt--khởi-chạy)
4. [Tài khoản test](#tài-khoản-test)
5. [API Endpoints](#api-endpoints)
6. [Cấu trúc thư mục](#cấu-trúc-thư-mục)
7. [Chạy Unit Test](#chạy-unit-test)

---

## Kiến trúc tổng quan

| Thành phần        | Công nghệ                          | Port          |
| ----------------- | ---------------------------------- | ------------- |
| **Backend API**   | NestJS, TypeORM, BullMQ            | `3000`        |
| **Web Frontend**  | Next.js 16 (React 19, TailwindCSS) | `3001`        |
| **Mobile App**    | React Native (Expo)                | Expo DevTools |
| **Database**      | PostgreSQL 16                      | `5432`        |
| **Cache & Queue** | Redis 7                            | `6379`        |

### Modules Backend

| Module         | Chức năng                                                      |
| -------------- | -------------------------------------------------------------- |
| `auth`         | JWT Authentication, RBAC (STUDENT / ORGANIZER / CHECKIN_STAFF) |
| `workshop`     | CRUD Workshop, Rate Limiting (Token Bucket via Redis)          |
| `registration` | Đăng ký Workshop, Pessimistic Lock cho ghế ngồi                |
| `payment`      | Thanh toán (Mock Gateway), Idempotency Key                     |
| `checkin`      | Check-in QR, Offline Sync (Last-write-wins)                    |
| `notification` | Email & Push notification (BullMQ async)                       |
| `ai-summary`   | Tóm tắt PDF bằng Anthropic Claude AI                           |
| `csv-sync`     | Import danh sách sinh viên từ CSV (CRON + BullMQ)              |

---

## Yêu cầu hệ thống

- **Node.js** ≥ 18
- **Docker Desktop** (để chạy PostgreSQL + Redis)
- **npm** (đi kèm Node.js)

> Mobile app cần thêm **Expo CLI** (`npx expo start`) — không bắt buộc để chấm điểm.

---

## Hướng dẫn cài đặt & khởi chạy

### Bước 1 — Khởi động Infrastructure (PostgreSQL + Redis)

```bash
cd infra
docker compose --env-file .env up -d
```

Kiểm tra container đã healthy:

```bash
docker ps
# Phải thấy: unihub-postgres (Up), unihub-redis (Up)
```

> **Lưu ý:** Lần đầu chạy, file `data/seed.sql` sẽ tự động tạo schema và seed dữ liệu test.
> Nếu database đã tồn tại từ trước, chạy lệnh sau để reset:
>
> ```bash
> docker compose down -v
> docker compose --env-file .env up -d
> ```

### Bước 2 — Cấu hình biến môi trường Backend

```bash
cd ../src/backend
cp .env.example .env
```

File `.env` mặc định đã có giá trị phù hợp cho local dev. **Không cần chỉnh sửa gì** nếu dùng Docker mặc định.

Nội dung `.env` chính:

```env
APP_PORT=3000
NODE_ENV=development

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=unihub_workshop
POSTGRES_USER=unihub
POSTGRES_PASSWORD=unihub_secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=unihub_redis_secret

# JWT
JWT_ACCESS_SECRET=dev_access_secret_unihub_2026
JWT_REFRESH_SECRET=dev_refresh_secret_unihub_2026
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# QR Code
QR_HMAC_SECRET=dev_qr_hmac_secret_unihub_2026

# AI Summary (tùy chọn — để trống nếu không test tính năng AI)
GEMINI_API_KEY=
```

### Bước 3 — Cài đặt dependencies & khởi chạy Backend

```bash
# Đang ở thư mục src/backend
npm install
npm run start:dev
```

✅ Thành công khi thấy log:

```
🚀 UniHub Workshop API running on http://localhost:3000/api
```

### Bước 4 — Cấu hình & khởi chạy Web Frontend

Mở terminal mới:

```bash
cd src/web
cp .env.example .env.local
npm install
npm run dev
```

✅ Thành công khi thấy:

```
▲ Next.js 16.x.x
- Local: http://localhost:3001
```

### Bước 5 — Khởi chạy Mobile App (Expo — Check-in QR)

> **Lưu ý:** Mobile app dành cho **CHECKIN_STAFF** quét QR tại sự kiện. Không bắt buộc cho việc demo web.

Mở terminal mới:

```bash
cd src/mobile
npm install
npx expo start
```

✅ Thành công khi thấy:

```
Metro waiting on exp://192.168.x.x:8081
› Press w │ open web
› Press a │ open Android
› Press i │ open iOS
```

#### Cách truy cập Mobile App

| Phương thức           | Hướng dẫn                                                                         |
| --------------------- | --------------------------------------------------------------------------------- |
| **Trình duyệt (Web)** | Nhấn `w` trong terminal Expo → mở tại http://localhost:8081                       |
| **Điện thoại thật**   | Cài **Expo Go** từ App Store / Google Play → quét QR code hiển thị trong terminal |
| **Android Emulator**  | Nhấn `a` trong terminal Expo (cần Android Studio + AVD đã cài sẵn)                |
| **iOS Simulator**     | Nhấn `i` trong terminal Expo (chỉ macOS, cần Xcode)                               |

#### Thao tác trên Mobile App

1. **Đăng nhập** bằng tài khoản `STAFF001` / `Admin@123`
2. **Chọn Workshop** cần check-in từ danh sách
3. **Quét mã QR** của sinh viên bằng camera
   - ✅ **Có mạng**: Check-in được gửi ngay lên server
   - ⏳ **Mất mạng**: Check-in lưu vào hàng đợi offline (AsyncStorage)
4. **Đồng bộ tự động** khi kết nối mạng phục hồi — badge hiển thị số pending

> **Lưu ý camera:** Khi chạy trên trình duyệt (`w`), camera QR sẽ dùng webcam. Trên điện thoại thật qua Expo Go sẽ sử dụng camera sau.

### Bước 6 — Truy cập hệ thống

| Ứng dụng             | URL                                               |
| -------------------- | ------------------------------------------------- |
| **Web Frontend**     | http://localhost:3001                             |
| **Backend API**      | http://localhost:3000/api                         |
| **Mobile App (Web)** | http://localhost:8081 (nhấn `w` từ Expo terminal) |
| **API Health Check** | http://localhost:3000/api (trả về `Hello World!`) |

---

## Tài khoản test

Tất cả tài khoản dưới đây sử dụng chung mật khẩu: **`Admin@123`**

| Vai trò               | Mã SV (studentId) | Email                  | Tên              | Password     |
| --------------------- | ----------------- | ---------------------- | ---------------- | ------------ |
| **ORGANIZER** (Admin) | `ADMIN001`        | admin@unihub.edu.vn    | Nguyen Van Admin | Admin@123    |
| **CHECKIN_STAFF**     | `STAFF001`        | staff@unihub.edu.vn    | Tran Thi Staff   | Admin@123    |
| **STUDENT**           | `SV001`           | sinhvien@unihub.edu.vn | Le Van Sinh Vien | SV001@unihub |

### Đăng nhập API (cURL)

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"studentId": "ADMIN001", "password": "Admin@123"}'
```

Phản hồi thành công:

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": {
      "id": "uuid",
      "name": "Nguyen Van Admin",
      "studentId": "ADMIN001",
      "role": "ORGANIZER"
    }
  }
}
```

Sử dụng `accessToken` cho các request tiếp theo:

```bash
curl http://localhost:3000/api/workshops \
  -H "Authorization: Bearer <accessToken>"
```

---

## API Endpoints

### Auth (`/api/auth`)

| Method | Endpoint        | Mô tả         | Auth |
| ------ | --------------- | ------------- | ---- |
| POST   | `/auth/login`   | Đăng nhập     | ❌   |
| POST   | `/auth/refresh` | Làm mới token | ❌   |
| POST   | `/auth/logout`  | Đăng xuất     | ✅   |
| GET    | `/auth/me`      | Xem profile   | ✅   |

### Workshop (`/api/workshops`)

| Method | Endpoint                 | Mô tả              | Auth         |
| ------ | ------------------------ | ------------------ | ------------ |
| POST   | `/workshops`             | Tạo workshop       | ✅ ORGANIZER |
| GET    | `/workshops`             | Danh sách workshop | ✅           |
| GET    | `/workshops/:id`         | Chi tiết workshop  | ✅           |
| PATCH  | `/workshops/:id`         | Cập nhật           | ✅ ORGANIZER |
| PATCH  | `/workshops/:id/publish` | Publish            | ✅ ORGANIZER |
| DELETE | `/workshops/:id`         | Xóa                | ✅ ORGANIZER |

### Registration (`/api/registrations`)

| Method | Endpoint             | Mô tả              | Auth         |
| ------ | -------------------- | ------------------ | ------------ |
| POST   | `/registrations`     | Đăng ký workshop   | ✅ STUDENT   |
| GET    | `/registrations/me`  | DS đăng ký của tôi | ✅           |
| GET    | `/registrations`     | DS tất cả (admin)  | ✅ ORGANIZER |
| DELETE | `/registrations/:id` | Hủy đăng ký        | ✅           |

### Payment (`/api/payments`)

| Method | Endpoint                    | Mô tả      | Auth         |
| ------ | --------------------------- | ---------- | ------------ |
| POST   | `/payments`                 | Thanh toán | ✅           |
| GET    | `/payments/stats`           | Thống kê   | ✅ ORGANIZER |
| GET    | `/payments/:registrationId` | Tra cứu    | ✅           |

### Check-in (`/api/checkins`)

| Method | Endpoint                | Mô tả                 | Auth             |
| ------ | ----------------------- | --------------------- | ---------------- |
| POST   | `/checkins/sync`        | Sync offline check-in | ✅ CHECKIN_STAFF |
| GET    | `/checkins?workshopId=` | Danh sách đã check-in | ✅ ORGANIZER     |

### AI Summary (`/api/workshops`)

| Method | Endpoint                    | Mô tả          | Auth         |
| ------ | --------------------------- | -------------- | ------------ |
| POST   | `/workshops/:id/ai-summary` | Tạo AI summary | ✅ ORGANIZER |
| GET    | `/workshops/:id/ai-summary` | Xem summary    | ✅           |

### Notification (`/api/notifications`)

| Method | Endpoint                  | Mô tả           | Auth |
| ------ | ------------------------- | --------------- | ---- |
| GET    | `/notifications/me`       | DS thông báo    | ✅   |
| PATCH  | `/notifications/:id/read` | Đánh dấu đã đọc | ✅   |

### CSV Sync (`/api/csv-sync`)

| Method | Endpoint             | Mô tả              | Auth         |
| ------ | -------------------- | ------------------ | ------------ |
| POST   | `/csv-sync/trigger`  | Trigger import CSV | ✅ ORGANIZER |
| GET    | `/csv-sync/logs`     | DS lịch sử import  | ✅ ORGANIZER |
| GET    | `/csv-sync/logs/:id` | Chi tiết log       | ✅ ORGANIZER |

---

## Cấu trúc thư mục

```
UniHub-Workshop/
├── blueprint/              # Tài liệu thiết kế hệ thống
│   ├── proposal.md         # Đề xuất dự án
│   ├── design.md           # C4 Diagrams, DB Schema, ADRs
│   └── specs/              # Feature specifications
├── data/
│   ├── seed.sql            # Schema + dữ liệu mẫu
│   └── sample-students.csv # CSV mẫu cho import
├── infra/
│   ├── docker-compose.yml  # PostgreSQL + Redis
│   └── .env                # Biến môi trường Docker
└── src/
    ├── backend/            # NestJS API Server
    │   ├── src/
    │   │   ├── modules/    # Feature modules
    │   │   │   ├── auth/
    │   │   │   ├── workshop/
    │   │   │   ├── registration/
    │   │   │   ├── payment/
    │   │   │   ├── checkin/
    │   │   │   ├── notification/
    │   │   │   ├── ai-summary/
    │   │   │   └── csv-sync/
    │   │   ├── common/     # Guards, decorators, Redis
    │   │   └── main.ts
    │   ├── .env.example
    │   └── package.json
    ├── web/                # Next.js Frontend
    │   ├── src/
    │   │   ├── app/        # Pages (login, dashboard, workshops)
    │   │   ├── components/ # Navbar, WorkshopCard, ErrorAlert
    │   │   └── lib/        # API client, types
    │   ├── .env.example
    │   └── package.json
    └── mobile/             # React Native Expo (Check-in App)
        ├── src/
        │   ├── screens/    # QR Scanner
        │   ├── hooks/      # useSync, useNetwork
        │   ├── contexts/   # Auth, Offline queue
        │   └── services/   # API, Storage
        └── package.json
```

---

## Chạy Unit Test

```bash
cd src/backend
npm test
```

Chạy test với coverage:

```bash
npm run test:cov
```

---

## Tóm tắt lệnh khởi chạy nhanh

```bash
# 1. Infrastructure
cd infra && docker compose --env-file .env up -d && cd ..

# 2. Backend
cd src/backend && cp .env.example .env && npm install && npm run start:dev

# 3. Web (terminal mới)
cd src/web && cp .env.example .env.local && npm install && npm run dev
```

Sau khi cả 3 dịch vụ chạy thành công:

- Mở **http://localhost:3001** → Web Frontend
- Đăng nhập bằng **ADMIN001 / Admin@123**
