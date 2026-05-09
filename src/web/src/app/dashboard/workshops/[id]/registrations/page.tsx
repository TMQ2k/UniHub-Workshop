'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { RegistrationStats } from '@/lib/types';

// ============================================================
// Workshop Registration List — ORGANIZER only
// GET /registrations?workshopId=:id
// ============================================================

interface RegistrationItem {
  id: string;
  studentId: string;
  studentName: string;
  status: 'CONFIRMED' | 'PENDING_PAYMENT' | 'CANCELLED';
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  CONFIRMED: { label: 'Đã xác nhận', color: 'bg-emerald-500/20 text-emerald-400', icon: '✅' },
  PENDING_PAYMENT: { label: 'Chờ thanh toán', color: 'bg-amber-500/20 text-amber-400', icon: '⏳' },
  CANCELLED: { label: 'Đã hủy', color: 'bg-red-500/20 text-red-400', icon: '❌' },
};

export default function WorkshopRegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: workshopId } = use(params);
  const { user, accessToken, loading: authLoading, isOrganizer } = useAuth();
  const router = useRouter();

  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [meta, setMeta] = useState<RegistrationStats | null>(null);
  const [workshopTitle, setWorkshopTitle] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  const fetchData = useCallback(async () => {
    if (!accessToken || !workshopId) return;
    setLoadingData(true);
    setError(null);

    try {
      // Fetch workshop title
      const wsRes = await fetch(`${API_BASE}/workshops/${workshopId}`);
      const wsJson = await wsRes.json();
      if (wsJson.success) {
        setWorkshopTitle(wsJson.data?.title || '');
      }

      // Fetch registrations
      const regRes = await fetch(
        `${API_BASE}/registrations?workshopId=${workshopId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const regJson = await regRes.json();

      if (!regRes.ok || !regJson.success) {
        setError(regJson.error?.message || 'Không thể tải danh sách đăng ký.');
        return;
      }

      setRegistrations(regJson.data || []);
      setMeta(regJson.meta || null);
    } catch {
      setError('Không thể kết nối đến server.');
    } finally {
      setLoadingData(false);
    }
  }, [accessToken, workshopId]);

  useEffect(() => {
    if (!authLoading && (!user || !isOrganizer())) {
      router.push('/login');
      return;
    }
    if (accessToken) fetchData();
  }, [authLoading, user, isOrganizer, accessToken, router, fetchData]);

  // Filter registrations
  const filtered =
    filter === 'ALL'
      ? registrations
      : registrations.filter((r) => r.status === filter);

  // ── Loading ───────────────────────────────────────────────
  if (authLoading || loadingData) {
    return (
      <div className="py-20 text-center text-gray-500">
        <div className="inline-flex items-center gap-2">
          <svg className="h-5 w-5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải danh sách đăng ký...
        </div>
      </div>
    );
  }

  if (!user || !isOrganizer()) return null;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
      >
        ← Quay lại Dashboard
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          📋 Danh sách đăng ký
        </h1>
        {workshopTitle && (
          <p className="mt-1 text-sm text-gray-400">
            Workshop: <span className="font-semibold text-indigo-400">{workshopTitle}</span>
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      {/* Stats Cards */}
      {meta && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tổng" value={meta.total} color="text-white" bg="bg-white/10" />
          <StatCard label="Đã xác nhận" value={meta.confirmed} color="text-emerald-400" bg="bg-emerald-500/10" />
          <StatCard label="Chờ thanh toán" value={meta.pending} color="text-amber-400" bg="bg-amber-500/10" />
          <StatCard label="Đã hủy" value={meta.cancelled} color="text-red-400" bg="bg-red-500/10" />
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {[
          { key: 'ALL', label: 'Tất cả' },
          { key: 'CONFIRMED', label: '✅ Đã xác nhận' },
          { key: 'PENDING_PAYMENT', label: '⏳ Chờ TT' },
          { key: 'CANCELLED', label: '❌ Đã hủy' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? 'bg-indigo-600/30 text-indigo-300'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Registration Table */}
      <div className="rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-sm">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-500">
            {registrations.length === 0
              ? 'Chưa có sinh viên nào đăng ký workshop này.'
              : 'Không có đăng ký nào khớp bộ lọc.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">MSSV</th>
                  <th className="px-5 py-3">Họ tên</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3">Thời gian đăng ký</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r, index) => {
                  const cfg = statusConfig[r.status] || statusConfig.CONFIRMED;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-white/5">
                      <td className="px-5 py-3 text-gray-500">{index + 1}</td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-sm text-gray-300">{r.studentId}</span>
                      </td>
                      <td className="px-5 py-3 font-medium text-white">
                        {r.studentName || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400">
                        {new Date(r.createdAt).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card Component ─────────────────────────────────────
function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl ${bg} border border-white/5 px-4 py-3 text-center`}>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
