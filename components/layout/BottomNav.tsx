'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  {
    label: '学习',
    href: '/study',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    label: '题库',
    href: '/browse',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className={styles.link}>
              <motion.div
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                whileTap={{ scale: 0.95 }}
              >
                <span className={styles.icon}>{item.icon}</span>
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
