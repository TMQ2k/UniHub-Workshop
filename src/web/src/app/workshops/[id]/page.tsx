import type { Metadata } from 'next';
import type { Workshop } from '@/lib/types';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

async function getWorkshop(id: string): Promise<Workshop | null> {
  const res = await fetch(`${API_BASE}/workshops/${id}`, {
    next: { revalidate: 15 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const workshop = await getWorkshop(id);
  return {
    title: workshop ? `${workshop.title} — UniHub` : 'Workshop — UniHub',
    description: workshop?.description?.slice(0, 160) || 'Chi tiết workshop.',
  };
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function WorkshopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workshop = await getWorkshop(id);

  if (!workshop) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-white">Workshop không tồn tại</h1>
        <Link href="/" className="mt-4 inline-block text-indigo-400 hover:underline">
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  const isFree = workshop.price === 0;
  const isFull = workshop.availableSeats <= 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white">
        ← Quay lại danh sách
      </Link>

      {/* Card */}
      <article className="rounded-2xl border border-white/10 bg-gray-900/60 p-8 backdrop-blur-sm">
        {/* Badges */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {isFree ? (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-400">
              Miễn phí
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-400">
              {workshop.price.toLocaleString('vi-VN')}đ
            </span>
          )}
          <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-400 uppercase">
            {workshop.status}
          </span>
          {isFull && (
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-400">
              Hết chỗ
            </span>
          )}
        </div>

        <h1 className="mb-4 text-3xl font-bold text-white">{workshop.title}</h1>

        {/* Meta grid */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {workshop.speaker && (
            <div className="flex items-start gap-2 text-gray-300">
              <span className="mt-0.5 text-lg">🎤</span>
              <div>
                <p className="text-xs text-gray-500">Diễn giả</p>
                <p className="font-medium">{workshop.speaker}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 text-gray-300">
            <span className="mt-0.5 text-lg">📅</span>
            <div>
              <p className="text-xs text-gray-500">Thời gian</p>
              <p className="font-medium">{formatDateTime(workshop.startTime)}</p>
              <p className="text-sm text-gray-400">→ {formatDateTime(workshop.endTime)}</p>
            </div>
          </div>
          {workshop.room && (
            <div className="flex items-start gap-2 text-gray-300">
              <span className="mt-0.5 text-lg">📍</span>
              <div>
                <p className="text-xs text-gray-500">Phòng</p>
                <p className="font-medium">{workshop.room}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 text-gray-300">
            <span className="mt-0.5 text-lg">💺</span>
            <div>
              <p className="text-xs text-gray-500">Chỗ ngồi</p>
              <p className="font-medium">
                {workshop.availableSeats} / {workshop.maxSeats} còn trống
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        {workshop.description && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">Mô tả</h2>
            <p className="whitespace-pre-line leading-relaxed text-gray-300">{workshop.description}</p>
          </div>
        )}

        {/* CTA */}
        {workshop.status === 'PUBLISHED' && !isFull && (
          <Link
            href={`/workshops/${workshop.id}/register`}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/40 hover:brightness-110"
          >
            Đăng ký ngay →
          </Link>
        )}
        {isFull && (
          <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Workshop này đã hết chỗ. Vui lòng theo dõi để biết khi có chỗ trống.
          </p>
        )}
      </article>
    </div>
  );
}
