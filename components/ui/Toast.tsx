'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Toast.module.css';

interface ToastProps {
  message: string;
  visible: boolean;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, visible, onClose, duration = 2000 }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, onClose, duration]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.toast}
          initial={{ opacity: 0, y: -20, x: 20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
