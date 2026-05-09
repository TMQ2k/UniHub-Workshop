'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import type { Notification } from '@/lib/types';

// ============================================================
// Notification Inbox — STUDENT only
// ============================================================

/** Map notification type to a display icon */
function typeIcon(type: string): string {
  switch (type) {
    case 'REGISTRATION_CONFIRMED':
      return '📝';
    case 'PAYMENT_CONFIRMED':
      return '💳';
    case 'WORKSHOP_CANCELLED':
      return '🚫';
    default:
      return '🔔';
  }
}

/** Format ISO date to Vietnamese locale */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** How long ago (e.g. "3 phút trước") */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export default function NotificationsPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const isStudent = user?.role === 'STUDENT';

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    setLoadingData(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/notifications/me`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data || []);
        setUnreadCount(json.meta?.unreadCount ?? 0);
      }
    } catch {
      // Non-critical — show empty state
    }
    setLoadingData(false);
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && (!user || !isStudent)) {
      router.push('/login');
      return;
    }
    if (accessToken) fetchNotifications();
  }, [authLoading, user, isStudent, accessToken, router, fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    if (!accessToken || markingId) return;
    setMarkingId(id);
    try {
      await apiFetch(`/notifications/${id}/read`, {
        method: 'PATCH',
        token: accessToken,
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore — optimistic UI
    }
    setMarkingId(null);
  };

  const handleMarkAllRead = async () => {
    if (!accessToken) return;
    const unread = notifications.filter((n) => !n.read);
    for (const n of unread) {
      try {
        await apiFetch(`/notifications/${n.id}/read`, {
          method: 'PATCH',
          token: accessToken,
        });
      } catch {
        // Best-effort
      }
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  // ── Guards ────────────────────────────────────────────────
  if (authLoading || loadingData) {
    return (
      <div className="py-20 text-center text-gray-500">
        <div className="inline-flex items-center gap-2">
          <svg className="h-5 w-5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải thông báo...
        </div>
      </div>
    );
  }

  if (!user || !isStudent) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🔔 Thông báo</h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-gray-400">
              Bạn có <span className="font-semibold text-indigo-400">{unreadCount}</span> thông báo chưa đọc
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30"
          >
            ✓ Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-gray-900/60 px-8 py-16 text-center backdrop-blur-sm">
          <div className="mb-4 text-5xl">📭</div>
          <p className="text-lg font-medium text-gray-400">Chưa có thông báo nào</p>
          <p className="mt-2 text-sm text-gray-500">
            Khi bạn đăng ký workshop thành công, thông báo sẽ hiển thị ở đây.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
          >
            ← Xem danh sách Workshop
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`group relative rounded-xl border backdrop-blur-sm transition-all ${
                n.read
                  ? 'border-white/5 bg-gray-900/40'
                  : 'border-indigo-500/20 bg-indigo-500/5 shadow-sm shadow-indigo-500/10'
              }`}
            >
              {/* Unread indicator dot */}
              {!n.read && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <span className="flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  </span>
                </div>
              )}

              <div className={`px-5 py-4 ${!n.read ? 'pl-9' : ''}`}>
                {/* Top row: icon + title + time */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-0.5 text-lg flex-shrink-0">{typeIcon(n.type)}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium leading-snug ${n.read ? 'text-gray-300' : 'text-white'}`}>
                        {n.title}
                      </p>
                      <p className={`mt-1 text-sm leading-relaxed ${n.read ? 'text-gray-500' : 'text-gray-400'}`}>
                        {n.body}
                      </p>
                    </div>
                  </div>

                  {/* Mark read button */}
                  {!n.read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      disabled={markingId === n.id}
                      title="Đánh dấu đã đọc"
                      className="flex-shrink-0 rounded-lg p-1.5 text-gray-500 opacity-0 transition-all hover:bg-white/10 hover:text-indigo-400 group-hover:opacity-100 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Time */}
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-xs ${n.read ? 'text-gray-600' : 'text-gray-500'}`}>
                    {timeAgo(n.createdAt)}
                  </span>
                  <span className="text-gray-700">·</span>
                  <span className={`text-xs ${n.read ? 'text-gray-600' : 'text-gray-500'}`}>
                    {formatDate(n.createdAt)}
                  </span>
                  {n.read && (
                    <>
                      <span className="text-gray-700">·</span>
                      <span className="text-xs text-gray-600">✓ Đã đọc</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
