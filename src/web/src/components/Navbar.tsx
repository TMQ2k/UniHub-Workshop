'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const { user, accessToken, loading, logout, isOrganizer } = useAuth();
  const router = useRouter();

  const isStaff = user?.role === 'CHECKIN_STAFF';
  const isStudent = user?.role === 'STUDENT';

  // ── Notification badge count (STUDENT only) ─────────────
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!accessToken || !isStudent) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/notifications/me`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const json = await res.json();
      if (json.success) {
        setUnreadCount(json.meta?.unreadCount ?? 0);
      }
    } catch {
      // Non-critical
    }
  }, [accessToken, isStudent]);

  useEffect(() => {
    fetchUnread();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-sm">
            U
          </span>
          UniHub
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-6">
          {/* Staff cannot see Workshops list or Dashboard */}
          {!isStaff && (
            <Link
              href="/"
              className="text-sm font-medium text-gray-300 transition-colors hover:text-white"
            >
              Workshops
            </Link>
          )}

          {!loading && (
            <>
              {isOrganizer() && (
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-gray-300 transition-colors hover:text-white"
                >
                  Dashboard
                </Link>
              )}

              {user ? (
                <div className="flex items-center gap-4">
                  {/* My Registrations — STUDENT only */}
                  {isStudent && (
                    <Link
                      href="/my-registrations"
                      className="text-sm font-medium text-gray-300 transition-colors hover:text-white"
                    >
                      Đăng ký của tôi
                    </Link>
                  )}
                  {/* Notification bell — STUDENT only */}
                  {isStudent && (
                    <Link
                      href="/notifications"
                      id="notification-bell"
                      className="relative rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                      title="Thông báo"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                      </svg>
                      {unreadCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white shadow-sm shadow-indigo-500/50">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </Link>
                  )}

                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gray-300">
                    {user.role === 'ORGANIZER' ? '🛡️' : user.role === 'CHECKIN_STAFF' ? '📱' : '🎓'} {user.name || user.studentId}
                  </span>
                  {isStaff && (
                    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
                      Dùng app mobile để quét QR
                    </span>
                  )}
                  <button
                    onClick={handleLogout}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/20 hover:text-white"
                  >
                    Đăng xuất
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110"
                >
                  Đăng nhập
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
