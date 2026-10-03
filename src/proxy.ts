/**
 * Proxy Next.js 16 (pengganti middleware): rate limiting + proteksi CSRF
 * untuk seluruh /api/*.
 *
 * - Rate limit: sliding window per IP (in-memory, per instance).
 *   Umum: 120 req/menit; login: 15 req/menit (anti brute-force).
 * - CSRF: request non-GET ke /api/* wajib membawa Origin/Referer yang
 *   cocok dengan host — kecuali /api/telegram/webhook (dipanggil server
 *   Telegram tanpa Origin; diamankan via pairing code HMAC).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------- Rate limiting (in-memory sliding window) ----------------

const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;

function rateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  // batasi ukuran map agar tidak bocor memori
  if (hits.size > 5000) {
    const oldest = [...hits.keys()].slice(0, 1000);
    for (const k of oldest) hits.delete(k);
  }
  return true;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ---------------- CSRF ----------------

const CSRF_EXEMPT = ["/api/telegram/webhook"];

function csrfOk(req: NextRequest): boolean {
  const path = req.nextUrl.pathname;
  if (CSRF_EXEMPT.some((p) => path === p || path.startsWith(p + "/"))) return true;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const check = (v: string | null): boolean => {
    if (!v) return false;
    try {
      return new URL(v).host === host;
    } catch {
      return false;
    }
  };
  // Browser selalu mengirim Origin pada fetch POST; tolak bila ada tapi tidak cocok.
  // Bila keduanya absen (non-browser), tolak juga kecuali exempt di atas.
  return check(origin) || check(referer);
}

// ---------------- Proxy utama ----------------

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ip = clientIp(req);

  // Rate limit khusus login (anti brute-force)
  if (path === "/api/auth/login") {
    if (!rateLimit(`login:${ip}`, 15)) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan login. Coba lagi sebentar." } },
        { status: 429 },
      );
    }
  } else if (!rateLimit(`api:${ip}`, 120)) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi sebentar." } },
      { status: 429 },
    );
  }

  // CSRF untuk request yang mengubah data
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    if (!csrfOk(req)) {
      return NextResponse.json(
        { ok: false, error: { code: "CSRF_BLOCKED", message: "Permintaan ditolak (CSRF)." } },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
