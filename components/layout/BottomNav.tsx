'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { deckIdFromPathname, navItemsForDeck, type DeckNavItem } from '@/lib/decks/routes';
import styles from './BottomNav.module.css';

/** 学习 / 题库 两个 tab 的图标（按导航项 label 取值，与推导出的项对应）。 */
const ICONS: Record<DeckNavItem['label'], ReactNode> = {
  学习: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  题库: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
};

/**
 * 底部导航 — 路径感知（票 12）：由 deckIdFromPathname(usePathname()) 决定
 * 当前题集，取该题集的导航项（「学习」+ 可选「题库」）。
 * 首页（deckId 为 null）完全不渲染底部导航。
 */
export function BottomNav() {
  const pathname = usePathname();
  const deckId = deckIdFromPathname(pathname);
  const items = navItemsForDeck(deckId);

  if (items.length === 0) return null;

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className={styles.link}>
              <motion.div
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                whileTap={{ scale: 0.95 }}
              >
                <span className={styles.icon}>{ICONS[item.label]}</span>
                <span className={styles.label}>{item.label}</span>
                {isActive && (
                  <motion.div
                    className={styles.indicator}
                    layoutId="bottomNavIndicator"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
