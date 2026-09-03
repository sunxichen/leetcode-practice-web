'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  // 首渲必须与 SSR 恒定的 'light' 一致：useState 惰性初始化读 localStorage，
  // 存了深色主题的浏览器在水合时就会与 HTML 不匹配，React 丢树重建——重建
  // 窗口期内的一次自评点击会落在重挂载前的 DOM 上（2026-09-03 本地实刷卡死）。
  // 真实主题在 mount 后同步；<head> 的 theme-init 内联脚本先行设置 data-theme，
  // 深色用户不白闪，这里的 setTheme 同步到同一个值，属性副作用是无操作。
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
