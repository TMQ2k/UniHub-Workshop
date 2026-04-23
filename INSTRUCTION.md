# 📖 Hướng dẫn sử dụng UniHub Workshop — Theo từng Role

> **Lưu ý:** Đảm bảo backend, web và database đã chạy trước khi bắt đầu.
>
> ```bash
> # Terminal 1: Infrastructure
> cd infra && docker compose --env-file .env up -d
>
> # Terminal 2: Backend
> cd src/backend && npm run start:dev
>
> # Terminal 3: Web
> cd src/web && npm run dev
>
> # Terminal 4: Mobile (nếu test Staff quét QR)
> cd src/mobile && npx expo start
> ```

---

## 📊 Tổng quan Workflow — Sơ đồ toàn bộ hệ thống

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    actor SV as Sinh Viên
    actor Staff
    participant Web as Web App
    participant API as Backend API
    participant DB as PostgreSQL
    participant Queue as BullMQ / Redis
    participant Mail as Ethereal SMTP
    participant Mobile as Mobile App

    rect rgb(255, 230, 230)
    Note over Admin,DB: Phase 1 — Admin tạo Workshop
    Admin->>Web: Đăng nhập (ADMIN001)
    Web->>API: POST /auth/login
    API-->>Web: JWT Token
    Admin->>Web: Điền form tạo Workshop
    Web->>API: POST /workshops
    API->>DB: INSERT workshop
    API-->>Web: Workshop created
    Admin->>Web: Nhấn Publish
    Web->>API: PATCH /workshops/:id/publish
    API->>DB: UPDATE status = PUBLISHED
    end

    rect rgb(230, 255, 230)
    Note over SV,Mail: Phase 2 — Sinh viên đăng ký
    SV->>Web: Đăng ký tài khoản (/register)
    Web->>API: POST /auth/register
    API->>DB: INSERT user
    API-->>Web: JWT Token (auto-login)
    SV->>Web: Chọn Workshop + Đăng ký
    Web->>API: POST /registrations
    API->>DB: INSERT registration + QR code
    API->>Queue: Enqueue email job
    API-->>Web: QR code response
    Queue->>Mail: Gửi email + QR image
    Mail-->>SV: Email xác nhận + QR
    end

    rect rgb(255, 255, 220)
    Note over Staff,Mobile: Phase 3 — Staff check-in
    Staff->>Mobile: Đăng nhập (STAFF001)
    Mobile->>API: POST /auth/login
    API-->>Mobile: JWT Token
    Staff->>Mobile: Chọn Workshop
    SV-->>Staff: Đưa QR code
    Staff->>Mobile: Quét QR
    Mobile->>API: POST /checkins/sync
    API->>DB: INSERT checkin record
    API-->>Mobile: Check-in thành công ✅
    end
```

---

## 🔴 ROLE: ADMIN (Quản trị viên)

**Tài khoản:** `ADMIN001` / `Admin@123`  
**Truy cập:** Web — http://localhost:3001

### Sơ đồ luồng Admin

```mermaid
flowchart TD
    A["🔐 Đăng nhập Web<br/>ADMIN001 / Admin@123"] --> B["📋 Vào Dashboard"]
    B --> C["➕ Click Tạo Workshop"]
    C --> D["📝 Điền form Workshop<br/>(hoặc Upload PDF tự điền)"]
    D --> E{"Thông tin hợp lệ?"}
    E -- Không --> D
    E -- Có --> F["✅ Tạo thành công<br/>Status: DRAFT"]
    F --> G["📋 Quay lại Dashboard"]
    G --> H["🚀 Click Publish"]
    H --> I["✅ Status: PUBLISHED<br/>Hiển thị trang chủ"]
    I --> J["📊 Xem danh sách đăng ký<br/>(tùy chọn)"]
    J --> K["🚪 Đăng xuất"]

    style A fill:#ef4444,color:#fff
    style F fill:#22c55e,color:#fff
    style I fill:#22c55e,color:#fff
    style K fill:#6b7280,color:#fff
