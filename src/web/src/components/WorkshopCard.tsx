import Link from 'next/link';
import type { Workshop } from '@/lib/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WorkshopCard({ workshop }: { workshop: Workshop }) {
  const isFree = workshop.price === 0;
  const seatPercent = workshop.maxSeats > 0
    ? Math.round((workshop.availableSeats / workshop.maxSeats) * 100)
    : 0;
  const isFull = workshop.availableSeats <= 0;

  return (
    <Link
      href={`/workshops/${workshop.id}`}
      className="group block rounded-2xl border border-white/10 bg-gray-900/60 p-5 backdrop-blur-sm transition-all duration-200 hover:border-indigo-500/40 hover:bg-gray-900/80 hover:shadow-lg hover:shadow-indigo-500/5"
    >
      {/* Header: badges */}
      <div className="mb-3 flex items-center gap-2">
        {isFree ? (
          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            Miễn phí
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            {workshop.price.toLocaleString('vi-VN')}đ
          </span>
        )}
        {isFull && (
          <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400">
            Hết chỗ
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mb-2 text-lg font-semibold text-white transition-colors group-hover:text-indigo-300">
        {workshop.title}
      </h3>

      {/* Meta */}
      <div className="mb-3 space-y-1 text-sm text-gray-400">
        {workshop.speaker && (
          <p className="flex items-center gap-1.5">
            <span className="text-base">🎤</span>
            {workshop.speaker}
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <span className="text-base">📅</span>
          {formatDate(workshop.startTime)} · {formatTime(workshop.startTime)} – {formatTime(workshop.endTime)}
        </p>
        {workshop.room && (
          <p className="flex items-center gap-1.5">
            <span className="text-base">📍</span>
            {workshop.room}
          </p>
        )}
      </div>

      {/* Seats bar */}
      <div className="mt-auto">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>Còn {workshop.availableSeats}/{workshop.maxSeats} chỗ</span>
          <span>{seatPercent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full transition-all ${
              seatPercent > 50
                ? 'bg-emerald-500'
                : seatPercent > 20
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${seatPercent}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
