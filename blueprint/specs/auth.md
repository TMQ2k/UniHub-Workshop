# Đặc tả: Authentication & Authorization

## Mô tả

Module xác thực và phân quyền cho toàn bộ hệ thống UniHub Workshop. Sử dụng JWT (JSON Web Token) với cơ chế access token + refresh token. Phân quyền theo mô hình RBAC (Role-Based Access Control) với 3 vai trò: STUDENT, ORGANIZER, CHECKIN_STAFF.

---

## Actor

| Actor | Mô tả |
|-------|--------|
| **Sinh viên (STUDENT)** | Đăng nhập bằng tài khoản sinh viên, xem/đăng ký workshop |
| **Ban tổ chức (ORGANIZER)** | Đăng nhập với quyền quản trị, tạo/quản lý workshop |
| **Nhân sự check-in (CHECKIN_STAFF)** | Đăng nhập trên mobile app, chỉ có quyền quét QR |
| **Hệ thống** | Tự động refresh token, validate request |

---

## Luồng chính

### LC-01: Đăng nhập (Login)

```
1. Client gửi POST /auth/login với { email, password }
2. Server validate credentials
3. Nếu hợp lệ:
   a. Tạo access token (JWT, TTL = 15 phút)
   b. Tạo refresh token (JWT, TTL = 7 ngày)
   c. Lưu refresh token hash vào database
   d. Trả về { accessToken, refreshToken, user: { id, email, role } }
4. Client lưu tokens (web: httpOnly cookie, mobile: SecureStore)
```

### LC-02: Refresh Token

```
1. Client gửi POST /auth/refresh với { refreshToken }
2. Server verify refresh token:
   a. Kiểm tra JWT signature + expiry
   b. Kiểm tra token hash tồn tại trong database
3. Nếu hợp lệ:
   a. Tạo access token mới
   b. Tạo refresh token mới (token rotation)
   c. Xóa refresh token cũ, lưu token mới
   d. Trả về { accessToken, refreshToken }
```

### LC-03: Đăng xuất (Logout)

```
1. Client gửi POST /auth/logout với Authorization header
2. Server xóa refresh token khỏi database
3. Trả về { success: true }
4. Client xóa tokens khỏi local storage
```

### LC-04: Xác thực request (Authentication Middleware)

```
1. Request đến server với header Authorization: Bearer <accessToken>
2. JwtAuthGuard extract và verify token
3. Nếu hợp lệ → gắn user info vào request object
4. Nếu không hợp lệ → trả 401 Unauthorized
```

### LC-05: Kiểm tra quyền (Authorization)

```
1. Sau khi xác thực, RolesGuard kiểm tra role của user
2. So sánh với @Roles() decorator trên endpoint
3. Nếu đủ quyền → cho phép tiếp tục
4. Nếu không đủ quyền → trả 403 Forbidden
```

---

## Ma trận phân quyền RBAC

| Quyền | STUDENT | ORGANIZER | CHECKIN_STAFF |
|-------|---------|-----------|---------------|
| `workshop:read` | ✅ | ✅ | ❌ |
| `workshop:write` | ❌ | ✅ | ❌ |
| `registration:create` | ✅ | ✅ | ❌ |
| `registration:read:own` | ✅ | ✅ | ❌ |
| `registration:read:all` | ❌ | ✅ | ❌ |
| `checkin:self` | ✅ | ✅ | ❌ |
| `checkin:scan` | ❌ | ❌ | ✅ |
| `stats:read` | ❌ | ✅ | ❌ |

---

## Kịch bản lỗi

| # | Kịch bản | Xử lý | HTTP Status | Error Code |
|---|----------|--------|-------------|------------|
| E-01 | Email không tồn tại | Trả lỗi chung "Invalid credentials" (không leak info) | 401 | `INVALID_CREDENTIALS` |
| E-02 | Mật khẩu sai | Trả lỗi chung "Invalid credentials" | 401 | `INVALID_CREDENTIALS` |
| E-03 | Access token hết hạn | Trả 401, client tự refresh | 401 | `TOKEN_EXPIRED` |
| E-04 | Refresh token hết hạn | Trả 401, buộc đăng nhập lại | 401 | `REFRESH_TOKEN_EXPIRED` |
| E-05 | Refresh token bị revoke | Trả 401, buộc đăng nhập lại | 401 | `TOKEN_REVOKED` |
| E-06 | Không có quyền truy cập | Trả 403 Forbidden | 403 | `FORBIDDEN` |
| E-07 | Token không hợp lệ (tampered) | Trả 401 | 401 | `INVALID_TOKEN` |
| E-08 | Brute force login (>5 lần sai/phút) | Rate limit, trả 429 | 429 | `TOO_MANY_ATTEMPTS` |

---

## Ràng buộc

- **Password hashing**: bcrypt với salt rounds = 10
- **Access token TTL**: 15 phút (không đổi, hardcode là constant)
- **Refresh token TTL**: 7 ngày
- **Token rotation**: Mỗi lần refresh tạo token mới, xóa token cũ (chống replay attack)
- **Không implement OAuth/Social login** ở Phase 1 (YAGNI)
- **Không implement email verification** ở Phase 1 (YAGNI)
- **Sử dụng thư viện**: `@nestjs/passport`, `@nestjs/jwt`, `passport-jwt`
- **Không tự implement JWT logic** — dùng library chuẩn

---

## Tiêu chí chấp nhận

- [ ] Đăng nhập với email/password hợp lệ → nhận access + refresh token
- [ ] Access token hết hạn → gọi refresh → nhận token mới
- [ ] Refresh token rotation hoạt động (token cũ bị vô hiệu)
- [ ] STUDENT không truy cập được endpoint của ORGANIZER → 403
- [ ] CHECKIN_STAFF chỉ truy cập được endpoint quét QR
- [ ] Login sai > 5 lần/phút → bị rate limit (429)
- [ ] Logout → refresh token bị xóa, không dùng lại được

---

## API Contract

### POST `/auth/login`

**Request:**
```json
{
  "email": "student@university.edu.vn",
  "password": "securepassword123"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "student@university.edu.vn",
      "fullName": "Nguyễn Văn A",
      "role": "STUDENT"
    }
  },
  "meta": { "timestamp": "2026-04-22T12:00:00Z" }
}
```

**Response 401:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email hoặc mật khẩu không đúng"
  }
}
```

---

### POST `/auth/refresh`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...(new)",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...(new)"
  },
  "meta": { "timestamp": "2026-04-22T12:15:00Z" }
}
```

---

### POST `/auth/logout`

**Headers:** `Authorization: Bearer <accessToken>`

**Response 200:**
```json
{
  "success": true,
  "data": null,
  "meta": { "timestamp": "2026-04-22T12:30:00Z" }
}
```

---

### GET `/auth/me`

**Headers:** `Authorization: Bearer <accessToken>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "student@university.edu.vn",
    "fullName": "Nguyễn Văn A",
    "studentId": "2021001234",
    "role": "STUDENT"
  },
  "meta": { "timestamp": "2026-04-22T12:00:00Z" }
}
```
