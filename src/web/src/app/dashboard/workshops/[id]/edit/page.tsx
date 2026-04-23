'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiRequestError } from '@/lib/api';
import ErrorAlert, { SuccessAlert } from '@/components/ErrorAlert';
import type { Workshop } from '@/lib/types';

// ============================================================
// Edit Workshop Form — ORGANIZER only
// ============================================================

/** Convert ISO date string to datetime-local input format */
function toDateTimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    // Use local time components for the input
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export default function EditWorkshopPage() {
  const { user, accessToken, loading: authLoading, isOrganizer } = useAuth();
  const router = useRouter();
  const params = useParams();
  const workshopId = params.id as string;

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
  const [original, setOriginal] = useState<Workshop | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Load existing workshop data ──────────────────────────
  const fetchWorkshop = useCallback(async () => {
    if (!accessToken || !workshopId) return;
    setLoadingData(true);
    try {
      const data = await apiFetch<Workshop>(`/workshops/${workshopId}`, {
        token: accessToken,
      });
      setOriginal(data);
      setForm({
        title: data.title || '',
        description: data.description || '',
        speaker: data.speaker || '',
        room: data.room || '',
        startTime: toDateTimeLocal(data.startTime),
        endTime: toDateTimeLocal(data.endTime),
        maxSeats: data.maxSeats,
        price: data.price,
      });
    } catch (err) {
      setError({
        message: err instanceof ApiRequestError ? err.message : 'Không thể tải dữ liệu workshop.',
      });
    } finally {
      setLoadingData(false);
    }
  }, [accessToken, workshopId]);

  useEffect(() => {
    if (!authLoading && (!user || !isOrganizer())) {
      router.push('/login');
      return;
    }
    if (accessToken) fetchWorkshop();
  }, [authLoading, user, accessToken, isOrganizer, router, fetchWorkshop]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'maxSeats' || name === 'price' ? Number(value) : value,
    }));
  };

  // ── Submit update ────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !workshopId) return;

    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      // Build partial update payload — only send changed fields
      const payload: Record<string, unknown> = {};

      if (form.title !== (original?.title || '')) payload.title = form.title;
      if (form.description !== (original?.description || '')) payload.description = form.description;
      if (form.speaker !== (original?.speaker || '')) payload.speaker = form.speaker;
      if (form.room !== (original?.room || '')) payload.room = form.room;
      if (form.startTime !== toDateTimeLocal(original?.startTime || ''))
        payload.startTime = new Date(form.startTime).toISOString();
      if (form.endTime !== toDateTimeLocal(original?.endTime || ''))
        payload.endTime = new Date(form.endTime).toISOString();
      if (form.maxSeats !== original?.maxSeats) payload.maxSeats = form.maxSeats;
      if (form.price !== original?.price) payload.price = form.price;

      if (Object.keys(payload).length === 0) {
        setError({ message: 'Không có thay đổi nào để cập nhật.' });
        setSubmitting(false);
        return;
      }

      await apiFetch(`/workshops/${workshopId}`, {
        method: 'PATCH',
        token: accessToken,
        body: JSON.stringify(payload),
      });
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ message: 'Đã có lỗi xảy ra khi cập nhật.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Auth guard / Loading ─────────────────────────────────
  if (authLoading || loadingData) {
    return (
      <div className="py-20 text-center text-gray-500">
        <div className="inline-flex items-center gap-2">
          <svg className="h-5 w-5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải thông tin workshop...
        </div>
      </div>
    );
  }

  if (!user || !isOrganizer()) return null;

  const isCancelled = original?.status === 'CANCELLED';

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
      >
        ← Quay lại Dashboard
      </Link>

      <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-8 backdrop-blur-sm">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">✏️ Chỉnh sửa Workshop</h1>
          {original && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                original.status === 'DRAFT'
                  ? 'bg-gray-500/20 text-gray-400'
                  : original.status === 'PUBLISHED'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
              }`}
            >
              {original.status}
            </span>
          )}
        </div>

        {/* Cancelled warning */}
        {isCancelled && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            ⚠️ Workshop này đã bị hủy. Không thể chỉnh sửa.
          </div>
        )}

        {error && (
          <div className="mb-5">
            <ErrorAlert code={error.code} message={error.message} onDismiss={() => setError(null)} />
          </div>
        )}
        {success && (
          <div className="mb-5">
            <SuccessAlert message="Workshop đã được cập nhật thành công! Đang chuyển hướng..." />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="edit-title" className="mb-1 block text-sm font-medium text-gray-400">
              Tiêu đề *
            </label>
            <input
              id="edit-title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              required
              disabled={isCancelled}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              placeholder="VD: Kỹ năng viết CV chuyên nghiệp"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="edit-description" className="mb-1 block text-sm font-medium text-gray-400">
              Mô tả
            </label>
            <textarea
              id="edit-description"
              name="description"
              rows={3}
              value={form.description}
              onChange={handleChange}
              disabled={isCancelled}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              placeholder="Mô tả chi tiết về workshop..."
            />
          </div>

          {/* Speaker + Room */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-speaker" className="mb-1 block text-sm font-medium text-gray-400">
                Diễn giả
              </label>
              <input
                id="edit-speaker"
                name="speaker"
                type="text"
                value={form.speaker}
                onChange={handleChange}
                disabled={isCancelled}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="VD: TS. Nguyễn Văn A"
              />
            </div>
            <div>
              <label htmlFor="edit-room" className="mb-1 block text-sm font-medium text-gray-400">
                🏫 Phòng
              </label>
              <input
                id="edit-room"
                name="room"
                type="text"
                value={form.room}
                onChange={handleChange}
                disabled={isCancelled}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="VD: B.201"
              />
            </div>
          </div>

          {/* Start + End time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-startTime" className="mb-1 block text-sm font-medium text-gray-400">
                🕐 Bắt đầu *
              </label>
              <input
                id="edit-startTime"
                name="startTime"
                type="datetime-local"
                value={form.startTime}
                onChange={handleChange}
                required
                disabled={isCancelled}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="edit-endTime" className="mb-1 block text-sm font-medium text-gray-400">
                🕐 Kết thúc *
              </label>
              <input
                id="edit-endTime"
                name="endTime"
                type="datetime-local"
                value={form.endTime}
                onChange={handleChange}
                required
                disabled={isCancelled}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Max seats + Price */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-maxSeats" className="mb-1 block text-sm font-medium text-gray-400">
                Số chỗ ngồi *
              </label>
              <input
                id="edit-maxSeats"
                name="maxSeats"
                type="number"
                min={1}
                max={500}
                value={form.maxSeats}
                onChange={handleChange}
                required
                disabled={isCancelled}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
              {original && (
                <p className="mt-1 text-xs text-gray-500">
                  Đã đăng ký: {original.maxSeats - original.availableSeats}/{original.maxSeats}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="edit-price" className="mb-1 block text-sm font-medium text-gray-400">
                Giá vé (VND, 0 = miễn phí)
              </label>
              <input
                id="edit-price"
                name="price"
                type="number"
                min={0}
                value={form.price}
                onChange={handleChange}
                disabled={isCancelled}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Change summary */}
          {original && !isCancelled && (
            <div className="rounded-lg border border-white/5 bg-gray-800/50 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Thay đổi sẽ áp dụng</p>
              <ChangeSummary original={original} form={form} />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || isCancelled}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Đang cập nhật...' : '💾 Lưu thay đổi'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Change Summary Component ──────────────────────────────
function ChangeSummary({
  original,
  form,
}: {
  original: Workshop;
  form: { title: string; description: string; speaker: string; room: string; startTime: string; endTime: string; maxSeats: number; price: number };
}) {
  const changes: string[] = [];

  if (form.title !== (original.title || '')) changes.push('Tiêu đề');
  if (form.description !== (original.description || '')) changes.push('Mô tả');
  if (form.speaker !== (original.speaker || '')) changes.push('Diễn giả');
  if (form.room !== (original.room || '')) changes.push(`Phòng: ${original.room || '(trống)'} → ${form.room || '(trống)'}`);
  if (form.startTime !== toDateTimeLocal(original.startTime)) changes.push('Giờ bắt đầu');
  if (form.endTime !== toDateTimeLocal(original.endTime)) changes.push('Giờ kết thúc');
  if (form.maxSeats !== original.maxSeats) changes.push(`Chỗ ngồi: ${original.maxSeats} → ${form.maxSeats}`);
  if (form.price !== original.price) changes.push(`Giá: ${original.price.toLocaleString('vi-VN')}đ → ${form.price.toLocaleString('vi-VN')}đ`);

  if (changes.length === 0) {
    return <p className="text-xs text-gray-500 italic">Chưa có thay đổi nào.</p>;
  }

  return (
    <ul className="space-y-1">
      {changes.map((c) => (
        <li key={c} className="flex items-center gap-2 text-xs text-amber-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          {c}
        </li>
      ))}
    </ul>
  );
}
