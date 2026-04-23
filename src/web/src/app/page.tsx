import type { Metadata } from 'next';
import type { Workshop, ApiResponse } from '@/lib/types';
import WorkshopCard from '@/components/WorkshopCard';

export const metadata: Metadata = {
  title: 'Danh sách Workshop — UniHub',
  description: 'Khám phá và đăng ký các workshop trong Tuần lễ Kỹ năng và Nghề nghiệp.',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

interface WorkshopListResponse {
  success: boolean;
  data: Workshop[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    timestamp: string;
  };
}

async function getWorkshops(page: number = 1): Promise<WorkshopListResponse> {
  const res = await fetch(`${API_BASE}/workshops?page=${page}&limit=20`, {
    next: { revalidate: 30 }, // ISR: revalidate every 30s
  });

  if (!res.ok) {
    // Return empty data on error — page still renders
    return {
      success: false,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0, timestamp: new Date().toISOString() },
    };
  }

  return res.json();
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const result = await getWorkshops(page);
  const workshops = result.data;
  const meta = result.meta;

  return (
    <>
      {/* Hero */}
      <section className="mb-10 text-center">
        <h1 className="mb-3 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-4xl font-bold text-transparent">
          Tuần lễ Kỹ năng &amp; Nghề nghiệp
        </h1>
        <p className="mx-auto max-w-xl text-gray-400">
          Khám phá các workshop, đăng ký tham gia và nhận QR check-in ngay hôm nay.
        </p>
      </section>

      {/* Workshop Grid */}
      {workshops.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-gray-900/40 py-20 text-center">
          <p className="text-lg text-gray-500">Chưa có workshop nào được công bố.</p>
          <p className="mt-1 text-sm text-gray-600">Vui lòng quay lại sau nhé!</p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {workshops.map((w) => (
              <WorkshopCard key={w.id} workshop={w} />
            ))}
          </div>

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2">
              {page > 1 && (
                <a
                  href={`/?page=${page - 1}`}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/20"
                >
                  ← Trước
                </a>
              )}
              <span className="px-3 text-sm text-gray-500">
                Trang {meta.page} / {meta.totalPages}
              </span>
              {page < meta.totalPages && (
                <a
                  href={`/?page=${page + 1}`}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/20"
                >
                  Tiếp →
                </a>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
