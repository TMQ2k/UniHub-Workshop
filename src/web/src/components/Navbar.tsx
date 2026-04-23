'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const { user, loading, logout, isOrganizer } = useAuth();
  const router = useRouter();

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
          <Link
            href="/"
            className="text-sm font-medium text-gray-300 transition-colors hover:text-white"
          >
            Workshops
          </Link>

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
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gray-300">
                    {user.role === 'ORGANIZER' ? '🛡️' : '🎓'} {user.name || user.studentId}
                  </span>
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
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
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
