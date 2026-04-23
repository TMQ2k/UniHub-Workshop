'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiRequestError } from '@/lib/api';
import ErrorAlert, { SuccessAlert } from '@/components/ErrorAlert';

// ============================================================
// Create Workshop Form — ORGANIZER only
// ============================================================

export default function CreateWorkshopPage() {
  const { user, accessToken, loading: authLoading, isOrganizer } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    title: '',
    description: '',
    speaker: '',
    room: '',
    startTime: '',
    endTime: '',
    maxSeats: 60,
    price: 0,
  });
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isOrganizer())) {
      router.push('/login');
    }
  }, [authLoading, user, isOrganizer, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'maxSeats' || name === 'price' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      await apiFetch('/workshops', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({
          ...form,
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
        }),
      });
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ message: 'Đã có lỗi xảy ra.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return <div className="py-20 text-center text-gray-500">Đang tải...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
      >
        ← Quay lại Dashboard
      </Link>

      <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-8 backdrop-blur-sm">
        <h1 className="mb-6 text-2xl font-bold text-white">Tạo Workshop mới</h1>

        {error && (
          <div className="mb-5">
            <ErrorAlert code={error.code} message={error.message} onDismiss={() => setError(null)} />
          </div>
        )}
        {success && (
          <div className="mb-5">
            <SuccessAlert message="Workshop đã được tạo! Đang chuyển hướng..." />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-400">
              Tiêu đề *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="VD: Kỹ năng viết CV chuyên nghiệp"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-400">
              Mô tả
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={form.description}
              onChange={handleChange}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Mô tả chi tiết về workshop..."
            />
          </div>

          {/* Speaker + Room */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="speaker" className="mb-1 block text-sm font-medium text-gray-400">
                Diễn giả
              </label>
              <input
                id="speaker"
                name="speaker"
                type="text"
                value={form.speaker}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="VD: TS. Nguyễn Văn A"
              />
            </div>
            <div>
              <label htmlFor="room" className="mb-1 block text-sm font-medium text-gray-400">
                Phòng
              </label>
              <input
                id="room"
                name="room"
                type="text"
                value={form.room}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="VD: B.201"
              />
            </div>
          </div>

          {/* Start + End time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="startTime" className="mb-1 block text-sm font-medium text-gray-400">
                Bắt đầu *
              </label>
              <input
                id="startTime"
                name="startTime"
                type="datetime-local"
                value={form.startTime}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="endTime" className="mb-1 block text-sm font-medium text-gray-400">
                Kết thúc *
              </label>
              <input
                id="endTime"
                name="endTime"
                type="datetime-local"
                value={form.endTime}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Max seats + Price */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="maxSeats" className="mb-1 block text-sm font-medium text-gray-400">
                Số chỗ ngồi *
              </label>
              <input
                id="maxSeats"
                name="maxSeats"
                type="number"
                min={1}
                max={500}
                value={form.maxSeats}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="price" className="mb-1 block text-sm font-medium text-gray-400">
                Giá vé (VND, 0 = miễn phí)
              </label>
              <input
                id="price"
                name="price"
                type="number"
                min={0}
                value={form.price}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Đang tạo...' : 'Tạo Workshop'}
          </button>
        </form>
      </div>
    </div>
  );
}