```

### Bước 1 — Đăng nhập

1. Mở trình duyệt → http://localhost:3001/login
2. Nhập MSSV: `ADMIN001`
3. Nhập mật khẩu: `Admin@123`
4. Nhấn **"Đăng nhập"**
5. ✅ Chuyển về trang chủ, navbar hiển thị **"Nguyen Van Admin"** cùng link **Dashboard**

### Bước 2 — Tạo Workshop mới

1. Click **"Dashboard"** trên navbar
2. Click **"+ Tạo Workshop"**
3. Điền thông tin:

| Trường | Ví dụ |
|--------|-------|
| Tiêu đề | Workshop Kỹ năng Thuyết trình |
| Mô tả | Học cách trình bày ý tưởng chuyên nghiệp |
| Diễn giả | ThS. Nguyễn Văn A |
| Phòng | A.301 |
| Thời gian bắt đầu | 2026-05-20 08:30 |
| Thời gian kết thúc | 2026-05-20 11:30 |
| Số chỗ ngồi | 50 |
| Giá vé (VND) | 0 *(miễn phí)* hoặc 50000 *(có phí)* |

4. *(Tùy chọn)* Upload file PDF ở phần trên form → hệ thống tự điền các trường
5. Nhấn **"Tạo Workshop"**
6. ✅ Thông báo thành công

### Bước 3 — Publish Workshop (mở đăng ký)

1. Quay lại **Dashboard** (click link trên navbar)
2. Tìm workshop vừa tạo trong danh sách
3. Nhấn nút **"Publish"** trên card workshop đó
4. ✅ Status chuyển thành **PUBLISHED**, workshop hiển thị trên trang chủ

### Bước 4 — Xem danh sách đăng ký (tùy chọn)

1. Trên Dashboard, click vào workshop
2. Xem danh sách sinh viên đã đăng ký, trạng thái, thống kê

### Bước 5 — Đăng xuất

1. Click **"Đăng xuất"** trên navbar

---

## 🟢 ROLE: SINH VIÊN (Student)

**Tài khoản:** Tự đăng ký mới hoặc dùng `SV001` / `Admin@123`  
**Truy cập:** Web — http://localhost:3001

### Sơ đồ luồng Sinh viên

```mermaid
flowchart TD
    A["🆕 Đăng ký tài khoản<br/>/register"] --> B["✅ Auto-login"]
    A2["🔐 Đăng nhập<br/>(nếu đã có TK)"] --> B
    B --> C["🏠 Trang chủ<br/>Xem danh sách Workshop"]
    C --> D["👆 Click vào Workshop"]
    D --> E{"Workshop miễn phí<br/>hay có phí?"}

    E -- "Miễn phí<br/>(giá = 0)" --> F["📝 Đăng ký ngay → Xác nhận"]
    F --> H["✅ Đăng ký thành công!<br/>Hiển thị QR code"]

    E -- "Có phí<br/>(giá > 0)" --> G["📝 Đăng ký ngay → Xác nhận"]
    G --> G2["💳 Trang thanh toán<br/>Nhấn Thanh toán ngay"]
    G2 --> H

    H --> I["📧 Email tự động gửi<br/>(QR + tên Workshop)"]
    H --> J["💾 Tải QR code (PNG)"]
    I --> K["📱 Mang QR đến Workshop<br/>để Staff quét check-in"]
    J --> K

    style A fill:#22c55e,color:#fff
    style A2 fill:#22c55e,color:#fff
    style H fill:#6366f1,color:#fff
    style I fill:#f59e0b,color:#fff
    style K fill:#8b5cf6,color:#fff
