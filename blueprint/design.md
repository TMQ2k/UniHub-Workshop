# UniHub Workshop — Technical Design

## Kiến trúc tổng thể

UniHub Workshop sử dụng kiến trúc **Modular Monolith** — một ứng dụng NestJS duy nhất được tổ chức thành các module tách biệt theo bounded context. Lựa chọn này phù hợp vì:

1. **Quy mô phù hợp**: ~12.000 users, 1 trường — chưa cần microservices.
2. **KISS**: Triển khai, debug, và vận hành đơn giản hơn microservices.
3. **Tách biệt rõ ràng**: Mỗi NestJS module = 1 bounded context, dễ tách ra microservice sau nếu cần.
4. **Transaction support**: Pessimistic Lock cần database transaction trong cùng process.

### Các thành phần chính

| Thành phần    | Công nghệ            | Vai trò                                |
| ------------- | -------------------- | -------------------------------------- |
| Web App       | Next.js (App Router) | SSR cho SV xem/đăng ký + Admin portal  |
| Mobile App    | React Native + Expo  | Check-in QR + offline support          |
| Backend API   | NestJS + TypeScript  | Business logic, REST API               |
| Primary DB    | PostgreSQL           | Dữ liệu chính, transactions            |
| Cache & Queue | Redis                | Rate limiting, idempotency, BullMQ     |
| AI Service    | Google Gemini API    | Tóm tắt PDF workshop                   |
| Payment       | Mock Adapter         | Interface thật, implementation giả lập |
| Legacy System | CSV Export           | Dữ liệu sinh viên (one-way)            |

### Giao tiếp giữa các thành phần

- **Web App ↔ Backend**: REST API qua HTTPS (JSON)
- **Mobile App ↔ Backend**: REST API qua HTTPS (JSON) + offline queue
- **Backend ↔ PostgreSQL**: TypeORM qua TCP
- **Backend ↔ Redis**: ioredis qua TCP (cache, rate limit, idempotency, BullMQ)
- **Backend → Gemini API**: HTTPS REST (streaming response)
- **Backend → Payment Gateway**: HTTPS REST (qua Circuit Breaker)
- **Legacy System → Backend**: CSV file drop (cron read, one-way)

### Khi một phần gặp sự cố

| Sự cố                | Ảnh hưởng                        | Cơ chế bảo vệ                       |
| -------------------- | -------------------------------- | ----------------------------------- |
| Payment Gateway down | Chỉ workshop có phí bị ảnh hưởng | Circuit Breaker cô lập              |
| Redis down           | Rate limiting, queue tạm ngưng   | Graceful degradation, log warning   |
| Gemini API down      | AI summary không tạo được        | Retry queue, workshop vẫn hoạt động |
| PostgreSQL down      | Toàn bộ hệ thống ngưng           | Critical — cần monitoring           |
| Mobile mất mạng      | Check-in offline tiếp tục        | AsyncStorage queue + sync           |

---

## C4 Diagram

### Level 1 — System Context

```mermaid
graph TB
    SV["👤 Sinh viên<br/>(~12.000 người)"]
    BTC["👤 Ban tổ chức<br/>"]
    STAFF["👤 Nhân sự check-in<br/>"]

    SYSTEM["🏢 UniHub Workshop<br/>Hệ thống đăng ký<br/>và check-in workshop"]

    PAY["💳 Payment Gateway<br/>(Mock Adapter)"]
    AI["🤖 Google Gemini API<br/>(AI Summary)"]
    LEGACY["🗄️ Hệ thống SV cũ<br/>(CSV Export)"]

    SV -- "Xem, đăng ký,<br/>nhận QR" --> SYSTEM
    BTC -- "Tạo/quản lý workshop,<br/>upload PDF, xem thống kê" --> SYSTEM
    STAFF -- "Quét QR check-in<br/>(online + offline)" --> SYSTEM

    SYSTEM -- "Xử lý thanh toán<br/>(Circuit Breaker)" --> PAY
    SYSTEM -- "Gửi PDF,<br/>nhận tóm tắt" --> AI
    LEGACY -- "CSV file<br/>(every 15 min)" --> SYSTEM

    style SYSTEM fill:#1168bd,stroke:#0b4884,color:#fff
    style PAY fill:#999,stroke:#666,color:#fff
    style AI fill:#999,stroke:#666,color:#fff
    style LEGACY fill:#999,stroke:#666,color:#fff
```

