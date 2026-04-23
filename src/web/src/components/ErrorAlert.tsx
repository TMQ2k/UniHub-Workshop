interface ErrorAlertProps {
  code?: string;
  message: string;
  onDismiss?: () => void;
}

const ERROR_LABELS: Record<string, string> = {
  WORKSHOP_FULL: '🚫 Workshop đã hết chỗ',
  PAYMENT_UNAVAILABLE: '⚠️ Thanh toán tạm thời không khả dụng',
  ALREADY_REGISTERED: '📋 Bạn đã đăng ký workshop này',
  SCHEDULE_CONFLICT: '⏰ Trùng lịch với workshop đã đăng ký',
  INVALID_CREDENTIALS: '🔒 Sai thông tin đăng nhập',
  SEAT_HOLD_EXPIRED: '⏱️ Thời gian giữ chỗ đã hết',
};

export default function ErrorAlert({ code, message, onDismiss }: ErrorAlertProps) {
  const label = code ? ERROR_LABELS[code] : undefined;

  return (
    <div className="relative rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {label && <p className="mb-1 font-semibold text-red-200">{label}</p>}
      <p>{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute right-3 top-3 text-red-400 transition-colors hover:text-red-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function SuccessAlert({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
      <p className="font-semibold">✅ {message}</p>
    </div>
  );
}
