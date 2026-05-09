'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiRequestError } from '@/lib/api';
import ErrorAlert from '@/components/ErrorAlert';
import type { Workshop, PaymentStats } from '@/lib/types';

// ============================================================
// Organizer Dashboard — ORGANIZER role only
// ============================================================

export default function DashboardPage() {
  const { user, accessToken, loading: authLoading, isOrganizer } = useAuth();
  const router = useRouter();

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!accessToken) return;
    setLoadingData(true);

    try {
      // Fetch all workshops (the listing endpoint shows all to authenticated organizer)
      const workshopData = await apiFetch<Workshop[]>('/workshops?page=1&limit=50&status=all', {
        token: accessToken,
      });
      setWorkshops(Array.isArray(workshopData) ? workshopData : []);
    } catch {
      // Try without auth — public endpoint returns PUBLISHED only
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/workshops?page=1&limit=50`,
        );
        const json = await res.json();
        setWorkshops(json.data || []);
      } catch {
        setError('Không thể tải danh sách workshop.');
      }
    }

    try {
      const stats = await apiFetch<PaymentStats>('/payments/stats', {
        token: accessToken,
      });
      setPaymentStats(stats);
    } catch {
      // Payment stats may fail if no payments exist — non-critical
    }

    setLoadingData(false);
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && (!user || !isOrganizer())) {
      router.push('/login');
      return;
    }
    if (accessToken) fetchData();
  }, [authLoading, user, accessToken, isOrganizer, router, fetchData]);

  // ── Actions ───────────────────────────────────────────────
  const handlePublish = async (id: string) => {
    if (!accessToken) return;
    setActionLoading(id);
    try {
      await apiFetch(`/workshops/${id}/publish`, {
        method: 'PATCH',
        token: accessToken,
      });
      await fetchData();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Lỗi khi publish.');
    }
    setActionLoading(null);
  };

  const handleCancel = async (id: string) => {
    if (!accessToken) return;
    setActionLoading(id);
    try {
      await apiFetch(`/workshops/${id}`, {
        method: 'DELETE',
        token: accessToken,
      });
      await fetchData();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Lỗi khi hủy.');
    }
    setActionLoading(null);
  };

  // ── Auth guard ────────────────────────────────────────────
  if (authLoading || loadingData) {
    return <div className="py-20 text-center text-gray-500">Đang tải...</div>;
  }

  if (!user || !isOrganizer()) {
    return null; // Redirecting
  }

  const statusColor: Record<string, string> = {
    DRAFT: 'bg-gray-500/20 text-gray-400',
    PUBLISHED: 'bg-emerald-500/20 text-emerald-400',
    CANCELLED: 'bg-red-500/20 text-red-400',
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">🛡️ Dashboard</h1>
        <Link
          href="/dashboard/workshops/new"
          className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          + Tạo Workshop
        </Link>
      </div>

      {error && (
        <div className="mb-5">
          <ErrorAlert message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Payment Stats */}
      {paymentStats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Tổng doanh thu', value: `${paymentStats.totalRevenue.toLocaleString('vi-VN')}đ`, icon: '💰' },
            { label: 'Giao dịch', value: paymentStats.totalTransactions, icon: '📊' },
            { label: 'Thành công', value: paymentStats.completedPayments, icon: '✅' },
            { label: 'Hoàn tiền', value: paymentStats.refundedPayments, icon: '↩️' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-gray-900/60 p-4 backdrop-blur-sm"
            >
              <p className="text-xs text-gray-500">{stat.icon} {stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Workshop Table */}
      <div className="rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-sm">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Quản lý Workshop</h2>
        </div>

        {workshops.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-500">
            Chưa có workshop nào. Hãy tạo workshop đầu tiên!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3">Workshop</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3">Chỗ ngồi</th>
                  <th className="px-5 py-3">Giá</th>
                  <th className="px-5 py-3 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {workshops.map((w) => (
                  <tr key={w.id} className="transition-colors hover:bg-white/5">
                    <td className="px-5 py-3">
                      <p className="font-medium text-white">{w.title}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(w.startTime).toLocaleDateString('vi-VN')}
                        {w.room ? ` · ${w.room}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor[w.status] || ''}`}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-300">
                      {w.availableSeats}/{w.maxSeats}
                    </td>
                    <td className="px-5 py-3 text-gray-300">
                      {w.price === 0 ? 'Miễn phí' : `${w.price.toLocaleString('vi-VN')}đ`}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {w.status === 'PUBLISHED' && (
                          <Link
                            href={`/dashboard/workshops/${w.id}/registrations`}
                            className="rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30"
                          >
                            📋 Đăng ký
                          </Link>
                        )}
                        {w.status !== 'CANCELLED' && (
                          <Link
                            href={`/dashboard/workshops/${w.id}/edit`}
                            className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-600/30"
                          >
                            ✏️ Sửa
                          </Link>
                        )}
                        {w.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePublish(w.id)}
                            disabled={actionLoading === w.id}
                            className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
                          >
                            Publish
                          </button>
                        )}
                        {w.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleCancel(w.id)}
                            disabled={actionLoading === w.id}
                            className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
                          >
                            Hủy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
