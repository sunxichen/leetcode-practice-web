import { NextResponse } from 'next/server';
import { isDeckId } from '@/lib/decks/ids';
import { progressKeyFor } from '@/lib/storage';

function authenticate(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = `Bearer ${process.env.API_SECRET_TOKEN}`;
  return authHeader === expectedToken;
}

/**
 * 从 query 解析题集标识并按白名单 (DECK_IDS) 校验，派生 KV 键名。
 * 非法或缺失标识返回 null → 调用方明确拒绝（400）。绝不回落到默认键：
 * 一次拼错的请求若静默写到 hot100 的键，就会用空文档覆盖真实进度。
 */
function resolveProgressKey(request: Request): string | null {
  const deck = new URL(request.url).searchParams.get('deck');
  if (!isDeckId(deck)) return null;
  return progressKeyFor(deck);
}

export async function GET(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = resolveProgressKey(request);
  if (!key) {
    return NextResponse.json({ error: 'Unknown deck' }, { status: 400 });
  }

  try {
    // Dynamic import to avoid build errors when @vercel/kv is not configured
    const { kv } = await import('@vercel/kv');
    const data = await kv.get(key);
    return NextResponse.json(data ?? { lastUpdatedAt: 0, lastSessionCursor: null, progress: {} });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = resolveProgressKey(request);
  if (!key) {
    return NextResponse.json({ error: 'Unknown deck' }, { status: 400 });
  }

  try {
    const { kv } = await import('@vercel/kv');
    const body = await request.json();
    await kv.set(key, body);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save progress' },
      { status: 500 },
    );
  }
}