### Level 2 — Container

```mermaid
graph TB
    SV["👤 Sinh viên"]
    BTC["👤 Ban tổ chức"]
    STAFF["👤 Nhân sự check-in"]

    subgraph boundary ["UniHub Workshop System"]
        direction TB

        WEB["🌐 Web App<br/>Next.js App Router<br/>(SSR + SPA)"]
        MOBILE["📱 Mobile App<br/>React Native + Expo<br/>(Offline Support)"]
        API["⚙️ Backend API<br/>NestJS + TypeScript<br/>(Modular Monolith)"]
        PG["🐘 PostgreSQL<br/>Primary Database<br/>(Transactions + Lock)"]
        REDIS["🔴 Redis<br/>Cache + Queue<br/>(BullMQ + Rate Limit)"]
    end

    PAY["💳 Payment Gateway"]
    AI["🤖 Gemini API"]
    CSV["🗄️ CSV File Drop"]

    SV -- "HTTPS" --> WEB
    BTC -- "HTTPS" --> WEB
    STAFF -- "HTTPS" --> MOBILE

    WEB -- "REST API<br/>(JSON)" --> API
    MOBILE -- "REST API<br/>(JSON + Offline Queue)" --> API

    API -- "TypeORM<br/>(TCP:5432)" --> PG
    API -- "ioredis<br/>(TCP:6379)" --> REDIS

    API -- "HTTPS<br/>(Circuit Breaker)" --> PAY
    API -- "HTTPS<br/>(Streaming)" --> AI
    CSV -- "File Read<br/>(Cron 15min)" --> API

    style WEB fill:#438dd5,stroke:#2e6295,color:#fff
    style MOBILE fill:#438dd5,stroke:#2e6295,color:#fff
    style API fill:#1168bd,stroke:#0b4884,color:#fff
    style PG fill:#2b78e4,stroke:#1a5ab6,color:#fff
    style REDIS fill:#dc382c,stroke:#a52a20,color:#fff
    style PAY fill:#999,stroke:#666,color:#fff
    style AI fill:#999,stroke:#666,color:#fff
    style CSV fill:#999,stroke:#666,color:#fff
```

---

## Các luồng nghiệp vụ quan trọng

### Luồng 1 — Đăng ký workshop có phí (end-to-end)

