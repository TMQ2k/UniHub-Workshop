'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';

// ============================================================
// My Registrations — STUDENT only
// GET /registrations/me
// ============================================================

interface MyRegistration {
  id: string;
  workshopId: string;
  workshopTitle: string;
  status: 'CONFIRMED' | 'PENDING_PAYMENT' | 'CANCELLED';
  qrCode?: string;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  CONFIRMED: { label: 'Đã xác nhận', color: 'bg-emerald-500/20 text-emerald-400', icon: '✅' },
  PENDING_PAYMENT: { label: 'Chờ thanh toán', color: 'bg-amber-500/20 text-amber-400', icon: '⏳' },
  CANCELLED: { label: 'Đã hủy', color: 'bg-red-500/20 text-red-400 line-through', icon: '❌' },
};

export default function MyRegistrationsPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();

  const [registrations, setRegistrations] = useState<MyRegistration[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedQr, setExpandedQr] = useState<string | null>(null);

  const isStudent = user?.role === 'STUDENT';

  const fetchRegistrations = useCallback(async () => {
    if (!accessToken) return;
    setLoadingData(true);
    try {
      const data = await apiFetch<MyRegistration[]>('/registrations/me', {
        token: accessToken,
      });
      setRegistrations(Array.isArray(data) ? data : []);
    } catch {
      setError('Không thể tải danh sách đăng ký.');
    }
    setLoadingData(false);
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && (!user || !isStudent)) {
      router.push('/login');
      return;
    }
    if (accessToken) fetchRegistrations();
  }, [authLoading, user, isStudent, accessToken, router, fetchRegistrations]);

  const handleCancel = async (id: string) => {
    if (!accessToken || cancellingId) return;
    const confirmed = window.confirm('Bạn có chắc muốn hủy đăng ký workshop này?');
    if (!confirmed) return;

    setCancellingId(id);
    setError(null);
    try {
      await apiFetch(`/registrations/${id}`, {
        method: 'DELETE',
        token: accessToken,
      });
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'CANCELLED' as const } : r)),
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Không thể hủy đăng ký.');
      }
    }
    setCancellingId(null);
  };

  // ── Loading ───────────────────────────────────────────────
  if (authLoading || loadingData) {
    return (
      <div className="py-20 text-center text-gray-500">
        <div className="inline-flex items-center gap-2">
          <svg className="h-5 w-5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải...
        </div>
      </div>
    );
  }

  if (!user || !isStudent) return null;

  // Stats
  const confirmed = registrations.filter((r) => r.status === 'CONFIRMED').length;
  const pending = registrations.filter((r) => r.status === 'PENDING_PAYMENT').length;
  const cancelled = registrations.filter((r) => r.status === 'CANCELLED').length;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📝 Đăng ký của tôi</h1>
          <p className="mt-1 text-sm text-gray-400">
            {registrations.length} đăng ký
            {confirmed > 0 && <> · <span className="text-emerald-400">{confirmed} xác nhận</span></>}
            {pending > 0 && <> · <span className="text-amber-400">{pending} chờ TT</span></>}
            {cancelled > 0 && <> · <span className="text-red-400">{cancelled} đã hủy</span></>}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30"
        >
          + Đăng ký thêm
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          ⚠️ {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Empty state */}
      {registrations.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-gray-900/60 px-8 py-16 text-center backdrop-blur-sm">
          <div className="mb-4 text-5xl">📭</div>
          <p className="text-lg font-medium text-gray-400">Bạn chưa đăng ký workshop nào</p>
          <p className="mt-2 text-sm text-gray-500">
            Hãy khám phá các workshop đang mở và đăng ký ngay!
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            Xem Workshops →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((r) => {
            const cfg = statusConfig[r.status] || statusConfig.CONFIRMED;
            const isExpanded = expandedQr === r.id;

            return (
              <div
                key={r.id}
                className={`rounded-xl border backdrop-blur-sm transition-all ${
                  r.status === 'CANCELLED'
                    ? 'border-white/5 bg-gray-900/30 opacity-60'
                    : 'border-white/10 bg-gray-900/60'
                }`}
              >
                <div className="p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/workshops/${r.workshopId}`}
                        className="text-sm font-semibold text-white transition-colors hover:text-indigo-400"
                      >
                        {r.workshopTitle || 'Workshop'}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          Đăng ký: {new Date(r.createdAt).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.status === 'CONFIRMED' && r.qrCode && (
                        <button
                          onClick={() => setExpandedQr(isExpanded ? null : r.id)}
                          className="rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30"
                        >
                          {isExpanded ? '🔽 Ẩn QR' : '📱 Xem QR'}
                        </button>
                      )}
                      {r.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          disabled={cancellingId === r.id}
                          className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
                        >
                          {cancellingId === r.id ? '...' : '✕ Hủy'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* QR Code expanded */}
                  {isExpanded && r.qrCode && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-center">
                      <p className="mb-3 text-xs font-medium text-gray-400">📱 Mã QR Check-in</p>
                      <div className="mx-auto inline-block rounded-2xl bg-white p-4 shadow-lg shadow-indigo-500/10">
                        <QRCodeSVG
                          value={r.qrCode}
                          size={200}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#1e1b4b"
                        />
                      </div>
                      <p className="mt-3 text-xs text-gray-500">
                        Đưa mã QR này cho nhân viên quét khi đến workshop
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
