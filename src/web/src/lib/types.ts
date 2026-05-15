// ============================================================
// TypeScript interfaces mirroring backend API responses
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp?: string;
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface User {
  id: string;
  name: string;
  studentId: string;
  email: string;
  role: 'STUDENT' | 'ORGANIZER' | 'CHECKIN_STAFF';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface Workshop {
  id: string;
  title: string;
  description: string | null;
  speaker: string | null;
  room: string | null;
  roomMapUrl: string | null;
  startTime: string;
  endTime: string;
  maxSeats: number;
  availableSeats: number;
  price: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Registration {
  id: string;
  workshopId: string;
  studentId: string;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED';
  qrCode?: string;
  workshopTitle?: string;
  seatHoldExpiresAt?: string;
  paymentUrl?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  registrationId: string;
  amount: number;
  currency: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transactionId: string;
  paidAt: string;
}

export interface PaymentStats {
  totalRevenue: number;
  totalTransactions: number;
  completedPayments: number;
}

export interface RegistrationStats {
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  checkedIn: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface AiSummary {
  workshopId: string;
  summary: string | null;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  generatedAt: string | null;
}
