'use client';

import styles from './TagChip.module.css';

export function TagChip({ tag }: { tag: string }) {
  return <span className={styles.chip}>{tag}</span>;
}
