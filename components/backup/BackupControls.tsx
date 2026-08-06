'use client';

import { useRef, useState } from 'react';
import { DECK_IDS } from '@/lib/decks/ids';
import { progressKeyFor } from '@/lib/storage';
import styles from './BackupControls.module.css';

/** 备份文件结构版本。改结构时递增，导入方可据此拒绝不兼容的旧文件。 */
const BACKUP_VERSION = 1;

interface BackupFile {
  version: number;
  exportedAt: number;
  /** 每个题集一份进度文档（键即题集标识）。 */
  decks: Record<string, unknown>;
}

/** 一份进度文档至少要有 progress 对象才算“可识别”，否则不写入（避免用垃圾覆盖）。 */
function isProgressDoc(doc: unknown): doc is { progress: Record<string, unknown> } {
  return (
    !!doc &&
    typeof doc === 'object' &&
    !Array.isArray(doc) &&
    'progress' in doc &&
    typeof (doc as { progress: unknown }).progress === 'object'
  );
}

/**
 * 本地备份的导出 / 导入（防丢：清浏览器数据前先导出一份，任何时候都能导回）。
 *
 * 导出：把每个题集的 localStorage 进度文档（user_progress:<deck>）打包成一个
 * JSON 文件下载。导入：读文件、按题集写回 localStorage，并把文档级同步时间戳
 * lastUpdatedAt 顶到当前时刻——这样“恢复备份”会在下次加载的双源归并里胜出并
 * 回写远端（远端存储模式下也能一键铺到云端），符合“以这份备份为准”的意图。
 *
 * 同时兼容两种导入文件：本组件导出的多题集备份，以及一份裸的 hot100 进度文档
 * （历史手动快照）——后者按 hot100 处理。
 */
export function BackupControls() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleExport() {
    try {
      const decks: Record<string, unknown> = {};
      for (const id of DECK_IDS) {
        const raw = localStorage.getItem(progressKeyFor(id));
        if (raw) decks[id] = JSON.parse(raw);
      }
      const payload: BackupFile = { version: BACKUP_VERSION, exportedAt: Date.now(), decks };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leetcode-progress-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const n = Object.keys(decks).length;
      setMessage(n > 0 ? `已导出 ${n} 个题集的进度` : '当前没有可导出的进度');
    } catch {
      setMessage('导出失败');
    }
  }

  async function handleImport(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      // 多题集备份取 .decks；否则把整份当作一份裸 hot100 文档（历史快照）。
      const decks: Record<string, unknown> =
        parsed && typeof parsed === 'object' && 'decks' in parsed && typeof (parsed as BackupFile).decks === 'object'
          ? (parsed as BackupFile).decks
          : { hot100: parsed };

      let restored = 0;
      for (const id of DECK_IDS) {
        const doc = decks[id];
        if (!isProgressDoc(doc)) continue;
        // 顶时间戳，让恢复在归并里胜出（本地纯存储与远端模式都适用）。
        const bumped = { ...doc, lastUpdatedAt: Date.now() };
        localStorage.setItem(progressKeyFor(id), JSON.stringify(bumped));
        restored++;
      }

      if (restored === 0) {
        setMessage('文件里没有可识别的进度');
        return;
      }
      setMessage(`已导入 ${restored} 个题集，正在刷新…`);
      setTimeout(() => window.location.reload(), 700);
    } catch {
      setMessage('导入失败：不是合法的备份 JSON');
    }
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.row}>
        <button type="button" className={styles.button} onClick={handleExport}>
          导出备份
        </button>
        <button type="button" className={styles.button} onClick={() => fileRef.current?.click()}>
          导入备份
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className={styles.fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className={styles.hint}>
        {message ?? '清浏览器数据前先导出一份，换设备或误清后可一键导回。'}
      </p>
    </section>
  );
}