```mermaid
flowchart TD
    A["🖱️ Sinh viên bấm Đăng ký"] --> B["POST /registrations"]

    subgraph RL ["⚡ Rate Limit Check"]
        B --> C{"Token Bucket\n(Redis)\ncòn token?"}
        C -- Hết --> C1["❌ 429 TOO_MANY_REQUESTS"]
    end

    subgraph TX ["🔒 Pessimistic Lock Transaction"]
        C -- Còn --> D["BEGIN TRANSACTION"]
        D --> E["SELECT ... FOR UPDATE\n(lock workshop row)"]
        E --> F{"available_seats > 0?"}
        F -- Không --> F1["❌ WORKSHOP_FULL\nROLLBACK"]
        F -- Có --> G{"Đã đăng ký\nworkshop này?"}
        G -- Rồi --> G1["❌ ALREADY_REGISTERED\nROLLBACK"]
        G -- Chưa --> H{"Trùng lịch\nworkshop khác?"}
        H -- Trùng --> H1["❌ SCHEDULE_CONFLICT\nROLLBACK"]
        H -- Không --> I["UPDATE available_seats -= 1"]
        I --> J["INSERT registration\nstatus = PENDING_PAYMENT"]
        J --> K["COMMIT"]
    end

    K --> L["📄 Trả 201 + paymentUrl"]
    L --> M["🖱️ SV xác nhận thanh toán"]
    M --> N["POST /payments\n+ Idempotency-Key header"]

    subgraph IDEM ["🔑 Idempotency Check"]
        N --> O{"Redis: key\nđã tồn tại?"}
        O -- Có --> O1["↩️ Trả cached response\n(không xử lý lại)"]
    end

    subgraph CB ["🔌 Circuit Breaker"]
        O -- Chưa --> P{"CB state?"}
        P -- OPEN --> P1["❌ 503 PAYMENT_UNAVAILABLE\n(không gọi gateway)"]
        P -- CLOSED --> Q["💳 Gọi Payment Gateway"]
        P -- HALF_OPEN --> Q
        Q --> R{"Thanh toán\nthành công?"}
        R -- Lỗi --> R1["Đếm lỗi → có thể chuyển OPEN"]
        R -- Thành công --> S["UPDATE payment = COMPLETED"]
    end

    S --> T["UPDATE registration = CONFIRMED"]
    T --> U["🔐 Generate QR Code\n(HMAC-SHA256 → Base64)"]
    U --> V["SET idempotency:key → Redis\n(TTL 24h)"]
    V --> W["📬 Enqueue notification\n(BullMQ)"]
    W --> X["✅ Trả 200 + QR Code"]
    X --> Y["📧 Email + 📱 App Push\nxác nhận đăng ký"]

    style RL fill:#1e293b,stroke:#6366f1,color:#fff
    style TX fill:#1e293b,stroke:#f59e0b,color:#fff
    style IDEM fill:#1e293b,stroke:#10b981,color:#fff
    style CB fill:#1e293b,stroke:#ef4444,color:#fff
```

### Luồng 2 — Check-in offline và đồng bộ

```mermaid
flowchart TD
    A["📱 Staff mở Scanner Screen"] --> B["Chọn Workshop từ danh sách"]
    B --> C["📷 Quét QR sinh viên"]
    C --> D["Decode Base64 → JSON\n(registrationId, workshopId)"]

    D --> E{"QR hợp lệ?"}
    E -- Không --> E1["❌ QR code không hợp lệ"]
    E -- Có --> F{"workshopId khớp\nvới WS đang chọn?"}
    F -- Không --> F1["❌ QR không thuộc\nworkshop này"]
    F -- Có --> G{"📶 Có kết nối mạng?"}

    subgraph OFFLINE ["💾 Offline Mode"]
        G -- Không --> H["Lưu vào AsyncStorage\n{studentQR, workshopId,\nscannedAt, syncStatus: pending}"]
        H --> I["⏳ Hiển thị: Đã lưu offline"]
        I --> J["Badge +1 pending"]
        J --> K{"Mạng phục hồi?"}
        K -- Chưa --> C
        K -- Rồi --> L["Đọc toàn bộ pending queue\n(sorted by scannedAt ASC)"]
    end

    subgraph ONLINE ["🌐 Online Mode"]
        G -- Có --> M["POST /checkins/sync\n(batch payload)"]
        L --> M
    end

    subgraph BACKEND ["⚙️ Backend xử lý từng item"]
        M --> N{"Registration\ntồn tại?"}
        N -- Không --> N1["❌ REGISTRATION_NOT_FOUND"]
        N -- Có --> O{"Status =\nCONFIRMED?"}
        O -- Không --> O1["❌ NOT_CONFIRMED\nhoặc CANCELLED"]
        O -- Có --> P{"workshopId\nkhớp?"}
        P -- Không --> P1["❌ WORKSHOP_MISMATCH"]
        P -- Có --> Q{"Đã check-in\ntrước đó?"}
        Q -- Chưa --> R["✅ Tạo record check_ins"]
        Q -- Rồi --> S{"incoming time\nsớm hơn?"}
        S -- Không --> S1["❌ ALREADY_CHECKED_IN"]
        S -- Có --> S2["✅ Overwrite\n(giữ lần quét sớm nhất)"]
    end

    R --> T["Trả kết quả:\nsynced / failed count"]
    S2 --> T
    T --> U["Xóa items đã synced\nkhỏi AsyncStorage"]
    U --> V["✅ Hiển thị kết quả đồng bộ"]

    style OFFLINE fill:#1e293b,stroke:#f59e0b,color:#fff
    style ONLINE fill:#1e293b,stroke:#6366f1,color:#fff
    style BACKEND fill:#1e293b,stroke:#10b981,color:#fff
```