```

### Bước 1 — Đăng ký tài khoản (lần đầu)

1. Mở trình duyệt → http://localhost:3001/register
2. Điền thông tin:

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| MSSV | *(để trống)* | Hệ thống tự tạo SV003, SV004... |
| Họ và tên | Lê Thị C | Bắt buộc |
| Email | lethic@student.edu.vn | Bắt buộc |
| Mật khẩu | Test@123 | Tối thiểu 6 ký tự |
| Xác nhận mật khẩu | Test@123 | Phải trùng khớp |

3. Nhấn **"Đăng ký"**
4. ✅ Đăng ký thành công → tự động đăng nhập → chuyển về trang chủ

### Bước 2 — Đăng nhập (nếu đã có tài khoản)

1. Mở http://localhost:3001/login
2. Nhập MSSV và mật khẩu
3. Nhấn **"Đăng nhập"**

### Bước 3 — Xem danh sách Workshop

1. Tại trang chủ, xem tất cả workshop đang mở đăng ký
2. Mỗi card hiển thị: tên, diễn giả, thời gian, phòng, giá, số chỗ còn lại

### Bước 4 — Đăng ký Workshop

#### 4a. Workshop miễn phí (giá = 0)

1. Click vào card workshop muốn đăng ký
2. Nhấn **"Đăng ký ngay"**
3. Nhấn **"Xác nhận đăng ký"**
4. ✅ Đăng ký thành công!
5. Màn hình hiển thị **QR code** (hình ảnh) + nút **"Tải QR code"**

#### 4b. Workshop có phí (giá > 0)

1. Click vào card workshop muốn đăng ký
2. Nhấn **"Đăng ký ngay"**
3. Nhấn **"Xác nhận đăng ký"**
4. Hệ thống chuyển sang trang thanh toán
5. Nhấn **"Thanh toán ngay"** *(hệ thống mock, tự động thành công)*
6. ✅ Thanh toán thành công! QR code hiển thị

### Bước 5 — Nhận Email xác nhận

Sau khi đăng ký/thanh toán thành công, hệ thống **tự động gửi email** chứa:

- ✅ Tên workshop đã đăng ký
- 📌 Badge tên workshop nổi bật
- 📱 **Hình ảnh QR code** để staff quét check-in
- 📎 File đính kèm `qr-checkin.png`

**Cách xem email (Ethereal — test SMTP):**

1. Mở trình duyệt → https://ethereal.email/login
2. Đăng nhập:
   - Email: `jpftzldlraidtdb5@ethereal.email`
   - Password: `yFSuBZCy1ryPhndDPC`
3. Click **"Messages"** trên menu
4. Tìm email mới nhất có tiêu đề **"✅ Đăng ký thành công: [Tên workshop]"**
5. Click để xem nội dung + QR code

> ⚠️ **Ethereal là SMTP test** — email không gửi đến hộp thư Gmail/Outlook thật.
> Chỉ xem được trên https://ethereal.email sau khi đăng nhập.

### Bước 6 — Lưu QR code

- **Trên web:** Nhấn nút **"Tải QR code"** → tải file PNG về máy
- **Từ email:** Mở email trên Ethereal → chuột phải vào QR → "Save image as..."
- Mang QR code này đến workshop để nhân viên quét xác nhận

---

## 🟡 ROLE: STAFF (Nhân viên Check-in)

**Tài khoản:** `STAFF001` / `Admin@123`  
**Truy cập:** Chỉ dùng **Mobile App** (Expo Go trên điện thoại thật)

> ⛔ Staff **KHÔNG** đăng nhập được trên web.
> Nếu thử đăng nhập trên web sẽ thấy lỗi:
> *"Tài khoản Staff chỉ được sử dụng trên ứng dụng mobile để quét QR."*

### Sơ đồ luồng Staff

```mermaid
flowchart TD
    A["📱 Cài Expo Go<br/>trên điện thoại"] --> B{"IP máy tính<br/>= 192.168.1.15?"}
    B -- Đúng --> D["📷 Quét QR từ terminal<br/>npx expo start"]
    B -- Khác --> C["🔧 Sửa API_BASE_URL<br/>trong constants/index.ts"]
    C --> D
    D --> E["📲 App mở trên điện thoại"]
    E --> F["🔐 Đăng nhập<br/>STAFF001 / Admin@123"]
    F --> G["📋 Chọn Workshop<br/>(chip trên đầu màn hình)"]
    G --> H["📷 Hướng camera<br/>vào QR sinh viên"]
    H --> I{"Kết quả?"}
    I -- "✅" --> J["Check-in thành công!"]
    I -- "❌" --> K["QR sai workshop<br/>hoặc không hợp lệ"]
    I -- "⏳" --> L["Lưu offline<br/>tự đồng bộ khi có mạng"]
    J --> M["🔄 Nhấn Quét lại"]
    K --> M
    L --> M
    M --> H

    style A fill:#f59e0b,color:#fff
    style F fill:#f59e0b,color:#fff
    style J fill:#22c55e,color:#fff
    style K fill:#ef4444,color:#fff
    style L fill:#3b82f6,color:#fff
