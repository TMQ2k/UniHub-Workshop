'use client';

import { useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiRequestError } from '@/lib/api';
import ErrorAlert, { SuccessAlert } from '@/components/ErrorAlert';
import type { Registration, Payment } from '@/lib/types';

// ============================================================
// Registration + Payment Flow
//
// 1. POST /registrations { workshopId }
// 2. If free → CONFIRMED, show QR
// 3. If paid → PENDING_PAYMENT → auto-generate Idempotency-Key
//    → POST /payments { registrationId } with Idempotency-Key header
// ============================================================

type FlowStep = 'idle' | 'registering' | 'registered_free' | 'pending_payment' | 'paying' | 'paid' | 'error';

export default function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: workshopId } = use(params);
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<FlowStep>('idle');
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Idempotency key: generated ONCE when entering payment step, persisted across retries
  const idempotencyKeyRef = useRef<string | null>(null);

  // ── Step 1: Register ─────────────────────────────────────
  const handleRegister = async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const data = await apiFetch<Registration>('/registrations', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({ workshopId }),
      });

      setRegistration(data);

      if (data.status === 'CONFIRMED') {
        setStep('registered_free');
      } else if (data.status === 'PENDING_PAYMENT') {
        // Generate idempotency key for this payment session
        idempotencyKeyRef.current = crypto.randomUUID();
        setStep('pending_payment');
      }
    } catch (err) {
      setStep('error');
      if (err instanceof ApiRequestError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ message: 'Đã có lỗi xảy ra khi đăng ký.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 2: Pay (with Idempotency-Key) ────────────────────
  const handlePay = async () => {
    if (!accessToken || !registration) return;

    setSubmitting(true);
    setError(null);
    setStep('paying');

    try {
      const data = await apiFetch<Payment>('/payments', {
        method: 'POST',
        token: accessToken,
        headers: {
          'Idempotency-Key': idempotencyKeyRef.current!,
        },
        body: JSON.stringify({ registrationId: registration.id }),
      });

      setPayment(data);
      setStep('paid');
    } catch (err) {
      setStep('pending_payment'); // Allow retry with same idempotency key
      if (err instanceof ApiRequestError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ message: 'Đã có lỗi xảy ra khi thanh toán.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Auth guard ────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="py-20 text-center text-gray-500">Đang tải...</div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="mb-4 text-gray-400">Bạn cần đăng nhập để đăng ký workshop.</p>
        <Link
          href="/login"
          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href={`/workshops/${workshopId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
      >
        ← Quay lại chi tiết
      </Link>

      <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-8 backdrop-blur-sm">
        <h1 className="mb-6 text-2xl font-bold text-white">Đăng ký Workshop</h1>

        {/* Error alert */}
        {error && (
          <div className="mb-5">
            <ErrorAlert
              code={error.code}
              message={error.message}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {/* ── Step: Idle ─────────────────────────────────── */}
        {step === 'idle' && (
          <div>
            <p className="mb-5 text-sm text-gray-400">
              Xác nhận đăng ký cho workshop này? Chỗ ngồi sẽ được giữ ngay khi bạn bấm nút.
            </p>
            <button
              onClick={handleRegister}
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/40 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Đang xử lý...' : 'Xác nhận đăng ký'}
            </button>
          </div>
        )}

        {/* ── Step: Error — allow retry ──────────────────── */}
        {step === 'error' && (
          <div className="flex gap-3">
            <button
              onClick={() => { setStep('idle'); setError(null); }}
              className="flex-1 rounded-lg bg-white/10 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/20"
            >
              Thử lại
            </button>
            <Link
              href={`/workshops/${workshopId}`}
              className="flex-1 rounded-lg bg-white/5 py-2.5 text-center text-sm font-medium text-gray-400 hover:bg-white/10"
            >
              Quay lại
            </Link>
          </div>
        )}

        {/* ── Step: Free registration success ────────────── */}
        {step === 'registered_free' && registration && (
          <div className="space-y-4">
            <SuccessAlert message="Đăng ký thành công! Bạn đã có chỗ." />

            {registration.qrCode && (
              <div className="rounded-xl border border-white/10 bg-gray-800 p-4">
                <p className="mb-2 text-xs font-medium text-gray-500 uppercase">Mã QR Check-in</p>
                <div className="overflow-x-auto rounded-lg bg-gray-950 p-3 font-mono text-xs text-indigo-300">
                  {registration.qrCode}
                </div>
              </div>
            )}

            <Link
              href="/"
              className="block rounded-lg bg-white/10 py-2.5 text-center text-sm font-medium text-gray-300 hover:bg-white/20"
            >
              Về trang chủ
            </Link>
          </div>
        )}

        {/* ── Step: Pending payment ──────────────────────── */}
        {(step === 'pending_payment' || step === 'paying') && registration && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <p className="font-semibold">💳 Workshop có phí — cần thanh toán</p>
              <p className="mt-1 text-amber-400/70">
                Chỗ ngồi được giữ đến{' '}
                {registration.seatHoldExpiresAt
                  ? new Date(registration.seatHoldExpiresAt).toLocaleTimeString('vi-VN')
                  : '15 phút nữa'}
              </p>
            </div>

            {/* Show idempotency key for transparency */}
            <div className="rounded-lg bg-gray-800/50 px-3 py-2 text-xs text-gray-500">
              <span className="font-medium text-gray-400">Idempotency-Key:</span>{' '}
              <code className="text-gray-500">{idempotencyKeyRef.current}</code>
            </div>

            <button
              onClick={handlePay}
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/40 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Đang thanh toán...' : 'Thanh toán ngay'}
            </button>
          </div>
        )}

        {/* ── Step: Payment success ──────────────────────── */}
        {step === 'paid' && payment && (
          <div className="space-y-4">
            <SuccessAlert message="Thanh toán thành công! Đăng ký đã được xác nhận." />

            <div className="rounded-xl border border-white/10 bg-gray-800 p-4">
              <p className="mb-2 text-xs font-medium text-gray-500 uppercase">Thông tin thanh toán</p>
              <div className="space-y-1 text-sm text-gray-300">
                <p>Số tiền: <strong>{payment.amount.toLocaleString('vi-VN')}đ</strong></p>
                <p>Mã GD: <code className="text-indigo-300">{payment.transactionId}</code></p>
                <p>Trạng thái: <span className="text-emerald-400">{payment.status}</span></p>
              </div>
            </div>

            <Link
              href="/"
              className="block rounded-lg bg-white/10 py-2.5 text-center text-sm font-medium text-gray-300 hover:bg-white/20"
            >
              Về trang chủ
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