### Luồng 3 — Import CSV định kỳ (tạo tài khoản sinh viên)

```mermaid
flowchart TD
    A["⏰ Cron Job kích hoạt\n(mỗi 15 phút)"] --> B["Scan thư mục /data/"]

    B --> C{"Tìm thấy\nfile CSV?"}
    C -- Không --> C1["⏸️ Kết thúc\n(đợi lần tiếp theo)"]
    C -- Có --> D["Enqueue csv-import job\nvào BullMQ"]

    D --> E["Worker nhận job"]
    E --> F["Đọc file CSV"]
    F --> G{"Header columns\nhợp lệ?"}
    G -- Không --> G1["❌ Log FAILED:\nINVALID_CSV_HEADER"]

    G -- Có --> H["Chia thành batch\n(100 rows/batch)"]

    subgraph BATCH ["🔄 Xử lý từng batch"]
        H --> I["Parse + validate từng row"]
        I --> J{"Row hợp lệ?"}
        J -- Không --> J1["Ghi nhận lỗi\n(skipped +1)"]
        J -- Có --> K["BEGIN TRANSACTION"]
        K --> L{"student_id\nđã tồn tại?"}
        L -- Có --> M["UPDATE thông tin\n(full_name, email, faculty...)"]
        L -- Chưa --> N["INSERT user mới\npassword = MSSV@unihub\nis_synced = true"]
        M --> O["COMMIT"]
        N --> O
        O --> P{"Còn batch\ntiếp theo?"}
        P -- Có --> I
    end

    J1 --> P
    P -- Không --> Q["📊 Log COMPLETED\n(inserted, updated, skipped, failed)"]

    style BATCH fill:#1e293b,stroke:#6366f1,color:#fff
```

---

## Thiết kế cơ sở dữ liệu

### Lựa chọn: PostgreSQL (SQL)

**Lý do:**

- Cần **ACID transactions** cho seat locking (Pessimistic Lock).
- Dữ liệu có quan hệ rõ ràng (users → registrations → workshops).
- `SELECT ... FOR UPDATE` là tính năng native của PostgreSQL.
- Hỗ trợ index, constraint, và query phức tạp cho reporting.

**Redis bổ sung cho:**

- Rate limiting counters (TTL-based).
- Idempotency key store (TTL 24h).
- BullMQ job queue.
- Không dùng Redis làm primary data store.

### ER Diagram

