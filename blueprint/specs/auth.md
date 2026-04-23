# Đặc tả: Authentication & Authorization (Auth)

## Mô tả

Module xác thực và phân quyền cho toàn bộ hệ thống UniHub Workshop. Sử dụng **JWT** (JSON Web Token) với cơ chế **access token + refresh token** để hỗ trợ stateless authentication phù hợp cho cả web và mobile. Phân quyền theo mô hình **RBAC** (Role-Based Access Control) với 3 roles: `STUDENT`, `ORGANIZER`, `CHECKIN_STAFF`.

## Actor

| Actor | Vai trò trong module |
|-------|---------------------|
| Sinh viên | Đăng ký tài khoản hoặc đăng nhập bằng MSSV + mật khẩu, nhận JWT, truy cập tài nguyên theo quyền STUDENT |
| Ban tổ chức | Đăng nhập, truy cập trang admin với quyền ORGANIZER |
| Nhân sự check-in | Đăng nhập trên mobile app, truy cập chức năng quét QR với quyền CHECKIN_STAFF |
| System (CSV Sync) | Tạo tài khoản sinh viên tự động khi import CSV (mật khẩu mặc định). Sử dụng `AuthService.hashPassword()` static method |

## Luồng chính

### Luồng 1 — Đăng ký tài khoản (Register)

1. Client gửi `POST /auth/register` với `{ fullName, email, password, studentId? }`.
2. Server kiểm tra email đã tồn tại → nếu có: trả `409 EMAIL_ALREADY_EXISTS`.
3. Nếu `studentId` được cung cấp → kiểm tra trùng → nếu trùng: trả `409 STUDENT_ID_EXISTS`.
4. Nếu `studentId` không cung cấp → tự sinh mã theo format `SV###` (auto-increment).
5. Hash mật khẩu bằng **bcrypt**, tạo user với `role = STUDENT`.
6. Tạo cặp **access token + refresh token**, lưu hash refresh token vào DB.
7. Trả `201 Created` với `{ accessToken, refreshToken, user }`.

### Luồng 2 — Đăng nhập (Login)

1. Client gửi `POST /auth/login` với `{ studentId, password }`.
2. Server tìm user theo `studentId` trong database.
3. Nếu không tìm thấy hoặc mật khẩu sai: trả `401 INVALID_CREDENTIALS` (không phân biệt field sai).
4. Nếu tài khoản bị khóa (`isLocked = true`): trả `403 ACCOUNT_LOCKED`.
5. Nếu hợp lệ:
   - Tạo **access token** (JWT) chứa `{ sub: userId, role: string }`.
   - Tạo **refresh token** (JWT), lưu hash (SHA-256) vào database.
   - Trả `{ accessToken, refreshToken, user: { id, name, studentId, role } }`.

### Luồng 3 — Refresh Token

1. Client gửi `POST /auth/refresh` với `{ refreshToken }`.
2. Server verify refresh token bằng `JWT_REFRESH_SECRET`.
3. Tìm user theo `sub`, kiểm tra hash trong database khớp.
4. Nếu hợp lệ: tạo cặp access + refresh token mới (token rotation), lưu hash mới.
5. Nếu không hợp lệ hoặc đã revoke: trả `401 TOKEN_EXPIRED`.

### Luồng 4 — Kiểm tra quyền truy cập (Authorization)

1. Client gửi request kèm header `Authorization: Bearer <accessToken>`.
2. `JwtAuthGuard` verify token bằng `JWT_ACCESS_SECRET`, extract `userId` và `role`.
3. `RolesGuard` kiểm tra `role` có nằm trong danh sách roles được phép cho endpoint (qua `@Roles()` decorator).
4. Nếu đủ quyền: cho phép tiếp tục.
5. Nếu thiếu quyền: trả `403 FORBIDDEN`.

### Luồng 5 — Đăng xuất (Logout)

1. Client gửi `POST /auth/logout` kèm access token.
2. Server set `refreshTokenHash = null` trong database.
3. Trả `200 OK`.

### Luồng 6 — Xem thông tin cá nhân (Profile)

1. Client gửi `GET /auth/me` kèm access token.
2. Server tìm user theo `userId` từ JWT payload.
3. Trả `{ id, name, studentId, email, role }`.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP Status |
|----------|-------|------------|-------------|
| Sai MSSV hoặc mật khẩu | Trả lỗi, không phân biệt sai field nào (chống enumeration) | `INVALID_CREDENTIALS` | 401 |
| Access token hết hạn | Client dùng refresh token để lấy token mới | `TOKEN_EXPIRED` | 401 |
| Refresh token hết hạn/bị revoke | Yêu cầu đăng nhập lại | `TOKEN_EXPIRED` | 401 |
| Truy cập endpoint không đủ quyền | Từ chối ngay | `FORBIDDEN` | 403 |
| Account bị khóa (locked) | Từ chối đăng nhập | `ACCOUNT_LOCKED` | 403 |
| Email đã tồn tại khi đăng ký | Từ chối | `EMAIL_ALREADY_EXISTS` | 409 |
| MSSV đã tồn tại khi đăng ký | Từ chối | `STUDENT_ID_EXISTS` | 409 |

