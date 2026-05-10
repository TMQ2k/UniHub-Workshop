'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiRequestError } from '@/lib/api';
import ErrorAlert, { SuccessAlert } from '@/components/ErrorAlert';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// ============================================================
// Create Workshop Form — ORGANIZER only
// With PDF upload for AI Summary generation
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

  // PDF upload & AI Summary state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'failed'>('idle');
  const [pollingWorkshopId, setPollingWorkshopId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isOrganizer())) {
      router.push('/login');
    }
  }, [authLoading, user, isOrganizer, router]);

  // Poll for AI summary status after workshop creation + PDF upload
  useEffect(() => {
    if (!pollingWorkshopId || !accessToken || aiStatus !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/workshops/${pollingWorkshopId}/ai-summary`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.status === 'COMPLETED' && json.data.summary) {
            setAiSummary(json.data.summary);
            setAiStatus('completed');
            clearInterval(interval);
          } else if (json.data.status === 'FAILED') {
            setAiStatus('failed');
            clearInterval(interval);
          }
        }
      } catch {
        // Keep polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pollingWorkshopId, accessToken, aiStatus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'maxSeats' || name === 'price' ? Number(value) : value,
    }));
  };

  // ── PDF file selection ────────────────────────────────────
  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setAiSummary(null);
    setAiStatus('idle');
  };

  const removePdf = () => {
    setPdfFile(null);
    setAiSummary(null);
    setAiStatus('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ── Upload PDF to generate AI Summary after workshop creation ──
  const uploadPdfForSummary = async (workshopId: string) => {
    if (!pdfFile || !accessToken) return;

    setAiStatus('uploading');
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);

      const res = await fetch(`${API_BASE}/workshops/${workshopId}/ai-summary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setAiStatus('processing');
        setPollingWorkshopId(workshopId);
      } else {
        setAiStatus('failed');
      }
    } catch {
      setAiStatus('failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      const workshop = await apiFetch<{ id: string }>('/workshops', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({
          ...form,
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
        }),
      });

      setSuccess(true);

      // If PDF was selected, upload it for AI summary
      if (pdfFile && workshop?.id) {
        await uploadPdfForSummary(workshop.id);
        // Don't redirect yet — show summary generation progress
      } else {
        setTimeout(() => router.push('/dashboard'), 1500);
      }
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
        {success && !pdfFile && (
          <div className="mb-5">
            <SuccessAlert message="Workshop đã được tạo! Đang chuyển hướng..." />
          </div>
        )}

        {/* ── PDF Upload Section ─────────────────────────── */}
        <div className="mb-6 rounded-xl border-2 border-dashed border-indigo-500/30 bg-indigo-500/5 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-lg">🤖</span>
            <div>
              <p className="text-sm font-semibold text-white">AI Summary từ PDF</p>
              <p className="text-xs text-gray-500">Upload file PDF giới thiệu workshop để AI tạo bản tóm tắt</p>
            </div>
          </div>

          {!pdfFile ? (
            <>
              <label
                htmlFor="pdf-upload"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30"
              >
                📂 Chọn file PDF
              </label>
              <input
                ref={fileInputRef}
                id="pdf-upload"
                type="file"
                accept=".pdf"
                onChange={handlePdfSelect}
                className="hidden"
              />
            </>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">📄</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{pdfFile.name}</p>
                  <p className="text-xs text-gray-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              {aiStatus === 'idle' && (
                <button
                  type="button"
                  onClick={removePdf}
                  className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  ✕ Xóa
                </button>
              )}
            </div>
          )}

          {pdfFile && aiStatus === 'idle' && (
            <p className="mt-2 text-xs text-gray-500">
              📌 PDF sẽ được upload sau khi tạo workshop. AI sẽ tự động tạo bản tóm tắt.
            </p>
          )}
        </div>

        {/* ── AI Summary Progress (after creation) ──────── */}
        {success && pdfFile && (
          <div className="mb-6 rounded-xl border border-white/10 bg-gray-800/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤖</span>
              <h3 className="text-sm font-semibold text-white">AI Summary</h3>
            </div>

            {aiStatus === 'uploading' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="h-4 w-4 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang upload PDF...
              </div>
            )}

            {aiStatus === 'processing' && (
              <div>
                <div className="flex items-center gap-2 text-sm text-amber-400 mb-3">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  AI đang phân tích và tóm tắt nội dung...
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}

            {aiStatus === 'completed' && aiSummary && (
              <div>
                <div className="flex items-center gap-2 text-sm text-emerald-400 mb-3">
                  ✅ Tóm tắt đã được tạo thành công!
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-4">
                  <p className="text-sm leading-relaxed text-gray-300 whitespace-pre-line">{aiSummary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="mt-4 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
                >
                  ← Quay lại Dashboard
                </button>
              </div>
            )}

            {aiStatus === 'failed' && (
              <div>
                <div className="flex items-center gap-2 text-sm text-red-400 mb-2">
                  ❌ Không thể tạo tóm tắt AI. Bạn có thể thử lại sau trong phần chỉnh sửa workshop.
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="mt-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/20 transition-colors"
                >
                  ← Quay lại Dashboard
                </button>
              </div>
            )}
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
              disabled={success}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
              disabled={success}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
                disabled={success}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
                disabled={success}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
                disabled={success}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
                disabled={success}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
                disabled={success}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
                disabled={success}
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>

          {!success && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Đang tạo...' : pdfFile ? 'Tạo Workshop & Upload PDF' : 'Tạo Workshop'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
