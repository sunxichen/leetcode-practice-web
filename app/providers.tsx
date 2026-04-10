'use client';

import { ThemeProvider } from '@/context/ThemeContext';
import { ProgressProvider } from '@/context/ProgressContext';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ProgressProvider>
        <Header />
        <main className="app-container">{children}</main>
        <BottomNav />
      </ProgressProvider>
    </ThemeProvider>
  );
}
