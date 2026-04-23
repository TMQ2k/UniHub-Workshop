'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import ErrorAlert from '@/components/ErrorAlert';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    studentId: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError({ message: 'Mật khẩu xác nhận không khớp.' });
      return;
    }

    setLoading(true);

    try {
      const body: Record<string, string> = {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
      };
      if (form.studentId.trim()) {
        body.studentId = form.studentId.trim();
      }

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError({
          code: json.error?.code,
          message: json.error?.message || json.message?.[0] || 'Đăng ký thất bại.',
        });
        return;
      }

      // Auto-login after successful registration
      await login(json.data.user.studentId, form.password);
      router.push('/');
    } catch {
      setError({ message: 'Đã có lỗi xảy ra. Vui lòng thử lại.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-8 backdrop-blur-sm">
          <h1 className="mb-2 text-center text-2xl font-bold text-white">Đăng ký tài khoản</h1>
          <p className="mb-6 text-center text-sm text-gray-500">
            Tạo tài khoản sinh viên để đăng ký workshop
          </p>

          {error && (
            <div className="mb-4">
              <ErrorAlert
                code={error.code}
                message={error.message}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Student ID */}
            <div>
              <label htmlFor="studentId" className="mb-1 block text-sm font-medium text-gray-400">
                MSSV <span className="text-gray-600">(để trống để tự tạo)</span>
              </label>
              <input
                id="studentId"
                name="studentId"
                type="text"
                value={form.studentId}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="VD: SV002 (tùy chọn)"
              />
            </div>

            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-gray-400">
                Họ và tên *
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={form.fullName}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="VD: Nguyễn Văn A"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-400">
                Email *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="email@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-400">
                Mật khẩu * <span className="text-gray-600">(tối thiểu 6 ký tự)</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-gray-400">
                Xác nhận mật khẩu *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Đang xử lý...' : 'Đăng ký'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-500">
            Đã có tài khoản?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
              Đăng nhập tại đây
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