## Ràng buộc

### Bảo mật
- Mật khẩu lưu dưới dạng **bcrypt hash** (salt rounds = 10).
- Access token TTL mặc định = **15 phút**, refresh token TTL mặc định = **7 ngày** (configurable qua `JWT_ACCESS_EXPIRES_IN` và `JWT_REFRESH_EXPIRES_IN`).
- Refresh token lưu **hash** (SHA-256) trong database, không lưu plaintext.
- JWT sử dụng **2 secret keys riêng biệt**: `JWT_ACCESS_SECRET` cho access token, `JWT_REFRESH_SECRET` cho refresh token.
- Response lỗi đăng nhập **không** tiết lộ field nào sai (chống user enumeration).
- Refresh token rotation: mỗi lần refresh, token cũ bị revoke, cấp token hoàn toàn mới.

### Hiệu năng
- Login endpoint phải respond < **500ms** (bao gồm bcrypt verify).
- Token verification < **10ms** (stateless JWT).

### RBAC Permission Matrix

| Permission | STUDENT | ORGANIZER | CHECKIN_STAFF |
|-----------|---------|-----------|---------------|
| `workshop:read` | ✅ | ✅ | ❌ |
| `workshop:write` | ❌ | ✅ | ❌ |
| `registration:create` | ✅ | ❌ | ❌ |
| `registration:read:own` | ✅ | ✅ | ❌ |
| `registration:read:all` | ❌ | ✅ | ❌ |
| `payment:create` | ✅ | ❌ | ❌ |
| `checkin:scan` | ❌ | ❌ | ✅ |
| `stats:read` | ❌ | ✅ | ❌ |
| `csv-sync:manage` | ❌ | ✅ | ❌ |
| `ai-summary:upload` | ❌ | ✅ | ❌ |

## Tiêu chí chấp nhận

- [x] Sinh viên đăng ký tài khoản mới, nhận được access + refresh token.
- [x] Sinh viên đăng nhập thành công bằng MSSV + mật khẩu, nhận được access + refresh token.
- [x] Refresh token flow hoạt động đúng: token cũ bị revoke (rotation), token mới được cấp.
- [x] Endpoint có decorator `@Roles('ORGANIZER')` từ chối request của STUDENT với 403.
- [x] Tài khoản bị khóa (`isLocked = true`) → từ chối đăng nhập.
- [x] Logout revoke refresh token (set hash = null), không thể dùng lại.
- [x] `GET /auth/me` trả thông tin profile của user đang đăng nhập.

## API Contract

### POST /auth/register

**Request:**
```json
{
  "fullName": "Nguyễn Văn A",
  "email": "vana@student.hcmus.edu.vn",
  "password": "string",
  "studentId": "21127001"  // Optional — auto-generated nếu bỏ trống
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "dGhpcyBpcyBhIHJlZnJl...",
    "user": {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "studentId": "21127001",
      "role": "STUDENT"
    }
  },
  "meta": { "timestamp": "2026-04-22T07:00:00Z" }
}
```

### POST /auth/login

**Request:**
```json
{
  "studentId": "21127001",
  "password": "string"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "dGhpcyBpcyBhIHJlZnJl...",
    "user": {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "studentId": "21127001",
      "role": "STUDENT"
    }
  },
  "meta": { "timestamp": "2026-04-22T07:00:00Z" }
}
```

**Response (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Thông tin đăng nhập không đúng."
  }
}
```

### POST /auth/refresh

**Request:**
```json
{
  "refreshToken": "dGhpcyBpcyBhIHJlZnJl..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "bmV3IHJlZnJlc2ggdG9r..."
  },
  "meta": { "timestamp": "2026-04-22T07:15:00Z" }
}
```

### POST /auth/logout

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "success": true,
  "data": null,
  "meta": { "timestamp": "2026-04-22T08:00:00Z" }
}
```

### GET /auth/me

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "studentId": "21127001",
    "email": "vana@student.hcmus.edu.vn",
    "role": "STUDENT"
  },
  "meta": { "timestamp": "2026-04-22T07:00:00Z" }
}
```
