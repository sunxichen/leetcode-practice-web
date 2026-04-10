import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeetCode 复习',
  description: 'LeetCode 抽卡式间隔重复学习工具',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}

import { ClientProviders } from './providers';
