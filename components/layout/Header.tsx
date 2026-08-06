'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useThemeContext } from '@/context/ThemeContext';
import { deckIdFromPathname } from '@/lib/decks/routes';
import { getDeckMeta } from '@/lib/decks/meta';
import styles from './Header.module.css';

/** 头部品牌位 — 路径感知（票 12）：在某题集内显示该题集名并可点击返回首页；
 * 首页显示应用名且不可点。路由映射走 deckIdFromPathname 纯函数。 */
export function Header() {
  const { theme, toggleTheme } = useThemeContext();
  const pathname = usePathname();
  const deckId = deckIdFromPathname(pathname);
  const meta = deckId ? getDeckMeta(deckId) : null;

  const brand = meta ? (
    <Link href="/" className={styles.brand}>
      <span className={styles.logo}>LC</span>
      <span className={styles.title}>{meta.name}</span>
    </Link>
  ) : (
    <div className={styles.brand}>
      <span className={styles.logo}>LC</span>
      <span className={styles.title}>LeetCode</span>
    </div>
  );

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {brand}
        <div className={styles.actions}>
          <motion.button
            className={styles.iconButton}
            onClick={toggleTheme}
            whileTap={{ scale: 0.9 }}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </motion.button>
        </div>
      </div>
    </header>
  );
}
