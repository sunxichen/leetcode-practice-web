import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/kv', () => ({
  kv: { get: vi.fn(), set: vi.fn() },
}));

import { kv } from '@vercel/kv';
import { GET, POST } from '@/app/api/progress/route';

/**
 * API 侧白名单校验（票 5 验收：非法标识被拒绝而不是落到默认键）。
 * 客户端 (lib/storage.ts) 与服务端（本路由）两侧都校验；本文件钉死服务端：
 * 非法标识 400 且完全不触碰 KV，合法标识用逐字节相同的历史键名读写。
 */

const kvGet = vi.mocked(kv.get);
const kvSet = vi.mocked(kv.set);

const TOKEN = 'test-token';

function authedRequest(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${TOKEN}`);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

beforeEach(() => {
  process.env.API_SECRET_TOKEN = TOKEN;
  kvGet.mockReset();
  kvSet.mockReset();
});

describe('/api/progress 题集标识白名单', () => {
  it('缺少 deck 参数 → 400，不触碰 KV', async () => {
    const res = await GET(authedRequest('/api/progress'));
    expect(res.status).toBe(400);
    expect(kvGet).not.toHaveBeenCalled();
  });

  it('非法 deck（拼错 / 大小写 / 带空格 / 未注册）→ 400，不触碰 KV', async () => {
    for (const bad of ['hot100x', 'HOT100', 'hot100%20', 'interview', '']) {
      const res = await GET(authedRequest(`/api/progress?deck=${bad}`));
      expect(res.status, `deck=${bad} should be rejected`).toBe(400);
    }
    expect(kvGet).not.toHaveBeenCalled();
  });

  it('GET deck=hot100 → 用逐字节相同的历史键名读 KV', async () => {
    kvGet.mockResolvedValue(null);
    const res = await GET(authedRequest('/api/progress?deck=hot100'));
    expect(res.status).toBe(200);
    expect(kvGet).toHaveBeenCalledTimes(1);
    expect(kvGet).toHaveBeenCalledWith('user_progress:hot100');
  });

  it('GET 返回 KV 中的文档；KV 为空时返回初始结构', async () => {
    const stored = { lastUpdatedAt: 123, lastSessionCursor: null, progress: { q: { state: 'review' } } };
    kvGet.mockResolvedValue(stored);
    const res = await GET(authedRequest('/api/progress?deck=hot100'));
    expect(await res.json()).toEqual(stored);

    kvGet.mockResolvedValue(null);
    const empty = await GET(authedRequest('/api/progress?deck=hot100'));
    expect(await empty.json()).toEqual({ lastUpdatedAt: 0, lastSessionCursor: null, progress: {} });
  });

  it('POST deck=hot100 → 用同一键名写 KV', async () => {
    kvSet.mockResolvedValue(undefined);
    const body = { lastUpdatedAt: 1, lastSessionCursor: null, progress: {} };
    const res = await POST(
      authedRequest('/api/progress?deck=hot100', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    expect(kvSet).toHaveBeenCalledTimes(1);
    expect(kvSet.mock.calls[0][0]).toBe('user_progress:hot100');
    expect(kvSet.mock.calls[0][1]).toEqual(body);
  });

  it('POST 非法 deck → 400，不触碰 KV', async () => {
    const res = await POST(
      authedRequest('/api/progress?deck=nope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(400);
    expect(kvSet).not.toHaveBeenCalled();
  });

  it('未认证 → 401，不触碰 KV', async () => {
    const res = await GET(new Request('http://localhost/api/progress?deck=hot100'));
    expect(res.status).toBe(401);
    expect(kvGet).not.toHaveBeenCalled();
  });
});
