'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import styles from './UndoToast.module.css';

interface UndoToastProps {
  visible: boolean;
  message: string;
  /** Absolute ms timestamp at which the toast will auto-dismiss. */
  expiresAt: number;
  onUndo: () => void;
  onDismiss: () => void;
}

/**
 * Toast with an "撤销" action and a thin progress bar showing the remaining undo window.
 * Self-dismisses at `expiresAt`.
 */
export function UndoToast({ visible, message, expiresAt, onUndo, onDismiss }: UndoToastProps) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!visible) return;
    const startedAt = Date.now();
    const total = Math.max(1, expiresAt - startedAt);
    let raf = 0;
    const tick = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setProgress(remaining / total);
      if (remaining <= 0) {
        onDismiss();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, expiresAt, onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.toast}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <span className={styles.message}>{message}</span>
          <button className={styles.undoButton} onClick={onUndo}>
            撤销
          </button>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
