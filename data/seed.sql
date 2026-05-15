-- ============================================================
-- UniHub Workshop — Database Seed Script
-- Convention: snake_case for table/column names
-- ============================================================

-- Enable uuid-ossp extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      VARCHAR(50) UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'STUDENT'
                    CHECK (role IN ('STUDENT', 'ORGANIZER', 'CHECKIN_STAFF')),
    faculty         VARCHAR(255),
    enrollment_year INT,
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
    is_synced       BOOLEAN NOT NULL DEFAULT FALSE,
    refresh_token_hash VARCHAR(255),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshops (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    speaker         VARCHAR(255),
    room            VARCHAR(100),
    room_map_url    VARCHAR(500),
    start_time      TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time        TIMESTAMP WITH TIME ZONE NOT NULL,
    max_seats       INT NOT NULL DEFAULT 0,
    available_seats INT NOT NULL DEFAULT 0,
    price           INT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id             UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    student_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT'
                            CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED')),
    qr_code                 VARCHAR(500),
    seat_hold_expires_at    TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id     UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    amount              INT NOT NULL,
    currency            VARCHAR(10) NOT NULL DEFAULT 'VND',
    status              VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                        CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    transaction_id      VARCHAR(255),
    idempotency_key     VARCHAR(255) UNIQUE NOT NULL,
    paid_at             TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS check_ins (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id     UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    scanned_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    scanned_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    source              VARCHAR(20) NOT NULL DEFAULT 'ONLINE'
                        CHECK (source IN ('ONLINE', 'OFFLINE_SYNC')),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(500) NOT NULL,
    body            TEXT,
    channel         VARCHAR(20) NOT NULL DEFAULT 'EMAIL'
                    CHECK (channel IN ('EMAIL', 'APP_PUSH')),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    retry_count     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_summaries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workshop_id     UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    pdf_path        VARCHAR(500),
    summary         TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                    CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    generated_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csv_import_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename        VARCHAR(500) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    total_rows      INT DEFAULT 0,
    inserted        INT DEFAULT 0,
    updated         INT DEFAULT 0,
    skipped         INT DEFAULT 0,
    failed          INT DEFAULT 0,
    errors          JSONB,
    started_at      TIMESTAMP WITH TIME ZONE,
    completed_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES (from design.md)
-- ============================================================

-- Seat locking performance
CREATE INDEX IF NOT EXISTS idx_workshops_status ON workshops(status);
CREATE INDEX IF NOT EXISTS idx_workshops_start_time ON workshops(start_time);

-- Registration lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_workshop_student
    ON registrations(workshop_id, student_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_seat_hold ON registrations(seat_hold_expires_at)
    WHERE status = 'PENDING_PAYMENT';

-- Payment idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key);

-- Check-in dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_registration ON check_ins(registration_id);

-- Notification queue
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- ============================================================
-- SEED DATA — Admin/Organizer users
-- Admin/Staff password: "Admin@123" (bcrypt hash)
-- Student password convention: {MSSV}@unihub (e.g. SV001@unihub)
-- is_synced: TRUE for students from school data, FALSE for admin/staff
-- ============================================================

INSERT INTO users (id, student_id, full_name, email, password_hash, role, faculty, is_synced)
VALUES
    (
        uuid_generate_v4(),
        'ADMIN001',
        'Nguyen Van Admin',
        'admin@unihub.edu.vn',
        '$2b$10$mJq/00Jb.s6.Fz7vQuSilOn4atG6fnws41EscfC8DQ91JKWQazcla',
        'ORGANIZER',
        'Ban Tổ Chức',
        FALSE
    ),
    (
        uuid_generate_v4(),
        'STAFF001',
        'Tran Thi Staff',
        'staff@unihub.edu.vn',
        '$2b$10$mJq/00Jb.s6.Fz7vQuSilOn4atG6fnws41EscfC8DQ91JKWQazcla',
        'CHECKIN_STAFF',
        'Ban Tổ Chức',
        FALSE
    ),
    (
        uuid_generate_v4(),
        'SV001',
        'Le Van Sinh Vien',
        'sinhvien@unihub.edu.vn',
        '$2b$10$etAXcC7E0Y/BA2omIUnDYea4MBpM1s4QowhthZRwIUjBpZF/14K3y',
        'STUDENT',
        'Công nghệ Thông tin',
        TRUE
    )
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- SEED DATA — Workshops (Tuần lễ kỹ năng và nghề nghiệp)
-- Mix of: PUBLISHED (free + paid), DRAFT, CANCELLED
-- Dates use NOW() + interval so they stay in the future
-- ============================================================

DO $$
DECLARE
    admin_id UUID;
BEGIN
    -- Get admin user ID for created_by
    SELECT id INTO admin_id FROM users WHERE student_id = 'ADMIN001' LIMIT 1;

    -- Workshop 1: Free, PUBLISHED — Ngày 1 sáng
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'Kỹ năng viết CV chuyên nghiệp',
        'Hướng dẫn sinh viên cách xây dựng một bản CV nổi bật, phù hợp với từng vị trí ứng tuyển. Bao gồm phân tích các mẫu CV thực tế từ các ứng viên đã trúng tuyển tại Google, VNG và FPT Software.',
        'TS. Nguyễn Thanh Tùng',
        'Hội trường A - Tầng 3',
        'https://maps.app.goo.gl/example1',
        NOW() + INTERVAL '3 days' + INTERVAL '8 hours',
        NOW() + INTERVAL '3 days' + INTERVAL '10 hours',
        60, 60, 0, 'PUBLISHED', admin_id
    ) ON CONFLICT DO NOTHING;

    -- Workshop 2: Free, PUBLISHED — Ngày 1 chiều
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'Phỏng vấn kỹ thuật: Từ LeetCode đến thực chiến',
        'Workshop thực hành giải thuật và cấu trúc dữ liệu, mô phỏng phỏng vấn kỹ thuật tại các công ty công nghệ hàng đầu. Sinh viên sẽ được thực hành mock interview với mentor từ Shopee.',
        'Kỹ sư Lê Hoàng Phúc (Shopee)',
        'Phòng Lab B2-305',
        'https://maps.app.goo.gl/example2',
        NOW() + INTERVAL '3 days' + INTERVAL '13 hours',
        NOW() + INTERVAL '3 days' + INTERVAL '15 hours' + INTERVAL '30 minutes',
        40, 40, 0, 'PUBLISHED', admin_id
    ) ON CONFLICT DO NOTHING;

    -- Workshop 3: Paid, PUBLISHED — Ngày 2 sáng
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'Xây dựng Portfolio với React & Next.js',
        'Hands-on workshop xây dựng trang portfolio cá nhân bằng React và Next.js từ đầu. Bao gồm: thiết kế UI/UX, deploy lên Vercel, tối ưu SEO. Mỗi sinh viên ra về với 1 portfolio hoàn chỉnh.',
        'ThS. Phạm Minh Đức (Freelancer)',
        'Phòng Lab C1-201',
        'https://maps.app.goo.gl/example3',
        NOW() + INTERVAL '4 days' + INTERVAL '8 hours' + INTERVAL '30 minutes',
        NOW() + INTERVAL '4 days' + INTERVAL '11 hours' + INTERVAL '30 minutes',
        35, 35, 50000, 'PUBLISHED', admin_id
    ) ON CONFLICT DO NOTHING;

    -- Workshop 4: Paid, PUBLISHED — Ngày 2 chiều
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'Nhập môn Cloud Computing với AWS',
        'Giới thiệu các dịch vụ AWS phổ biến (EC2, S3, Lambda, RDS). Thực hành deploy một ứng dụng web lên AWS bằng tài khoản AWS Academy. Phí bao gồm tài liệu in và voucher AWS $25.',
        'Kỹ sư Trần Văn Khoa (AWS Solutions Architect)',
        'Hội trường B - Tầng 2',
        'https://maps.app.goo.gl/example4',
        NOW() + INTERVAL '4 days' + INTERVAL '14 hours',
        NOW() + INTERVAL '4 days' + INTERVAL '17 hours',
        50, 50, 100000, 'PUBLISHED', admin_id
    ) ON CONFLICT DO NOTHING;

    -- Workshop 5: Free, PUBLISHED — Ngày 3 sáng
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'Soft Skills: Thuyết trình & Giao tiếp hiệu quả',
        'Rèn luyện kỹ năng thuyết trình trước đám đông, giao tiếp trong môi trường doanh nghiệp. Bao gồm bài tập thực hành storytelling và nhận feedback trực tiếp từ diễn giả.',
        'Chuyên gia Nguyễn Phi Vân',
        'Phòng Seminar D1-101',
        'https://maps.app.goo.gl/example5',
        NOW() + INTERVAL '5 days' + INTERVAL '9 hours',
        NOW() + INTERVAL '5 days' + INTERVAL '11 hours',
        80, 80, 0, 'PUBLISHED', admin_id
    ) ON CONFLICT DO NOTHING;

    -- Workshop 6: Free, PUBLISHED — Ngày 3 chiều
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'AI & Machine Learning: Ứng dụng thực tế trong doanh nghiệp',
        'Tổng quan về cách các doanh nghiệp Việt Nam đang ứng dụng AI/ML vào sản phẩm. Demo live các use-case: chatbot hỗ trợ khách hàng, hệ thống recommendation, xử lý ảnh y tế.',
        'PGS.TS. Lê Đình Duy (VinAI)',
        'Hội trường A - Tầng 3',
        'https://maps.app.goo.gl/example6',
        NOW() + INTERVAL '5 days' + INTERVAL '14 hours',
        NOW() + INTERVAL '5 days' + INTERVAL '16 hours' + INTERVAL '30 minutes',
        100, 100, 0, 'PUBLISHED', admin_id
    ) ON CONFLICT DO NOTHING;

    -- Workshop 7: DRAFT (chưa publish) — Ngày 4
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'DevOps & CI/CD Pipeline cho người mới bắt đầu',
        'Giới thiệu Docker, GitHub Actions, và quy trình CI/CD. Workshop này đang trong quá trình chuẩn bị nội dung.',
        'Đang cập nhật',
        'Chưa xếp phòng',
        NULL,
        NOW() + INTERVAL '6 days' + INTERVAL '8 hours',
        NOW() + INTERVAL '6 days' + INTERVAL '10 hours',
        45, 45, 0, 'DRAFT', admin_id
    ) ON CONFLICT DO NOTHING;

    -- Workshop 8: CANCELLED — Ngày 5
    INSERT INTO workshops (id, title, description, speaker, room, room_map_url, start_time, end_time, max_seats, available_seats, price, status, created_by)
    VALUES (
        uuid_generate_v4(),
        'Blockchain & Web3: Cơ hội nghề nghiệp 2026',
        'Workshop đã bị hủy do diễn giả có lịch trình đột xuất. Ban tổ chức xin lỗi vì sự bất tiện này.',
        'Kỹ sư Hoàng Minh Trí (Axie Infinity)',
        'Phòng Lab B2-305',
        'https://maps.app.goo.gl/example8',
        NOW() + INTERVAL '7 days' + INTERVAL '14 hours',
        NOW() + INTERVAL '7 days' + INTERVAL '16 hours',
        30, 30, 75000, 'CANCELLED', admin_id
    ) ON CONFLICT DO NOTHING;

END $$;
