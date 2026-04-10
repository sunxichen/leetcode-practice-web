import { NextResponse } from 'next/server';

const KV_KEY = 'user_progress:hot100';

function authenticate(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = `Bearer ${process.env.API_SECRET_TOKEN}`;
  return authHeader === expectedToken;
}

export async function GET(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Dynamic import to avoid build errors when @vercel/kv is not configured
    const { kv } = await import('@vercel/kv');
    const data = await kv.get(KV_KEY);
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

  try {
    const { kv } = await import('@vercel/kv');
    const body = await request.json();
    await kv.set(KV_KEY, body);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save progress' },
      { status: 500 },
    );
  }
}