```

### Điều kiện tiên quyết

- ✅ Điện thoại Android hoặc iOS
- ✅ Cài app **Expo Go** từ Google Play / App Store
- ✅ Điện thoại và máy tính **cùng mạng WiFi**
- ✅ Backend đang chạy (`npm run start:dev`)
- ✅ Expo đang chạy (`npx expo start`)

### Bước 1 — Kiểm tra IP máy tính

```powershell
ipconfig | Select-String "IPv4"
```

Nếu IP **khác** `192.168.1.15`, sửa file `src/mobile/src/constants/index.ts`:

```typescript
export const API_BASE_URL = 'http://<IP_CỦA_BẠN>:3000/api';
```

### Bước 2 — Mở app trên điện thoại

1. Mở terminal → chạy `npx expo start` trong thư mục `src/mobile`
2. Terminal hiển thị QR code
3. **Android:** Mở app Expo Go → quét QR
4. **iOS:** Mở Camera → quét QR → tự mở Expo Go

### Bước 3 — Đăng nhập Staff

1. App hiện màn hình đăng nhập
2. Nhập mã nhân viên: `STAFF001`
3. Nhập mật khẩu: `Admin@123`
4. Nhấn **"Đăng nhập"**
5. ✅ Chuyển sang màn hình Scanner

### Bước 4 — Chọn Workshop

1. Trên đầu màn hình, thấy danh sách workshop dạng **chip** (thanh ngang cuộn được)
2. Nhấn vào workshop cần check-in (VD: "Kỹ năng CV")
3. Workshop được chọn sáng màu tím

### Bước 5 — Quét QR sinh viên

1. Hướng camera điện thoại vào **QR code của sinh viên**
   - QR từ web (trang đăng ký thành công)
   - QR từ email (hình trong email xác nhận)
   - QR từ file PNG đã tải về
2. Camera tự động nhận diện QR
3. Kết quả hiển thị:

| Kết quả | Ý nghĩa |
|---------|---------|
| ✅ Check-in thành công! | Sinh viên đã được xác nhận tham gia |
| ❌ QR này không thuộc workshop đang chọn! | QR của workshop khác — chọn đúng workshop |
| ❌ QR code không hợp lệ! | QR không phải của hệ thống UniHub |
| ⏳ Đã lưu offline — chờ đồng bộ | Mất mạng — dữ liệu lưu local, tự đồng bộ khi có mạng |

### Bước 6 — Quét tiếp

1. Nhấn **"🔄 Quét lại"** để quét sinh viên tiếp theo
2. Lặp lại bước 5

### Bước 7 — Đăng xuất

1. Nhấn **"Đăng xuất"** (góc trên bên trái)

---

## 🏗️ Kiến trúc hệ thống

```mermaid
graph TB
    subgraph Client["🖥️ Client Layer"]
        Web["Web App<br/>(Next.js :3001)"]
        Mobile["Mobile App<br/>(Expo Go)"]
    end

    subgraph Backend["⚙️ Backend Layer (NestJS :3000)"]
        Auth["AuthModule<br/>(JWT + RBAC)"]
        WS["WorkshopModule"]
        Reg["RegistrationModule"]
        Pay["PaymentModule<br/>(Circuit Breaker)"]
        CI["CheckinModule"]
        Notif["NotificationModule<br/>(OCP Channels)"]
    end

    subgraph Infra["🗄️ Infrastructure"]
        PG["PostgreSQL"]
        Redis["Redis + BullMQ"]
        SMTP["SMTP<br/>(Ethereal)"]
    end

    Web --> Auth
    Web --> WS
    Web --> Reg
    Web --> Pay
    Mobile --> Auth
    Mobile --> CI

    Auth --> PG
    WS --> PG
    Reg --> PG
    Reg --> Notif
    Pay --> PG
    Pay --> Notif
    CI --> PG

    Notif --> Redis
    Redis --> SMTP

    style Web fill:#3b82f6,color:#fff
    style Mobile fill:#f59e0b,color:#fff
    style Auth fill:#ef4444,color:#fff
    style Notif fill:#8b5cf6,color:#fff
    style PG fill:#22c55e,color:#fff
    style Redis fill:#dc2626,color:#fff