```mermaid
erDiagram
    users {
        uuid id PK
        varchar student_id UK "from CSV sync"
        varchar full_name
        varchar email UK
        varchar password_hash
        varchar role "STUDENT | ORGANIZER | CHECKIN_STAFF"
        varchar faculty "nullable"
        int enrollment_year "nullable"
        boolean is_locked "default false"
        boolean is_synced "default false, TRUE when CSV synced"
        varchar refresh_token_hash "nullable"
        timestamp created_at
        timestamp updated_at
    }

    workshops {
        uuid id PK
        varchar title
        text description
        varchar speaker
        varchar room
        varchar room_map_url
        timestamp start_time
        timestamp end_time
        int max_seats
        int available_seats
        int price "0 = free"
        varchar status "DRAFT | PUBLISHED | CANCELLED"
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    registrations {
        uuid id PK
        uuid workshop_id FK
        uuid student_id FK
        varchar status "PENDING_PAYMENT | CONFIRMED | CANCELLED"
        varchar qr_code
        timestamp seat_hold_expires_at
        timestamp created_at
        timestamp updated_at
    }

    payments {
        uuid id PK
        uuid registration_id FK
        int amount
        varchar currency "VND"
        varchar status "PROCESSING | COMPLETED | FAILED | REFUNDED"
        varchar transaction_id
        varchar idempotency_key UK
        timestamp paid_at
        timestamp created_at
        timestamp updated_at
    }

    check_ins {
        uuid id PK
        uuid registration_id FK
        uuid scanned_by FK
        timestamp scanned_at
        varchar source "ONLINE | OFFLINE_SYNC"
        timestamp created_at
    }

    notifications {
        uuid id PK
        uuid user_id FK
        varchar type "REGISTRATION_CONFIRMED | WORKSHOP_CANCELLED | etc"
        varchar title
        text body
        varchar channel "EMAIL | APP_PUSH"
        varchar status "PENDING | SENT | FAILED"
        boolean is_read
        int retry_count
        timestamp created_at
    }

    ai_summaries {
        uuid id PK
        uuid workshop_id FK
        varchar pdf_path
        text summary
        varchar status "PROCESSING | COMPLETED | FAILED"
        timestamp generated_at
        timestamp created_at
    }

    csv_import_logs {
        uuid id PK
        varchar filename
        varchar status "QUEUED | PROCESSING | COMPLETED | FAILED"
        int total_rows
        int inserted
        int updated
        int skipped
        int failed
        json errors
        timestamp started_at
        timestamp completed_at
        timestamp created_at
    }

    users ||--o{ registrations : "registers"
    workshops ||--o{ registrations : "has"
    registrations ||--o| payments : "pays"
    registrations ||--o| check_ins : "checks_in"
    users ||--o{ notifications : "receives"
    users ||--o{ check_ins : "scans"
    workshops ||--o| ai_summaries : "summarized_by"
    users ||--o{ workshops : "creates"
```

### Indexes quan trọng

```sql
-- Seat locking performance
CREATE INDEX idx_workshops_status ON workshops(status);
CREATE INDEX idx_workshops_start_time ON workshops(start_time);

-- Registration lookup
CREATE UNIQUE INDEX idx_registrations_workshop_student ON registrations(workshop_id, student_id);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_seat_hold ON registrations(seat_hold_expires_at)
    WHERE status = 'PENDING_PAYMENT';

-- Payment idempotency
CREATE UNIQUE INDEX idx_payments_idempotency ON payments(idempotency_key);

-- Check-in dedup
CREATE UNIQUE INDEX idx_checkins_registration ON check_ins(registration_id);

-- Notification queue
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
```

---

## Thiết kế kiểm soát truy cập (RBAC)

### Mô hình

Sử dụng **Role-Based Access Control** với 3 roles cố định. Mỗi role có tập permissions predefined. Kiểm tra quyền tại **2 điểm**:

1. **API Gateway level**: `JwtAuthGuard` verify token + extract role.
2. **Endpoint level**: `RolesGuard` + `@Roles()` decorator kiểm tra role có quyền.

### Permission Matrix

| Permission              | STUDENT | ORGANIZER | CHECKIN_STAFF |
| ----------------------- | ------- | --------- | ------------- |
| `workshop:read`         | ✅      | ✅        | ❌            |
| `workshop:write`        | ❌      | ✅        | ❌            |
| `registration:create`   | ✅      | ❌        | ❌            |
| `registration:read:own` | ✅      | ❌        | ❌            |
| `registration:read:all` | ❌      | ✅        | ❌            |
| `payment:create`        | ✅      | ❌        | ❌            |
| `payment:stats`         | ❌      | ✅        | ❌            |
| `checkin:scan`          | ❌      | ❌        | ✅            |
| `notification:read:own` | ✅      | ❌        | ❌            |
| `stats:read`            | ❌      | ✅        | ❌            |
| `csv-sync:manage`       | ❌      | ✅        | ❌            |
| `ai-summary:upload`     | ❌      | ✅        | ❌            |

### Implementation

```
Guard chain: JwtAuthGuard → RolesGuard → Controller method
Rate-limited endpoints thêm: RateLimitGuard (Token Bucket trên Redis)

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER)
@Post()
async create(@Body() dto: CreateWorkshopDto, @Request() req) { ... }
```

