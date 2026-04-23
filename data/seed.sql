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
                        CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED')),
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
-- Password: "Admin@123" (bcrypt hash)
-- ============================================================

INSERT INTO users (id, student_id, full_name, email, password_hash, role, faculty)
VALUES
    (
        uuid_generate_v4(),
        'ADMIN001',
        'Nguyen Van Admin',
        'admin@unihub.edu.vn',
        '$2b$10$8KzaNdKIMyOkASCak1p1AOJopCmXD1MUsG9M/KTU.RWEKmhCJCLiy',
        'ORGANIZER',
        'Ban Tổ Chức'
    ),
    (
        uuid_generate_v4(),
        'STAFF001',
        'Tran Thi Staff',
        'staff@unihub.edu.vn',
        '$2b$10$8KzaNdKIMyOkASCak1p1AOJopCmXD1MUsG9M/KTU.RWEKmhCJCLiy',
        'CHECKIN_STAFF',
        'Ban Tổ Chức'
    ),
    (
        uuid_generate_v4(),
        'SV001',
        'Le Van Sinh Vien',
        'sinhvien@unihub.edu.vn',
        '$2b$10$8KzaNdKIMyOkASCak1p1AOJopCmXD1MUsG9M/KTU.RWEKmhCJCLiy',
        'STUDENT',
        'Công nghệ Thông tin'
    )
ON CONFLICT (email) DO NOTHING;