```

---

## 🔔 Hệ thống Notification — OCP Design

```mermaid
graph LR
    subgraph Caller["Modules gọi Notification"]
        Reg["RegistrationService"]
        Pay["PaymentService"]
    end

    NS["NotificationService<br/>(Orchestrator)"]

    subgraph Channels["INotificationChannel[]"]
        Email["📧 EmailChannel<br/>(Ethereal SMTP)"]
        Tele["💬 TelegramChannel<br/>(Thêm sau)"]
        SMS["📱 SMSChannel<br/>(Thêm sau)"]
    end

    subgraph Infra["Queue"]
        BullMQ["BullMQ<br/>Redis Queue"]
        Proc["NotificationProcessor<br/>(Worker)"]
    end

    Reg -->|"send()"| NS
    Pay -->|"send()"| NS
    NS -->|"1 job / channel"| BullMQ
    BullMQ --> Proc
    Proc -->|"channel.send()"| Email
    Proc -.->|"Thêm sau"| Tele
    Proc -.->|"Thêm sau"| SMS

    style NS fill:#6366f1,color:#fff
    style Email fill:#22c55e,color:#fff
    style Tele fill:#9ca3af,color:#fff,stroke-dasharray:5
    style SMS fill:#9ca3af,color:#fff,stroke-dasharray:5
    style BullMQ fill:#dc2626,color:#fff
```

> **OCP:** Thêm kênh mới (Telegram, SMS) chỉ cần tạo 1 class implement `INotificationChannel` rồi đăng ký vào DI — **không sửa** NotificationService.

---

## 🔐 Phân quyền truy cập (RBAC)

```mermaid
graph LR
    subgraph Roles["Roles"]
        Admin["🔴 ADMIN"]
        Student["🟢 STUDENT"]
        Staff["🟡 CHECKIN_STAFF"]
    end

    subgraph WebAccess["🖥️ Web App"]
        Dashboard["Dashboard"]
        CreateWS["Tạo Workshop"]
        Register["Đăng ký Workshop"]
        ViewWS["Xem Workshop"]
    end

    subgraph MobileAccess["📱 Mobile App"]
        Scanner["Scanner QR"]
    end

    Admin -->|"✅"| Dashboard
    Admin -->|"✅"| CreateWS
    Admin -->|"✅"| ViewWS

    Student -->|"✅"| Register
    Student -->|"✅"| ViewWS

    Staff -.->|"⛔ BLOCKED"| Dashboard
    Staff -.->|"⛔ BLOCKED"| CreateWS
    Staff -->|"✅"| Scanner

    style Admin fill:#ef4444,color:#fff
    style Student fill:#22c55e,color:#fff
    style Staff fill:#f59e0b,color:#fff
    style Scanner fill:#8b5cf6,color:#fff
```

---

## 🔑 Tài khoản Test

| Role | MSSV | Mật khẩu | Ghi chú |
|------|------|----------|---------|
| Admin | ADMIN001 | Admin@123 | Quản trị, tạo workshop |
| Sinh viên | SV001 | Admin@123 | Tài khoản mẫu có sẵn |
| Staff | STAFF001 | Admin@123 | Chỉ dùng mobile app |
| Sinh viên mới | *(tự đăng ký)* | *(tự chọn)* | Đăng ký tại /register |

---

## ❓ Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|------------|------------|
| "Đã có lỗi xảy ra" khi đăng nhập | Sai MSSV hoặc mật khẩu | Kiểm tra lại thông tin |
| Staff không đăng nhập được web | Đúng thiết kế — Staff chỉ dùng mobile | Dùng Expo Go trên điện thoại |
| Mobile "Network request failed" | IP sai hoặc backend chưa chạy | Kiểm tra IP trong `constants/index.ts`, đảm bảo cùng WiFi |
| QR quét không ra | Ánh sáng yếu hoặc QR mờ | Zoom to QR, đảm bảo ánh sáng đủ |
| Email không thấy | Ethereal là SMTP test | Xem tại https://ethereal.email/login |
| Workshop không hiện trang chủ | Chưa Publish | Admin vào Dashboard → nhấn Publish |