- JWT payload: `{ sub: userId, role: "STUDENT" | "ORGANIZER" | "CHECKIN_STAFF" }`
- JWT sử dụng **2 secret keys riêng biệt**: `JWT_ACCESS_SECRET` (access token) và `JWT_REFRESH_SECRET` (refresh token).
- Token verified stateless (không query DB mỗi request).
- Role stored trong `users.role` column, không dùng bảng riêng (KISS — chỉ 3 roles cố định).
- `@Roles()` decorator sử dụng `UserRole` enum, `RolesGuard` dùng `Reflector` để lấy metadata.

---

## Thiết kế các cơ chế bảo vệ hệ thống

### Kiểm soát tải đột biến — Token Bucket Rate Limiting

**Vấn đề:** 12.000 SV truy cập trong 10 phút đầu, 60% dồn vào 3 phút → ~120 req/s peak.

**Giải pháp:** Token Bucket algorithm trên Redis.

**Cách hoạt động:**

- Mỗi IP + endpoint có 1 bucket chứa tokens.
- Mỗi request tiêu 1 token.
- Tokens được refill đều đặn theo rate cố định.
- Hết token → reject `429 TOO_MANY_REQUESTS`.

**Cấu hình:**

| Endpoint              | Max Tokens | Refill Rate     |
| --------------------- | ---------- | --------------- |
| `POST /registrations` | 10         | 10 tokens/phút  |
| `GET /workshops`      | 100        | 100 tokens/phút |
| `POST /payments`      | 5          | 5 tokens/phút   |
| Tất cả endpoints khác | 60         | 60 tokens/phút  |

**Redis key format:**

```
rate_limit:{ip}:{endpoint}
value: { tokens: number, lastRefill: timestamp }
TTL: window_size_seconds
```

**Tại sao Token Bucket (không phải Fixed Window / Sliding Window):**

- Cho phép **burst** ngắn (SV bấm nhanh vài lần) nhưng giới hạn sustained rate.
- Smooth hơn Fixed Window (không có edge-case đầu/cuối window).
- Đơn giản implement trên Redis (1 key per IP+endpoint).

---

### Xử lý cổng thanh toán không ổn định — Circuit Breaker

**Vấn đề:** Payment gateway có thể timeout hoặc lỗi liên tục, kéo sập toàn bộ hệ thống.

**Giải pháp:** Circuit Breaker pattern cô lập lỗi payment.

**Ba trạng thái:**

```
CLOSED ──(5 lỗi/30s)──▶ OPEN ──(60s timeout)──▶ HALF_OPEN
   ▲                                                  │
   └──────────(1 request thành công)──────────────────┘
                                    │
                        (1 request thất bại)
                                    │
                                    ▼
                                  OPEN
```

| Trạng thái    | Hành vi                                                   |
| ------------- | --------------------------------------------------------- |
| **CLOSED**    | Forward request bình thường. Đếm lỗi liên tiếp.           |
| **OPEN**      | Reject ngay `503 PAYMENT_UNAVAILABLE`. Không gọi gateway. |
| **HALF_OPEN** | Cho 1 request thử. Thành công → CLOSED. Lỗi → OPEN.       |

**Cấu hình:**

- Threshold mở: **5 lỗi liên tiếp** trong **30 giây**.
- Reset timeout: **60 giây**.
- **Isolation**: Chỉ ảnh hưởng payment flow. Xem workshop, đăng ký miễn phí, check-in vẫn hoạt động bình thường.

---

### Chống trừ tiền hai lần — Idempotency Key

**Vấn đề:** Client retry payment khi timeout → nguy cơ trừ tiền 2 lần.

**Giải pháp:** Idempotency Key — mỗi request mang 1 unique key. Server nhận diện request trùng và trả cached response.

**Luồng xử lý:**

```
Client gửi: POST /payments + Header: Idempotency-Key: <uuid-v4>
    │
    ▼
Server check Redis: GET idempotency:{key}
    │
    ├── Đã có → Trả cached response (KHÔNG xử lý lại)
    │
    └── Chưa có → Xử lý payment
                    → Lưu response vào Redis: SET idempotency:{key} {response} EX 86400
                    → Trả response cho client
```

**Cấu hình:**

