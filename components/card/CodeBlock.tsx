'use client';

import { useState, useCallback } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { useThemeContext } from '@/context/ThemeContext';
import styles from './CodeBlock.module.css';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language = 'python' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useThemeContext();

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.language}>{language}</span>
        <button className={styles.copyButton} onClick={handleCopy}>
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              已复制
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              复制
            </>
          )}
        </button>
      </div>
      <Highlight
        theme={theme === 'dark' ? themes.nightOwl : themes.nightOwlLight}
        code={code.trim()}
        language={language}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} ${styles.pre}`} style={{ ...style, background: 'transparent' }}>
            <code className={styles.code}>
              {tokens.map((line, i) => {
                const { key: _lineKey, ...restLineProps } = getLineProps({ line });
                return (
                  <div key={i} {...restLineProps} className={styles.line}>
                    <span className={styles.lineNumber}>{i + 1}</span>
                    <span className={styles.lineContent}>
                      {line.map((token, j) => {
                        const { key: _tokenKey, ...restTokenProps } = getTokenProps({ token });
                        return <span key={j} {...restTokenProps} />;
                      })}
                    </span>
                  </div>
                );
              })}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}
