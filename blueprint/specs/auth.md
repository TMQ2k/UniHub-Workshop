# Đặc tả: Authentication & Authorization (Auth)

## Mô tả

Module xác thực và phân quyền cho toàn bộ hệ thống UniHub Workshop. Sử dụng **JWT** (JSON Web Token) với cơ chế **access token + refresh token** để hỗ trợ stateless authentication phù hợp cho cả web và mobile. Phân quyền theo mô hình **RBAC** (Role-Based Access Control) với 3 roles: `STUDENT`, `ORGANIZER`, `CHECKIN_STAFF`.

## Actor

| Actor | Vai trò trong module |
|-------|---------------------|
| Sinh viên | Đăng nhập bằng MSSV + mật khẩu, nhận JWT, truy cập tài nguyên theo quyền STUDENT |
| Ban tổ chức | Đăng nhập, truy cập trang admin với quyền ORGANIZER |
| Nhân sự check-in | Đăng nhập trên mobile app, truy cập chức năng quét QR với quyền CHECKIN_STAFF |
| System (CSV Sync) | Tạo tài khoản sinh viên tự động khi import CSV (mật khẩu mặc định) |

## Luồng chính

### Luồng 1 — Đăng nhập (Login)

1. Client gửi `POST /auth/login` với `{ studentId, password }` hoặc `{ email, password }`.
2. Server xác thực credentials trong database.
3. Nếu hợp lệ:
   - Tạo **access token** (JWT, TTL = 15 phút) chứa `{ sub: userId, role: string }`.
   - Tạo **refresh token** (JWT, TTL = 7 ngày), lưu hash vào database.
   - Trả về `{ accessToken, refreshToken, user: { id, name, role } }`.
4. Nếu không hợp lệ: trả `401 INVALID_CREDENTIALS`.

### Luồng 2 — Refresh Token

1. Client gửi `POST /auth/refresh` với `{ refreshToken }`.
2. Server verify refresh token, kiểm tra hash trong database.
3. Nếu hợp lệ: tạo cặp access + refresh token mới, revoke token cũ.
4. Nếu không hợp lệ hoặc đã revoke: trả `401 TOKEN_EXPIRED`.

### Luồng 3 — Kiểm tra quyền truy cập (Authorization)

1. Client gửi request kèm header `Authorization: Bearer <accessToken>`.
2. `JwtAuthGuard` verify token, extract `userId` và `role`.
3. `RolesGuard` kiểm tra `role` có nằm trong danh sách roles được phép cho endpoint.
4. Nếu đủ quyền: cho phép tiếp tục.
5. Nếu thiếu quyền: trả `403 FORBIDDEN`.

### Luồng 4 — Đăng xuất (Logout)

1. Client gửi `POST /auth/logout` kèm access token.
2. Server revoke refresh token (xóa hash khỏi database).
3. Trả `200 OK`.

## Kịch bản lỗi

| Kịch bản | Xử lý | Error Code | HTTP Status |
|----------|-------|------------|-------------|
| Sai MSSV hoặc mật khẩu | Trả lỗi, không phân biệt sai field nào (chống enumeration) | `INVALID_CREDENTIALS` | 401 |
| Access token hết hạn | Client dùng refresh token để lấy token mới | `TOKEN_EXPIRED` | 401 |
| Refresh token hết hạn/bị revoke | Yêu cầu đăng nhập lại | `TOKEN_EXPIRED` | 401 |
| Truy cập endpoint không đủ quyền | Từ chối ngay | `FORBIDDEN` | 403 |
| Account bị khóa (locked) | Từ chối đăng nhập | `ACCOUNT_LOCKED` | 403 |
| Đăng nhập sai quá 5 lần trong 15 phút | Khóa tạm account 15 phút | `ACCOUNT_LOCKED` | 429 |

## Ràng buộc

### Bảo mật
- Mật khẩu lưu dưới dạng **bcrypt hash** (salt rounds = 10).
- Access token TTL = **15 phút**, refresh token TTL = **7 ngày**.
- Refresh token lưu **hash** (SHA-256) trong database, không lưu plaintext.
- JWT secret lưu trong biến môi trường `JWT_SECRET`, không hardcode.
- Response lỗi đăng nhập **không** tiết lộ field nào sai (chống user enumeration).

### Hiệu năng
- Login endpoint phải respond < **500ms** (bao gồm bcrypt verify).
- Token verification < **10ms** (stateless JWT).

### RBAC Permission Matrix

| Permission | STUDENT | ORGANIZER | CHECKIN_STAFF |
|-----------|---------|-----------|---------------|
| `workshop:read` | ✅ | ✅ | ❌ |
| `workshop:write` | ❌ | ✅ | ❌ |
| `registration:create` | ✅ | ✅ | ❌ |
| `registration:read:own` | ✅ | ✅ | ❌ |
| `registration:read:all` | ❌ | ✅ | ❌ |
| `checkin:self` | ✅ | ✅ | ❌ |
| `checkin:scan` | ❌ | ❌ | ✅ |
| `stats:read` | ❌ | ✅ | ❌ |

## Tiêu chí chấp nhận

- [ ] Sinh viên đăng nhập thành công bằng MSSV + mật khẩu, nhận được access + refresh token.
- [ ] Access token hết hạn sau 15 phút, refresh token hết hạn sau 7 ngày.
- [ ] Refresh token flow hoạt động đúng: token cũ bị revoke, token mới được cấp.
- [ ] Endpoint có decorator `@Roles('ORGANIZER')` từ chối request của STUDENT với 403.
- [ ] Đăng nhập sai 5 lần liên tiếp → account bị khóa 15 phút.
- [ ] Logout revoke refresh token, không thể dùng lại.

## API Contract

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
    "email": "21127001@student.hcmus.edu.vn",
    "role": "STUDENT"
  },
  "meta": { "timestamp": "2026-04-22T07:00:00Z" }
}
```
