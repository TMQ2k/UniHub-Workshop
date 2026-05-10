"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import ErrorAlert from "@/components/ErrorAlert";
import { ApiRequestError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ code?: string; message: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(studentId, password);
      router.push("/");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError({ code: err.code, message: err.message });
      } else if (err instanceof Error) {
        setError({ message: err.message });
      } else {
        setError({ message: "Đã có lỗi xảy ra. Vui lòng thử lại." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-8 backdrop-blur-sm">
          <h1 className="mb-6 text-center text-2xl font-bold text-white">
            Đăng nhập
          </h1>

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
            <div>
              <label
                htmlFor="studentId"
                className="mb-1 block text-sm font-medium text-gray-400"
              >
                MSSV
              </label>
              <input
                id="studentId"
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="VD: SV001"
              />
              <p className="mt-1 text-xs text-gray-500">
                Mã số sinh viên được cấp từ hệ thống trường
              </p>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-gray-400"
              >
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="VD: SV001@unihub"
              />
              <p className="mt-1 text-xs text-gray-500">
                Mật khẩu mặc định:{" "}
                <code className="rounded bg-gray-800 px-1 text-indigo-400">
                  MSSV@unihub
                </code>{" "}
                (VD: SV001@unihub)
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Đang xử lý..." : "Đăng nhập"}
            </button>
          </form>

          {/* Info note */}
          <div className="mt-5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
            <p className="text-xs leading-relaxed text-gray-400">
              <span className="font-semibold text-indigo-400">ℹ️ Lưu ý:</span>{" "}
              Tài khoản sinh viên được đồng bộ tự động từ hệ thống quản lý đào
              tạo. Nếu bạn chưa có tài khoản, vui lòng liên hệ phòng đào tạo để
              được hỗ trợ.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
