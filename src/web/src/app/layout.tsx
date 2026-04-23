import type { Metadata } from 'next';
import './globals.css';
import ClientProviders from './client-providers';

export const metadata: Metadata = {
  title: 'UniHub Workshop — Tuần lễ Kỹ năng và Nghề nghiệp',
  description:
    'Đăng ký workshop, check-in bằng QR, quản lý sự kiện cho Tuần lễ Kỹ năng và Nghề nghiệp tại Trường Đại học A.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
