'use client';

import { AuthProvider } from '@/lib/auth-context';
import Navbar from '@/components/Navbar';

/**
 * Client-side providers wrapper — keeps RootLayout as a Server Component.
 */
export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </AuthProvider>
  );
}