- Key format: UUID v4 (client generate).
- Storage: Redis.
- TTL: **24 giờ** (86400 seconds).
- Thiếu Idempotency Key header → `400 MISSING_IDEMPOTENCY_KEY`.

---

## Các quyết định kỹ thuật quan trọng (ADR)

### ADR-001: Pessimistic Lock cho Seat Locking

**Bối cảnh:** Workshop 60 chỗ, hàng trăm SV đăng ký cùng lúc. Cần đảm bảo zero over-booking.

**Quyết định:** Sử dụng Pessimistic Lock (`SELECT ... FOR UPDATE`) kết hợp database transaction.

**Lý do:**

- Đảm bảo **serializable** cho thao tác check + trừ chỗ ngồi.
- Đơn giản, dễ hiểu (KISS) — PostgreSQL native support.
- Phù hợp với write-heavy, high-contention scenario.

**Đánh đổi:**

- Lock giữ connection → có thể bottleneck nếu transaction kéo dài.
- Mitigation: transaction chỉ chứa logic tối thiểu (check seats → trừ seats → insert registration), không gọi external service trong transaction.

**Tại sao không dùng Optimistic Lock:**

- High contention (nhiều SV cùng đăng ký 1 workshop) → retry rate cao → UX kém.
- Pessimistic Lock đảm bảo first-come-first-served rõ ràng hơn.

---

### ADR-002: Token Bucket cho Rate Limiting

**Bối cảnh:** 12.000 SV, 60% dồn vào 3 phút đầu (~120 req/s). Cần bảo vệ backend.

**Quyết định:** Token Bucket algorithm, implement trên Redis.

**Lý do:**

- Cho phép burst ngắn hạn (SV bấm nhanh 2–3 lần) nhưng giới hạn sustained rate.
- Smooth hơn Fixed Window (tránh vấn đề edge-of-window).
- Redis là single source of truth cho token count → hoạt động đúng cả khi scale ngang.

**Đánh đổi:**

- Phụ thuộc Redis — nếu Redis down, rate limiting không hoạt động.
- Mitigation: fallback cho phép request khi Redis down (fail-open), kèm monitoring alert.

---

### ADR-003: Circuit Breaker cho Payment Gateway

**Bối cảnh:** Payment gateway có thể lỗi liên tục. Không được để payment lỗi kéo sập hệ thống.

**Quyết định:** Implement Circuit Breaker pattern (CLOSED → OPEN → HALF_OPEN).

**Lý do:**

- **Fault isolation**: Payment lỗi không ảnh hưởng workshop listing, đăng ký miễn phí, check-in.
- **Fail fast**: Khi biết gateway down, reject ngay thay vì đợi timeout (giảm latency, tiết kiệm resource).
- **Self-healing**: Tự thử lại sau 60s, tự phục hồi khi gateway hoạt động lại.

**Đánh đổi:**

- SV không thanh toán được khi CB OPEN → UX giảm cho workshop có phí.
- Mitigation: hiển thị thông báo rõ ràng "Hệ thống thanh toán tạm thời gián đoạn, vui lòng thử lại sau", giữ seat hold.

---

### ADR-004: Idempotency Key cho Payment

**Bối cảnh:** Client retry payment khi network timeout → nguy cơ double charge.

**Quyết định:** Bắt buộc `Idempotency-Key` header (UUID v4) cho mọi payment request. Server lưu response vào Redis (TTL 24h) và replay khi gặp key trùng.

**Lý do:**

- **Chống double charge** một cách deterministic — không phụ thuộc vào timing hay race condition.
- Stateless check (Redis lookup < 10ms) — không ảnh hưởng performance.
- Client-generated key → client kiểm soát retry behavior.

**Đánh đổi:**

- Phụ thuộc Redis cho dedup — nếu Redis mất data trước TTL hết, có thể xử lý trùng.
- Mitigation: TTL 24h đủ dài cho mọi retry scenario thực tế. Redis persistence (RDB + AOF) bảo vệ khỏi restart.
- Thêm database unique constraint trên `idempotency_key` làm safety net cuối cùng.
